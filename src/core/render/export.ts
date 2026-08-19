/**
 * 导出。
 *
 * 两个必须注意的点：
 * 1. 导出前一定要 await 字体加载，否则 Konva 用回退字体测量文本，导出图的
 *    换行位置和实际预览对不上。
 * 2. Stage 在屏幕上是缩放显示的（scale < 1），导出要按「原始画布尺寸 x 倍数」
 *    算 pixelRatio，不能直接用倍数。
 */

import type Konva from 'konva'
import type { PosterDoc } from '../model/types'
import { flattenLayers } from '../model/doc'
import { ensureFontsLoaded } from '../fonts/loader'

export type ExportFormat = 'png' | 'jpg'

export interface ExportOptions {
  format: ExportFormat
  /** 相对文档画布尺寸的倍数。2 = 2160x2700。 */
  scale: number
  /** JPG 质量 0~1，PNG 忽略。 */
  quality?: number
}

/** 常用尺寸预设。 */
export interface SizePreset {
  id: string
  name: string
  width: number
  height: number
  hint: string
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'xhs', name: '小红书竖图', width: 1080, height: 1350, hint: '3:4，最常用' },
  { id: 'story', name: '竖屏故事', width: 1080, height: 1920, hint: '9:16，全屏' },
  { id: 'square', name: '方图', width: 1080, height: 1080, hint: '1:1' },
  { id: 'wb', name: '微博配图', width: 1200, height: 1600, hint: '3:4，稍大' },
  { id: 'a3', name: 'A3 印刷', width: 3508, height: 4961, hint: '300dpi，可打印' },
]

/**
 * 把 Stage 导出成 Blob。
 *
 * @param stage Konva Stage 实例。
 * @param doc 用于取原始画布尺寸和字体清单。
 */
export async function exportPoster(
  stage: Konva.Stage,
  doc: PosterDoc,
  options: ExportOptions,
): Promise<Blob> {
  // 收集文档实际用到的字体，只等这些，别等全部
  const fontIds = new Set<string>()
  for (const l of flattenLayers(doc.layers)) {
    if (l.type === 'text') fontIds.add(l.fontId)
  }
  await ensureFontsLoaded([...fontIds])

  // 字体到位后强制重画一次，让 Konva 用正确的字体重新测量
  stage.batchDraw()

  // Stage 当前是按显示宽度缩放的，要换算回「文档尺寸 x scale」
  const currentScale = stage.scaleX() || 1
  const pixelRatio = (options.scale / currentScale)

  const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg'

  return new Promise((resolve, reject) => {
    stage.toBlob({
      mimeType,
      quality: options.format === 'jpg' ? (options.quality ?? 0.92) : undefined,
      pixelRatio,
      callback: (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('导出失败：画布可能过大，试试降低倍数'))
      },
    } as Parameters<Konva.Stage['toBlob']>[0])
  })
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 会让部分浏览器的下载中断，延后一点
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 生成安全的文件名（去掉路径分隔符等非法字符）。 */
export function safeFilename(name: string, ext: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim() || '海报'
  return `${cleaned}.${ext}`
}

/**
 * 生成列表页用的小缩略图。
 *
 * 用 pixelRatio 而不是先导大图再缩，省一次全尺寸绘制 —— 大画布下差别很明显。
 */
export function makeThumbnail(stage: Konva.Stage, doc: PosterDoc, maxSide = 320): string {
  const currentScale = stage.scaleX() || 1
  const targetScale = maxSide / Math.max(doc.canvas.width, doc.canvas.height)
  return stage.toDataURL({
    mimeType: 'image/jpeg',
    quality: 0.72,
    pixelRatio: targetScale / currentScale,
  })
}
