import { describe, expect, it } from 'vitest'
import {
  AA_NORMAL,
  bestContrasting,
  contrastRatio,
  ensureContrast,
  isDark,
  relativeLuminance,
} from '../src/core/color/contrast'
import { hexToOklab } from '../src/core/color/oklab'

describe('relativeLuminance', () => {
  it('黑白落在 0 和 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
  })

  it('绿色的亮度贡献大于蓝色', () => {
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#0000ff'))
  })
})

describe('contrastRatio', () => {
  it('纯黑白是 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('相同颜色是 1:1', () => {
    expect(contrastRatio('#7a6cf0', '#7a6cf0')).toBeCloseTo(1, 6)
  })

  it('对称：交换参数结果不变', () => {
    const a = contrastRatio('#123456', '#eeddcc')
    const b = contrastRatio('#eeddcc', '#123456')
    expect(a).toBeCloseTo(b, 10)
  })
})

describe('ensureContrast', () => {
  const backgrounds = [
    '#000000',
    '#ffffff',
    '#12121a',
    '#7a6cf0',
    '#f0b03c',
    '#808080', // 中灰是最难的情况，两个方向都够不到很远
    '#2b1a12',
    '#f2e3d0',
  ]

  it('已达标的颜色原样返回', () => {
    const fg = '#ffffff'
    expect(ensureContrast(fg, '#000000', AA_NORMAL)).toBe(fg)
  })

  it('对各种底色都能调到 AA 达标', () => {
    for (const bg of backgrounds) {
      for (const fg of ['#7a6cf0', '#888888', '#f0b03c', '#334455']) {
        const fixed = ensureContrast(fg, bg, AA_NORMAL)
        expect(
          contrastRatio(fixed, bg),
          `fg=${fg} bg=${bg} -> ${fixed}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02) // 容忍 hex 量化的微小误差
      }
    }
  })

  it('尽量保留原色的色相，不是简单地推成纯黑白', () => {
    // 深蓝底上的紫色，调完应该还是偏紫，不该变成纯白
    const fixed = ensureContrast('#7a6cf0', '#12121a', AA_NORMAL)
    expect(fixed).not.toBe('#ffffff')

    const lab = hexToOklab(fixed)
    const chroma = Math.hypot(lab[1], lab[2])
    expect(chroma).toBeGreaterThan(0.02)
  })

  it('中灰底色够不到时退化为黑或白', () => {
    // 对 #777 这种，4.5:1 只有往黑走才够得到
    const fixed = ensureContrast('#777777', '#777777', 7)
    expect(contrastRatio(fixed, '#777777')).toBeGreaterThanOrEqual(4.5)
  })

  it('目标越高，结果对比度越高', () => {
    const bg = '#12121a'
    const low = ensureContrast('#555577', bg, 3)
    const high = ensureContrast('#555577', bg, 7)
    expect(contrastRatio(high, bg)).toBeGreaterThan(contrastRatio(low, bg) - 0.01)
    expect(contrastRatio(high, bg)).toBeGreaterThanOrEqual(6.98)
  })
})

describe('bestContrasting', () => {
  it('在候选里挑对比度最高的', () => {
    expect(bestContrasting(['#333333', '#ffffff', '#888888'], '#000000')).toBe('#ffffff')
    expect(bestContrasting(['#333333', '#ffffff', '#888888'], '#ffffff')).toBe('#333333')
  })
})

describe('isDark', () => {
  it('区分深浅', () => {
    expect(isDark('#000000')).toBe(true)
    expect(isDark('#12121a')).toBe(true)
    expect(isDark('#ffffff')).toBe(false)
    expect(isDark('#f2e3d0')).toBe(false)
  })
})
