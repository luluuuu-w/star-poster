/**
 * 显著性分析 —— 不依赖任何模型文件，纯图像处理找出「人在哪、哪里能放字」。
 *
 * 三路信号加权：
 * 1. 色彩对比：像素与全图均值的 OKLab 距离。人像主体通常和背景色调不同。
 * 2. 边缘密度：Sobel 梯度。脸、头发、衣服褶皱边缘多；纯色背景/天空边缘少。
 * 3. 中心先验：人像照片九成把人放在中间偏上。这一路是弱先验，权重最低，
 *    但能有效压掉角落的干扰（比如背景里的一盏灯）。
 *
 * 输出的 subject 框喂给版型匹配，emptiness 网格决定文字往哪放。
 */

import type { Frame, ImageAnalysis } from '../model/types'
import { rgbToOklab } from '../color/oklab'

/** 分析用的降采样尺寸。够精确，且一次分析在毫秒级。 */
export const ANALYSIS_SIZE = 128

export interface SaliencyResult {
  /** 归一化到 0~1 的显著性图，行优先，尺寸 w x h。 */
  map: Float32Array
  w: number
  h: number
}

/**
 * 计算显著性图。
 * @param data 降采样后的 RGBA 像素。
 */
export function computeSaliency(data: Uint8ClampedArray, w: number, h: number): SaliencyResult {
  const n = w * h

  // 先整图转 OKLab，后面色彩对比和边缘都用得上，只转一次
  const L = new Float32Array(n)
  const A = new Float32Array(n)
  const B = new Float32Array(n)

  let meanL = 0
  let meanA = 0
  let meanB = 0

  for (let i = 0; i < n; i++) {
    const lab = rgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    L[i] = lab[0]
    A[i] = lab[1]
    B[i] = lab[2]
    meanL += lab[0]
    meanA += lab[1]
    meanB += lab[2]
  }
  meanL /= n
  meanA /= n
  meanB /= n

  // --- 1. 色彩对比
  const contrast = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    contrast[i] = Math.hypot(L[i] - meanL, A[i] - meanA, B[i] - meanB)
  }

  // --- 2. Sobel 边缘（只在 L 通道上算，够用且快）
  const edge = new Float32Array(n)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = L[i - w - 1], tc = L[i - w], tr = L[i - w + 1]
      const ml = L[i - 1], mr = L[i + 1]
      const bl = L[i + w - 1], bc = L[i + w], br = L[i + w + 1]

      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl)
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
      edge[i] = Math.hypot(gx, gy)
    }
  }
  // 边缘密度：对梯度做一次盒式模糊，把「一条线」摊成「一片区域」，
  // 否则主体框会只框住轮廓线而不是整个主体
  const edgeBlur = boxBlur(edge, w, h, 3)

  // --- 3. 中心先验（椭圆高斯）
  const center = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1) - 0.5) / 0.5
      // 中心偏上：人像的脸通常在垂直方向 0.35 左右
      const ny = (y / (h - 1) - 0.38) / 0.55
      center[y * w + x] = Math.exp(-(nx * nx + ny * ny) * 1.1)
    }
  }

  normalize(contrast)
  normalize(edgeBlur)

  const map = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    map[i] = 0.45 * contrast[i] + 0.4 * edgeBlur[i] + 0.15 * center[i]
  }
  normalize(map)

  return { map, w, h }
}

/** 原地归一化到 0~1。 */
function normalize(arr: Float32Array): void {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i]
    if (arr[i] > max) max = arr[i]
  }
  const range = max - min
  if (range < 1e-6) {
    arr.fill(0)
    return
  }
  for (let i = 0; i < arr.length; i++) {
    arr[i] = (arr[i] - min) / range
  }
}

/** 可分离盒式模糊，半径 r。两趟一维，比二维卷积快得多。 */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)

  // 横向
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let d = -r; d <= r; d++) {
        const xx = x + d
        if (xx < 0 || xx >= w) continue
        sum += src[y * w + xx]
        count++
      }
      tmp[y * w + x] = sum / count
    }
  }

  // 纵向
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let d = -r; d <= r; d++) {
        const yy = y + d
        if (yy < 0 || yy >= h) continue
        sum += tmp[yy * w + x]
        count++
      }
      out[y * w + x] = sum / count
    }
  }

  return out
}

/**
 * 从显著性图里提取主体包围盒。
 *
 * 做法：取显著性最高的 topRatio 比例的像素，但不直接取它们的极值包围盒
 * ——那样一个孤立噪点就能把框拉到整张图。改用行/列投影的分位数：把显著
 * 像素在每行每列上累加，然后砍掉首尾各 5% 的质量，剩下的范围才是主体。
 */
export function extractSubject(sal: SaliencyResult, topRatio = 0.18): Frame {
  const { map, w, h } = sal
  const n = w * h

  // 找阈值：第 (1-topRatio) 分位数
  const sorted = Float32Array.from(map).sort()
  const threshold = sorted[Math.floor(n * (1 - topRatio))]

  const rowMass = new Float32Array(h)
  const colMass = new Float32Array(w)
  let total = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = map[y * w + x]
      if (v < threshold) continue
      rowMass[y] += v
      colMass[x] += v
      total += v
    }
  }

  if (total <= 0) {
    // 全图均匀，退化成中间偏上的一块
    return { x: 0.2, y: 0.1, w: 0.6, h: 0.7 }
  }

  const [y0, y1] = massRange(rowMass, total, 0.05)
  const [x0, x1] = massRange(colMass, total, 0.05)

  return {
    x: x0 / w,
    y: y0 / h,
    w: Math.max((x1 - x0) / w, 0.05),
    h: Math.max((y1 - y0) / h, 0.05),
  }
}

/** 沿一维质量分布砍掉首尾各 trim 比例的质量，返回剩余区间 [start, end]。 */
function massRange(mass: Float32Array, total: number, trim: number): [number, number] {
  const cut = total * trim

  let acc = 0
  let start = 0
  for (let i = 0; i < mass.length; i++) {
    acc += mass[i]
    if (acc >= cut) {
      start = i
      break
    }
  }

  acc = 0
  let end = mass.length - 1
  for (let i = mass.length - 1; i >= 0; i--) {
    acc += mass[i]
    if (acc >= cut) {
      end = i + 1
      break
    }
  }

  if (end <= start) return [0, mass.length]
  return [start, end]
}

/** 显著性重心 —— 比包围盒中心更能代表「视觉焦点」。 */
export function extractFocus(sal: SaliencyResult): { x: number; y: number } {
  const { map, w, h } = sal
  let sx = 0
  let sy = 0
  let total = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 平方加权，让高显著区的话语权更大
      const v = map[y * w + x] ** 2
      sx += x * v
      sy += y * v
      total += v
    }
  }

  if (total <= 0) return { x: 0.5, y: 0.4 }
  return { x: sx / total / w, y: sy / total / h }
}

/**
 * 3x3 网格的留白度，行优先。
 * 1 = 这一格几乎没内容，随便放字；0 = 塞满了，别动。
 */
export function computeEmptiness(sal: SaliencyResult): number[] {
  const { map, w, h } = sal
  const out: number[] = []

  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const x0 = Math.floor((gx * w) / 3)
      const x1 = Math.floor(((gx + 1) * w) / 3)
      const y0 = Math.floor((gy * h) / 3)
      const y1 = Math.floor(((gy + 1) * h) / 3)

      let sum = 0
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += map[y * w + x]
          count++
        }
      }
      const avg = count > 0 ? sum / count : 0
      out.push(1 - Math.min(1, avg * 1.6))
    }
  }

  return out
}

/** 整图明度与彩度均值。决定深底还是浅底、需不需要额外提彩度。 */
export function computeTone(data: Uint8ClampedArray, n: number): {
  luminance: number
  chroma: number
} {
  let lum = 0
  let chr = 0
  for (let i = 0; i < n; i++) {
    const lab = rgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    lum += lab[0]
    chr += Math.hypot(lab[1], lab[2])
  }
  return {
    luminance: lum / n,
    // 彩度实际范围大约 0~0.33，归一化到 0~1 方便下游使用
    chroma: Math.min(1, chr / n / 0.33),
  }
}

/** 把各路结果打包成 ImageAnalysis。 */
export function analyze(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sourceAspect: number,
): ImageAnalysis {
  const sal = computeSaliency(data, w, h)
  const tone = computeTone(data, w * h)

  return {
    aspect: sourceAspect,
    subject: extractSubject(sal),
    focus: extractFocus(sal),
    emptiness: computeEmptiness(sal),
    luminance: tone.luminance,
    chroma: tone.chroma,
  }
}
