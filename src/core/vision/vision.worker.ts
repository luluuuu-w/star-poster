/**
 * 图像分析 worker：一次调用同时完成取色聚类和显著性分析。
 *
 * 合在一个 worker 里是有意的 —— 两者都需要把图降采样成像素数组，
 * 分开做等于把同一张图解码两遍。
 */

import { kmeans } from '../color/kmeans'
import { buildPalette } from '../color/palette'
import { rgbToOklab, type Lab } from '../color/oklab'
import { analyze, ANALYSIS_SIZE } from './saliency'
import type { ImageAnalysis, Palette } from '../model/types'

export interface AnalyzeRequest {
  id: number
  bitmap: ImageBitmap
}

export interface AnalyzeResponse {
  id: number
  palette?: Palette
  analysis?: ImageAnalysis
  error?: string
}

/** 取色用的降采样尺寸。比显著性分析小一点，聚类是这里最贵的一步。 */
const COLOR_SIZE = 96

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  const { id, bitmap } = e.data

  try {
    const sourceAspect = bitmap.width / bitmap.height

    // --- 显著性用的采样（保持宽高比，长边 ANALYSIS_SIZE）
    const visionPixels = drawToPixels(bitmap, ANALYSIS_SIZE)
    const analysis = analyze(
      visionPixels.data,
      visionPixels.w,
      visionPixels.h,
      sourceAspect,
    )

    // --- 取色采样
    const colorPixels = drawToPixels(bitmap, COLOR_SIZE)
    const points = collectPoints(colorPixels.data, colorPixels.w * colorPixels.h)
    const clusters = kmeans(points, { k: 6, seed: 0x5eed })
    const palette = buildPalette(clusters, 'faithful')

    bitmap.close()

    const res: AnalyzeResponse = { id, palette, analysis }
    self.postMessage(res)
  } catch (err) {
    bitmap.close()
    const res: AnalyzeResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(res)
  }
}

/** 按长边缩放到 maxSide，画进 OffscreenCanvas 取像素。 */
function drawToPixels(
  bitmap: ImageBitmap,
  maxSide: number,
): { data: Uint8ClampedArray; w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建 OffscreenCanvas 上下文')

  ctx.drawImage(bitmap, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, w, h }
}

/**
 * 像素转 OKLab 点集，顺带过滤。
 *
 * 过滤两类像素：
 * - 半透明像素（alpha < 128）：PNG 抠图的边缘，颜色是脏的。
 * - 近纯黑/近纯白：多半是背景、暗角或过曝，参与聚类会挤掉真正的主体色。
 *   但如果过滤后剩得太少（比如高调白背景写真），就退回不过滤。
 */
function collectPoints(data: Uint8ClampedArray, n: number): Lab[] {
  const filtered: Lab[] = []
  const all: Lab[] = []

  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3]
    if (a < 128) continue

    const lab = rgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    all.push(lab)

    if (lab[0] > 0.12 && lab[0] < 0.95) {
      filtered.push(lab)
    }
  }

  // 过滤太狠就用全量，宁可色板里混进黑白，也不能没有色
  return filtered.length >= Math.max(64, all.length * 0.15) ? filtered : all
}
