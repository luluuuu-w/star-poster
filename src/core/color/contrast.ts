/**
 * WCAG 对比度计算与自动修正。
 *
 * 自动生成的海报最容易翻车的地方就是「文字和底色撞在一起看不清」。
 * 这里的 ensureContrast() 是兜底：算出来的文字色如果对比度不够，就沿
 * OKLab 的 L 轴推到达标为止，色相和彩度尽量保住，不会变成纯黑白。
 */

import type { Lab } from './oklab'
import { hexToRgb, hexToOklab, oklabToHex, withLightness } from './oklab'

/** WCAG 相对亮度。注意这里用的是 sRGB 亮度公式，和 OKLab 的 L 不是一回事。 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG 对比度，1（相同）~ 21（纯黑白）。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/** WCAG AA 正文标准。海报字通常很大，但按最严的来，不吃亏。 */
export const AA_NORMAL = 4.5
/** WCAG AA 大字标准（≥18pt 或 ≥14pt 粗体）。 */
export const AA_LARGE = 3

/**
 * 把 fg 调到与 bg 对比度达标，同时尽量保留其色相与彩度。
 *
 * 策略：先判断该往亮调还是往暗调（看 bg 亮度，往远离 bg 的方向走），
 * 然后二分 OKLab 的 L。如果推到极限仍不达标（比如 bg 是中灰，两头都够不着），
 * 退化为纯白或纯黑里对比度更高的那个。
 */
export function ensureContrast(fg: string, bg: string, target = AA_NORMAL): string {
  if (contrastRatio(fg, bg) >= target) return fg

  const lab = hexToOklab(fg)
  const bgLum = relativeLuminance(bg)
  // bg 偏暗就把文字往亮推，反之往暗推
  const goLighter = bgLum < 0.35

  const found = searchLightness(lab, bg, target, goLighter)
  if (found) return found

  // 反方向再试一次 —— 中等亮度的底色往往只有一个方向走得通
  const other = searchLightness(lab, bg, target, !goLighter)
  if (other) return other

  // 两头都够不着：中灰底色的典型情况，只能上纯黑白
  return contrastRatio('#ffffff', bg) >= contrastRatio('#000000', bg)
    ? '#ffffff'
    : '#000000'
}

/**
 * 在 [当前L, 极限L] 区间里二分找刚好达标的明度。
 * 找「刚好达标」而不是直接推到极限，是为了尽量少偏离原色。
 */
function searchLightness(
  lab: Lab,
  bg: string,
  target: number,
  goLighter: boolean,
): string | null {
  const limit = goLighter ? 1 : 0

  // 先确认极限值确实能达标，不能就没必要二分了
  if (contrastRatio(oklabToHex(withLightness(lab, limit)), bg) < target) {
    return null
  }

  let lo = lab[0]
  let hi = limit
  let best = oklabToHex(withLightness(lab, limit))

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const hex = oklabToHex(withLightness(lab, mid))
    if (contrastRatio(hex, bg) >= target) {
      best = hex
      hi = mid // 达标了，试试更靠近原色的
    } else {
      lo = mid
    }
  }

  return best
}

/** 在候选色里挑与 bg 对比度最高的一个。 */
export function bestContrasting(candidates: string[], bg: string): string {
  let best = candidates[0]
  let bestRatio = -1
  for (const c of candidates) {
    const r = contrastRatio(c, bg)
    if (r > bestRatio) {
      bestRatio = r
      best = c
    }
  }
  return best
}

/** 该用深色字还是浅色字。用于快速判断而不做精细调整。 */
export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.4
}
