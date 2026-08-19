/**
 * OKLab 色彩空间转换。
 *
 * 为什么不用 RGB 或 HSL 做聚类：在 RGB 里两个颜色的欧氏距离和人眼看到的
 * 差异对不上（绿色通道被严重高估），聚类结果经常把感官上很不同的颜色
 * 归成一簇。OKLab 是为「欧氏距离 ≈ 感知差异」设计的，同样的 k-means
 * 换到 OKLab 里出来的主色明显更贴合直觉。
 *
 * 参考 Björn Ottosson 的原始定义。
 */

export type RGB = [number, number, number] // 0~255
export type Lab = [number, number, number] // L 0~1, a/b 约 -0.4~0.4

/** sRGB 通道值 0~1 -> 线性 RGB。 */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** 线性 RGB -> sRGB 通道值 0~1。 */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

export function oklabToRgb(L: number, a: number, b: number): RGB {
  const [lr, lg, lb] = oklabToLinearRgb(L, a, b)
  return [
    clamp255(linearToSrgb(lr) * 255),
    clamp255(linearToSrgb(lg) * 255),
    clamp255(linearToSrgb(lb) * 255),
  ]
}

/** 线性 RGB，不做夹取 —— 越界说明超出 sRGB 色域。 */
function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

// ---------------------------------------------------------------- 色域

/** 这个 OKLab 颜色能否在 sRGB 里精确表示。 */
export function inGamut(lab: Lab): boolean {
  const [r, g, b] = oklabToLinearRgb(lab[0], lab[1], lab[2])
  const eps = 1e-4
  return (
    r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
  )
}

/**
 * 把超出 sRGB 色域的颜色拉回来：保持 L 和色相，只降彩度。
 *
 * 为什么必须有这一步：sRGB 色域在明暗两端会急剧收窄（L 接近 1 时几乎收成
 * 一个点）。如果只是把 L 推到极值而不管彩度，转 RGB 时三个通道会各自被
 * 夹到 0/255，夹取量不同就等于改了色相 —— 一个暖白会莫名其妙变成青白。
 * 降彩度而不是硬夹，能保住原来的色相。
 */
export function clampToGamut(lab: Lab): Lab {
  if (inGamut(lab)) return lab

  // 彩度为 0 一定在色域内（就是灰阶），所以二分一定收敛
  let lo = 0
  let hi = 1

  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (inGamut([lab[0], lab[1] * mid, lab[2] * mid])) lo = mid
    else hi = mid
  }

  return [lab[0], lab[1] * lo, lab[2] * lo]
}

// ---------------------------------------------------------------- 极坐标形式

/** OKLab 的极坐标形式：彩度。0 = 灰，越大越鲜艳。 */
export function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2])
}

/** OKLab 的极坐标形式：色相，弧度 -π~π。 */
export function hue(lab: Lab): number {
  return Math.atan2(lab[2], lab[1])
}

/** 两个色相的最短角距离，0~π。用来找「对比色」。 */
export function hueDistance(a: Lab, b: Lab): number {
  let d = Math.abs(hue(a) - hue(b))
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

/** OKLab 空间的欧氏距离 —— 近似感知色差。 */
export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** 按给定彩度倍数缩放，L 不变。用于生成柔和/鲜艳变体。 */
export function scaleChroma(lab: Lab, factor: number): Lab {
  return [lab[0], lab[1] * factor, lab[2] * factor]
}

/** 设定明度，色相与彩度尽量保持。会自动把结果拉回 sRGB 色域。 */
export function withLightness(lab: Lab, L: number): Lab {
  return clampToGamut([L, lab[1], lab[2]])
}

// ---------------------------------------------------------------- hex 互转

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const n = parseInt(h, 16)
  if (Number.isNaN(n) || h.length !== 6) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)
  return '#' + h.toString(16).padStart(6, '0')
}

export function hexToOklab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex)
  return rgbToOklab(r, g, b)
}

/**
 * OKLab -> hex。会先把颜色拉回 sRGB 色域再转换。
 *
 * 这是 OKLab 变成具体颜色的唯一出口，在这里兜底色域问题，调用方就不必
 * 每次手动 clampToGamut 了。
 */
export function oklabToHex(lab: Lab): string {
  const safe = clampToGamut(lab)
  const [r, g, b] = oklabToRgb(safe[0], safe[1], safe[2])
  return rgbToHex(r, g, b)
}
