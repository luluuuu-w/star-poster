/**
 * 从聚类结果构建配色方案，以及 palette token 的解析。
 *
 * 「角色分配」是自动出稿质量的关键：同样一组色，谁当背景、谁当主色、
 * 谁当点缀，出来的效果天差地别。这里的规则是经验性的，但都有明确理由，
 * 见各函数注释。
 */

import type {
  ColorRef,
  Fill,
  Palette,
  PaletteRole,
  PaletteVariantId,
  Swatch,
} from '../model/types'
import type { Cluster } from './kmeans'
import type { Lab } from './oklab'
import {
  chroma,
  hexToRgb,
  hueDistance,
  labDistance,
  oklabToHex,
  scaleChroma,
  withLightness,
} from './oklab'
import { AA_NORMAL, ensureContrast, isDark } from './contrast'

// ---------------------------------------------------------------- token 解析

/**
 * 解析颜色引用。"@primary" 查 palette，"#RRGGBB" 原样返回。
 *
 * 整个渲染层都走这个函数，所以换配色方案时所有 token 引用自动联动。
 */
export function resolveColor(ref: ColorRef, palette: Palette): string {
  if (!ref) return '#000000'
  if (ref.startsWith('@')) {
    const role = ref.slice(1) as PaletteRole
    return palette.roles[role] ?? '#000000'
  }
  return ref
}

/** 解析 Fill 里的所有颜色引用，产出可直接交给 Konva 的形式。 */
export function resolveFill(
  fill: Fill,
  palette: Palette,
): ResolvedFill {
  if (fill.kind === 'solid') {
    return { kind: 'solid', color: resolveColor(fill.color, palette) }
  }
  return {
    kind: 'gradient',
    angle: fill.angle,
    stops: fill.stops.map((s) => ({
      offset: s.offset,
      color:
        s.alpha === undefined || s.alpha >= 1
          ? resolveColor(s.color, palette)
          : withAlpha(resolveColor(s.color, palette), s.alpha),
    })),
  }
}

export type ResolvedFill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; angle: number; stops: Array<{ offset: number; color: string }> }

/** 给 hex 加上透明度，产出 CSS rgba()。Canvas 渐变色标需要这个形式。 */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ---------------------------------------------------------------- 构建

/** 彩度低于这个值基本就是灰色，不适合当主色。 */
const NEUTRAL_CHROMA = 0.035

/**
 * 从聚类结果构建配色方案。
 *
 * @param clusters kmeans() 的输出，已按占比降序。
 * @param variantId 要生成哪套变体。
 */
export function buildPalette(
  clusters: Cluster[],
  variantId: PaletteVariantId = 'faithful',
): Palette {
  const total = clusters.reduce((s, c) => s + c.count, 0) || 1
  const swatches: Swatch[] = clusters.map((c) => ({
    hex: oklabToHex(c.center),
    weight: c.count / total,
    lab: c.center,
  }))

  const roles = assignRoles(swatches, variantId)
  return { swatches, roles, variantId }
}

/** 换一套变体，色板本身不变 —— 用户切换「原色/高对比/柔和/单色」走这里。 */
export function applyVariant(palette: Palette, variantId: PaletteVariantId): Palette {
  return {
    ...palette,
    roles: assignRoles(palette.swatches, variantId),
    variantId,
  }
}

/**
 * 角色分配。
 *
 * 挑选逻辑：
 * - primary：占比 × 彩度 得分最高的色。纯看占比会选中大片的灰墙/白背景，
 *   加上彩度权重才能选到「这张照片给人的印象色」。
 * - accent：与 primary 色相距离最远、且彩度够高的色。色相互补才有点缀效果，
 *   否则整张海报糊成一片。
 * - bg：最暗或最亮的色，取决于照片整体调性 —— 暗调照片配深底更协调。
 * - surface：介于 bg 和 primary 之间的过渡色块。
 * - textOn*：从 bg/primary 推导，强制过对比度。
 */
function assignRoles(
  swatches: Swatch[],
  variantId: PaletteVariantId,
): Record<PaletteRole, string> {
  if (swatches.length === 0) {
    return {
      bg: '#111111',
      surface: '#222222',
      primary: '#888888',
      accent: '#cccccc',
      accentText: '#cccccc',
      textOnBg: '#ffffff',
      textOnPrimary: '#000000',
    }
  }

  const labs = swatches.map((s) => s.lab)

  // --- primary：占比 x 彩度
  let primaryLab = labs[0]
  let bestScore = -1
  for (const s of swatches) {
    // 彩度开根号压一下量级，避免一个占比 2% 的荧光色压过占比 40% 的主体色
    const score = s.weight * (0.25 + Math.sqrt(chroma(s.lab)))
    if (score > bestScore) {
      bestScore = score
      primaryLab = s.lab
    }
  }

  // --- accent：色相离 primary 最远且彩度够
  let accentLab: Lab | null = null
  let bestAccent = -1
  for (const s of swatches) {
    const c = chroma(s.lab)
    if (c < NEUTRAL_CHROMA) continue
    if (labDistance(s.lab, primaryLab) < 0.08) continue // 太接近 primary，起不到对比作用
    const score = hueDistance(s.lab, primaryLab) * (0.3 + c) * (0.3 + s.weight)
    if (score > bestAccent) {
      bestAccent = score
      accentLab = s.lab
    }
  }
  // 照片本身就是单色调时找不到对比色，用 primary 的补色顶上
  if (!accentLab) {
    accentLab = [
      Math.min(1, primaryLab[0] + 0.2),
      -primaryLab[1] * 0.8,
      -primaryLab[2] * 0.8,
    ]
  }

  // --- bg：跟着照片整体调性走
  const avgL = labs.reduce((s, l) => s + l[0], 0) / labs.length
  const preferDark = avgL < 0.55
  const sortedByL = [...labs].sort((a, b) => a[0] - b[0])
  let bgLab = preferDark ? sortedByL[0] : sortedByL[sortedByL.length - 1]
  // 把背景推到更极端一点，中间调背景会让整张海报发闷
  bgLab = withLightness(scaleChroma(bgLab, 0.5), preferDark ? Math.min(bgLab[0], 0.16) : Math.max(bgLab[0], 0.95))

  let surfaceLab: Lab = withLightness(
    scaleChroma(primaryLab, 0.7),
    preferDark ? bgLab[0] + 0.12 : bgLab[0] - 0.1,
  )

  // --- 按变体调整
  switch (variantId) {
    case 'contrast':
      // 背景推到极暗/极亮，主色和点缀拉满彩度
      bgLab = withLightness(scaleChroma(bgLab, 0.3), preferDark ? 0.08 : 0.98)
      primaryLab = boostChroma(primaryLab, 1.45)
      accentLab = boostChroma(accentLab, 1.6)
      surfaceLab = withLightness(scaleChroma(primaryLab, 0.8), preferDark ? 0.2 : 0.9)
      break
    case 'soft':
      // 全部往中间调靠，降彩度，出淡雅感
      bgLab = withLightness(scaleChroma(bgLab, 0.4), preferDark ? 0.25 : 0.93)
      primaryLab = scaleChroma(withLightness(primaryLab, clamp(primaryLab[0], 0.45, 0.72)), 0.6)
      accentLab = scaleChroma(withLightness(accentLab, clamp(accentLab[0], 0.5, 0.78)), 0.55)
      surfaceLab = withLightness(scaleChroma(primaryLab, 0.5), preferDark ? 0.34 : 0.86)
      break
    case 'mono': {
      // 全部锁定到 primary 的色相，只靠明度拉开层次
      const h = primaryLab
      accentLab = withLightness(boostChroma(h, 1.3), clamp(h[0] + (preferDark ? 0.3 : -0.3), 0.15, 0.9))
      surfaceLab = withLightness(scaleChroma(h, 0.55), preferDark ? 0.22 : 0.88)
      bgLab = withLightness(scaleChroma(h, 0.25), preferDark ? 0.1 : 0.96)
      break
    }
    case 'faithful':
    default:
      break
  }

  const bg = oklabToHex(bgLab)
  const surface = oklabToHex(surfaceLab)
  let primary = oklabToHex(primaryLab)
  let accent = oklabToHex(accentLab)

  // primary/accent 也要在背景上看得见，否则色块和背景糊在一起。
  // 但这里只要求「分得清」，不要求过文字标准 —— 色块拉到 4.5:1 会刺眼，
  // 也会丢掉原本的色彩感觉
  primary = ensureContrast(primary, bg, 1.7)
  accent = ensureContrast(accent, bg, 2.2)

  // 点缀色当小字用时（说明、副标题）必须过 AA，所以单独派生一个文字变体，
  // 保住色相的同时把对比度提到达标
  const accentText = ensureContrast(accent, bg, AA_NORMAL)

  // 文字色从背景/主色推导，强制过 AA
  const textOnBg = ensureContrast(isDark(bg) ? '#ffffff' : '#111111', bg, AA_NORMAL)
  const textOnPrimary = ensureContrast(
    isDark(primary) ? '#ffffff' : '#111111',
    primary,
    AA_NORMAL,
  )

  return { bg, surface, primary, accent, accentText, textOnBg, textOnPrimary }
}

/** 提高彩度但避免推出 sRGB 色域太远（推太狠会被 clamp 成脏色）。 */
function boostChroma(lab: Lab, factor: number): Lab {
  const c = chroma(lab)
  const maxC = 0.33
  const target = Math.min(c * factor, maxC)
  const scale = c > 0 ? target / c : 1
  return scaleChroma(lab, scale)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 手动改单个角色的颜色，同时把依赖它的文字色重算一遍。 */
export function overrideRole(
  palette: Palette,
  role: PaletteRole,
  hex: string,
): Palette {
  const roles = { ...palette.roles, [role]: hex }

  if (role === 'bg') {
    roles.textOnBg = ensureContrast(isDark(hex) ? '#ffffff' : '#111111', hex, AA_NORMAL)
    // 点缀文字色是相对背景定的，背景变了要跟着重算
    roles.accentText = ensureContrast(roles.accent, hex, AA_NORMAL)
  }
  if (role === 'primary') {
    roles.textOnPrimary = ensureContrast(
      isDark(hex) ? '#ffffff' : '#111111',
      hex,
      AA_NORMAL,
    )
  }
  if (role === 'accent') {
    roles.accentText = ensureContrast(hex, roles.bg, AA_NORMAL)
  }

  return { ...palette, roles }
}
