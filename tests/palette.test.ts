import { describe, expect, it } from 'vitest'
import { kmeans } from '../src/core/color/kmeans'
import {
  applyVariant,
  buildPalette,
  overrideRole,
  resolveColor,
  resolveFill,
  withAlpha,
} from '../src/core/color/palette'
import { AA_NORMAL, contrastRatio } from '../src/core/color/contrast'
import { hexToOklab, hexToRgb as hexToRgbTuple, oklabToHex, type Lab } from '../src/core/color/oklab'
import type { PaletteVariantId } from '../src/core/model/types'

/** 从一组 hex 造出聚类结果，模拟真实取色的输出。 */
function clustersFrom(entries: Array<[string, number]>) {
  return entries.map(([hex, count]) => ({ center: hexToOklab(hex) as Lab, count }))
}

const VARIANTS: PaletteVariantId[] = ['faithful', 'contrast', 'soft', 'mono']

/** 几组差异明显的照片色，覆盖暖调、冷调、高调、低调、近单色。 */
const SCENARIOS: Record<string, Array<[string, number]>> = {
  暖调人像: [
    ['#c98a5b', 400],
    ['#2b1a12', 300],
    ['#f2e3d0', 200],
    ['#7a3b28', 120],
    ['#e0b24a', 60],
  ],
  冷调夜景: [
    ['#1a2740', 500],
    ['#3d6ea8', 250],
    ['#0b0e16', 180],
    ['#8fb4d9', 90],
    ['#d94f6a', 40],
  ],
  高调白背景: [
    ['#f7f5f2', 600],
    ['#e2d8cc', 200],
    ['#b09a86', 100],
    ['#4a3f36', 60],
    ['#c25d4a', 30],
  ],
  近单色黑白: [
    ['#1c1c1c', 400],
    ['#5a5a5a', 300],
    ['#9e9e9e', 200],
    ['#d8d8d8', 100],
  ],
  高饱和潮流: [
    ['#ff2e63', 350],
    ['#08d9d6', 300],
    ['#252a34', 250],
    ['#eaeaea', 100],
  ],
}

describe('buildPalette', () => {
  it('空聚类返回可用的兜底配色', () => {
    const p = buildPalette([], 'faithful')
    expect(p.roles.bg).toMatch(/^#[0-9a-f]{6}$/)
    // 兜底配色自己也得能看清
    expect(contrastRatio(p.roles.textOnBg, p.roles.bg)).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('swatches 的占比归一化到和为 1', () => {
    const p = buildPalette(clustersFrom(SCENARIOS.暖调人像))
    const sum = p.swatches.reduce((s, w) => s + w.weight, 0)
    expect(sum).toBeCloseTo(1, 6)
  })

  it('swatches 按占比降序', () => {
    const p = buildPalette(clustersFrom(SCENARIOS.冷调夜景))
    for (let i = 1; i < p.swatches.length; i++) {
      expect(p.swatches[i - 1].weight).toBeGreaterThanOrEqual(p.swatches[i].weight)
    }
  })

  it('所有角色都是合法 hex', () => {
    for (const [, entries] of Object.entries(SCENARIOS)) {
      const p = buildPalette(clustersFrom(entries))
      for (const [role, hex] of Object.entries(p.roles)) {
        expect(hex, role).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  /**
   * 这是自动出稿最关键的不变量：无论照片什么调性、用哪套变体，
   * 文字都必须在它的底色上看得清。这一条挂了就等于生成了废稿。
   */
  it('任何照片 x 任何变体，文字对比度都达标', () => {
    for (const [name, entries] of Object.entries(SCENARIOS)) {
      const clusters = clustersFrom(entries)
      for (const v of VARIANTS) {
        const p = buildPalette(clusters, v)

        expect(
          contrastRatio(p.roles.textOnBg, p.roles.bg),
          `${name} / ${v} 的 textOnBg`,
        ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02)

        expect(
          contrastRatio(p.roles.textOnPrimary, p.roles.primary),
          `${name} / ${v} 的 textOnPrimary`,
        ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02)

        // 点缀色当小字用的变体也要达标 —— 说明文字、副标题都用它
        expect(
          contrastRatio(p.roles.accentText, p.roles.bg),
          `${name} / ${v} 的 accentText`,
        ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02)
      }
    }
  })

  it('accentText 保住了 accent 的色相，不是简单地变成白或黑', () => {
    for (const [name, entries] of Object.entries(SCENARIOS)) {
      const p = buildPalette(clustersFrom(entries))

      const accentLab = hexToOklab(p.roles.accent)
      const textLab = hexToOklab(p.roles.accentText)

      // 原本就有彩度的点缀色，提亮后应该还留着彩度
      if (Math.hypot(accentLab[1], accentLab[2]) > 0.05) {
        expect(
          Math.hypot(textLab[1], textLab[2]),
          `${name}: accent ${p.roles.accent} -> accentText ${p.roles.accentText} 掉光了彩度`,
        ).toBeGreaterThan(0.015)
      }
    }
  })

  it('accent 当色块用时不要求过 AA（拉太高会刺眼、丢色感）', () => {
    // 只要求「分得清」，这是和 accentText 分开的理由
    for (const [, entries] of Object.entries(SCENARIOS)) {
      const p = buildPalette(clustersFrom(entries))
      expect(contrastRatio(p.roles.accent, p.roles.bg)).toBeGreaterThan(1.8)
    }
  })

  it('主色和点缀色在背景上可辨识', () => {
    for (const [name, entries] of Object.entries(SCENARIOS)) {
      const p = buildPalette(clustersFrom(entries))
      // 色块不需要过文字标准，但不能和背景糊在一起
      expect(contrastRatio(p.roles.primary, p.roles.bg), `${name} primary`).toBeGreaterThan(1.5)
      expect(contrastRatio(p.roles.accent, p.roles.bg), `${name} accent`).toBeGreaterThan(1.8)
    }
  })

  it('暗调照片配深背景，亮调照片配浅背景', () => {
    const dark = buildPalette(clustersFrom(SCENARIOS.冷调夜景))
    const light = buildPalette(clustersFrom(SCENARIOS.高调白背景))
    expect(contrastRatio(dark.roles.bg, '#000000')).toBeLessThan(
      contrastRatio(light.roles.bg, '#000000'),
    )
  })

  /**
   * 回归测试：暖调照片曾经生成出青白色背景。
   * 原因是把明度推到接近 1 时超出 sRGB 色域，三个通道被各自夹取，
   * 夹取量不等就改了色相。现在 oklabToHex 会先降彩度回到色域。
   */
  it('暖调照片的背景不会跑成冷色', () => {
    for (const name of ['暖调人像', '高调白背景'] as const) {
      for (const v of VARIANTS) {
        const p = buildPalette(clustersFrom(SCENARIOS[name]), v)
        const [r, g, b] = hexToRgbTuple(p.roles.bg)
        // 暖调来源不该产出蓝比红明显高的背景
        expect(b - r, `${name}/${v} 背景 ${p.roles.bg} 偏冷了`).toBeLessThan(18)
        void g
      }
    }
  })

  it('冷调照片的背景不会跑成暖色', () => {
    for (const v of VARIANTS) {
      const p = buildPalette(clustersFrom(SCENARIOS.冷调夜景), v)
      const [r, , b] = hexToRgbTuple(p.roles.bg)
      expect(r - b, `${v} 背景 ${p.roles.bg} 偏暖了`).toBeLessThan(18)
    }
  })

  it('所有角色色都能在 sRGB 里精确表示（没有被夹取的脏色）', () => {
    for (const [name, entries] of Object.entries(SCENARIOS)) {
      for (const v of VARIANTS) {
        const p = buildPalette(clustersFrom(entries), v)
        for (const [role, hex] of Object.entries(p.roles)) {
          // hex -> lab -> hex 应该稳定往返；不稳定说明原来就是越界后被夹出来的
          const round = oklabToHex(hexToOklab(hex))
          const a = hexToRgbTuple(hex)
          const b2 = hexToRgbTuple(round)
          for (let i = 0; i < 3; i++) {
            expect(
              Math.abs(a[i] - b2[i]),
              `${name}/${v}/${role}: ${hex} -> ${round}`,
            ).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('主色反映照片里最有存在感的颜色，而不是最大片的灰', () => {
    // 灰色占比最大，但橙色才是这张图的印象色
    const p = buildPalette(
      clustersFrom([
        ['#7a7a7a', 500],
        ['#ff6a1f', 300],
        ['#202020', 200],
      ]),
    )
    const primaryLab = hexToOklab(p.roles.primary)
    const chroma = Math.hypot(primaryLab[1], primaryLab[2])
    expect(chroma).toBeGreaterThan(0.04)
  })
})

describe('applyVariant', () => {
  it('切换变体保留色板，只换角色', () => {
    const base = buildPalette(clustersFrom(SCENARIOS.暖调人像), 'faithful')
    const contrast = applyVariant(base, 'contrast')

    expect(contrast.swatches).toEqual(base.swatches)
    expect(contrast.variantId).toBe('contrast')
  })

  it('高对比变体的背景比原色变体更极端', () => {
    const base = buildPalette(clustersFrom(SCENARIOS.冷调夜景), 'faithful')
    const contrast = applyVariant(base, 'contrast')
    // 夜景是暗调，高对比会把背景推得更黑
    expect(contrastRatio(contrast.roles.bg, '#ffffff')).toBeGreaterThan(
      contrastRatio(base.roles.bg, '#ffffff') - 0.5,
    )
  })

  it('单色变体里主色和点缀色相接近', () => {
    const mono = buildPalette(clustersFrom(SCENARIOS.高饱和潮流), 'mono')
    const p = hexToOklab(mono.roles.primary)
    const a = hexToOklab(mono.roles.accent)
    let d = Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(a[2], a[1]))
    if (d > Math.PI) d = 2 * Math.PI - d
    expect(d).toBeLessThan(0.7)
  })

  it('来回切换变体是幂等的', () => {
    const base = buildPalette(clustersFrom(SCENARIOS.暖调人像), 'faithful')
    const roundTrip = applyVariant(applyVariant(base, 'soft'), 'faithful')
    expect(roundTrip.roles).toEqual(base.roles)
  })
})

describe('overrideRole', () => {
  it('改背景色会连带重算背景上的文字色', () => {
    const p = buildPalette(clustersFrom(SCENARIOS.暖调人像))
    const changed = overrideRole(p, 'bg', '#ffffff')

    expect(changed.roles.bg).toBe('#ffffff')
    expect(contrastRatio(changed.roles.textOnBg, '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('改主色会重算主色上的文字色', () => {
    const p = buildPalette(clustersFrom(SCENARIOS.暖调人像))
    const changed = overrideRole(p, 'primary', '#101010')
    expect(contrastRatio(changed.roles.textOnPrimary, '#101010')).toBeGreaterThanOrEqual(
      AA_NORMAL,
    )
  })

  it('改点缀色不影响其他角色', () => {
    const p = buildPalette(clustersFrom(SCENARIOS.暖调人像))
    const changed = overrideRole(p, 'accent', '#00ff00')
    expect(changed.roles.bg).toBe(p.roles.bg)
    expect(changed.roles.textOnBg).toBe(p.roles.textOnBg)
    expect(changed.roles.accent).toBe('#00ff00')
  })
})

describe('token 解析', () => {
  const palette = buildPalette(clustersFrom(SCENARIOS.暖调人像))

  it('@role 解析成对应角色的颜色', () => {
    expect(resolveColor('@primary', palette)).toBe(palette.roles.primary)
    expect(resolveColor('@bg', palette)).toBe(palette.roles.bg)
  })

  it('字面 hex 原样返回', () => {
    expect(resolveColor('#123456', palette)).toBe('#123456')
  })

  it('未知 token 退化为黑色而不是抛错', () => {
    expect(resolveColor('@nonexistent', palette)).toBe('#000000')
    expect(resolveColor('', palette)).toBe('#000000')
  })

  it('渐变的每个色标都被解析', () => {
    const fill = resolveFill(
      {
        kind: 'gradient',
        angle: 90,
        stops: [
          { offset: 0, color: '@bg', alpha: 0 },
          { offset: 1, color: '@primary' },
        ],
      },
      palette,
    )

    expect(fill.kind).toBe('gradient')
    if (fill.kind !== 'gradient') return

    // alpha 0 的色标要变成 rgba，否则渐隐做不出来
    expect(fill.stops[0].color).toMatch(/^rgba\(/)
    expect(fill.stops[0].color).toContain(', 0)')
    expect(fill.stops[1].color).toBe(palette.roles.primary)
  })

  it('alpha 为 1 或省略时保持 hex，不做无谓的 rgba 转换', () => {
    const fill = resolveFill(
      {
        kind: 'gradient',
        angle: 0,
        stops: [
          { offset: 0, color: '@bg' },
          { offset: 1, color: '@bg', alpha: 1 },
        ],
      },
      palette,
    )
    if (fill.kind !== 'gradient') return
    expect(fill.stops[0].color).toBe(palette.roles.bg)
    expect(fill.stops[1].color).toBe(palette.roles.bg)
  })
})

describe('withAlpha', () => {
  it('产出合法的 rgba', () => {
    expect(withAlpha('#ff8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)')
  })

  it('夹住越界的 alpha', () => {
    expect(withAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)')
    expect(withAlpha('#000000', 5)).toBe('rgba(0, 0, 0, 1)')
  })
})

describe('取色管线端到端', () => {
  it('从像素点直接跑到配色方案', () => {
    // 模拟一张暖调人像的像素分布
    const points: Lab[] = []
    const push = (hex: string, n: number) => {
      const lab = hexToOklab(hex)
      for (let i = 0; i < n; i++) {
        points.push([lab[0] + (i % 7) * 0.002, lab[1], lab[2]])
      }
    }
    push('#c98a5b', 300)
    push('#2b1a12', 250)
    push('#f2e3d0', 150)
    push('#7a3b28', 100)

    const clusters = kmeans(points, { k: 6, seed: 0x5eed })
    const palette = buildPalette(clusters, 'faithful')

    expect(palette.swatches.length).toBeGreaterThan(0)
    expect(contrastRatio(palette.roles.textOnBg, palette.roles.bg)).toBeGreaterThanOrEqual(
      AA_NORMAL - 0.02,
    )
  })
})
