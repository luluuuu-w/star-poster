import { describe, expect, it } from 'vitest'
import {
  chroma,
  clampToGamut,
  hexToOklab,
  hexToRgb,
  hueDistance,
  inGamut,
  labDistance,
  oklabToHex,
  oklabToRgb,
  rgbToHex,
  rgbToOklab,
  withLightness,
} from '../src/core/color/oklab'

describe('hex 互转', () => {
  it('解析 6 位和 3 位 hex', () => {
    expect(hexToRgb('#ff8800')).toEqual([255, 136, 0])
    expect(hexToRgb('#f80')).toEqual([255, 136, 0])
    expect(hexToRgb('ff8800')).toEqual([255, 136, 0])
  })

  it('非法输入退化为黑色而不是抛错', () => {
    // 用户手输颜色时难免打错，不该让整个渲染崩掉
    expect(hexToRgb('#zzz')).toEqual([0, 0, 0])
    expect(hexToRgb('')).toEqual([0, 0, 0])
  })

  it('rgbToHex 补零', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
    expect(rgbToHex(1, 2, 3)).toBe('#010203')
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
  })

  it('超出范围的值被夹住', () => {
    expect(rgbToHex(300, -20, 128)).toBe('#ff0080')
  })
})

describe('OKLab 往返转换', () => {
  const samples = [
    '#000000',
    '#ffffff',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#7a6cf0',
    '#f0b03c',
    '#123456',
    '#888888',
  ]

  it('hex -> OKLab -> hex 能还原（允许 1/255 的舍入误差）', () => {
    for (const hex of samples) {
      const back = oklabToHex(hexToOklab(hex))
      const a = hexToRgb(hex)
      const b = hexToRgb(back)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(1)
      }
    }
  })

  it('黑白的 L 落在预期端点', () => {
    expect(rgbToOklab(0, 0, 0)[0]).toBeCloseTo(0, 5)
    expect(rgbToOklab(255, 255, 255)[0]).toBeCloseTo(1, 3)
  })

  it('灰色的彩度接近 0', () => {
    expect(chroma(rgbToOklab(128, 128, 128))).toBeLessThan(0.001)
  })

  it('饱和色的彩度明显大于灰色', () => {
    expect(chroma(hexToOklab('#ff0000'))).toBeGreaterThan(0.15)
  })

  it('oklabToRgb 会把超出色域的值夹回 0~255', () => {
    // 极端的 a/b 会推出 sRGB 色域
    const [r, g, b] = oklabToRgb(0.5, 0.9, -0.9)
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})

describe('感知距离', () => {
  it('相同颜色距离为 0', () => {
    const lab = hexToOklab('#7a6cf0')
    expect(labDistance(lab, lab)).toBe(0)
  })

  it('红蓝的色相距离大于红橙', () => {
    const red = hexToOklab('#ff0000')
    const blue = hexToOklab('#0000ff')
    const orange = hexToOklab('#ff8800')
    expect(hueDistance(red, blue)).toBeGreaterThan(hueDistance(red, orange))
  })

  it('色相距离不超过 π', () => {
    const a = hexToOklab('#ff0000')
    const b = hexToOklab('#00ffff')
    expect(hueDistance(a, b)).toBeLessThanOrEqual(Math.PI + 1e-9)
  })
})

describe('withLightness', () => {
  it('设定明度，色相保持不变', () => {
    const lab = hexToOklab('#7a6cf0')
    const lighter = withLightness(lab, 0.9)

    expect(lighter[0]).toBe(0.9)

    // 彩度可能因为色域收窄被降低，但色相必须一致
    const h0 = Math.atan2(lab[2], lab[1])
    const h1 = Math.atan2(lighter[2], lighter[1])
    expect(Math.abs(h0 - h1)).toBeLessThan(1e-6)
  })

  it('色域内的颜色彩度原样保留', () => {
    const lab = hexToOklab('#7a6cf0')
    // 原明度附近一定在色域内
    const same = withLightness(lab, lab[0])
    expect(same[1]).toBeCloseTo(lab[1], 10)
    expect(same[2]).toBeCloseTo(lab[2], 10)
  })
})

describe('色域处理', () => {
  it('inGamut 正确判断', () => {
    expect(inGamut(hexToOklab('#7a6cf0'))).toBe(true)
    expect(inGamut(hexToOklab('#ffffff'))).toBe(true)
    // 高明度 + 高彩度是 sRGB 表达不了的
    expect(inGamut([0.98, 0.2, 0.15])).toBe(false)
  })

  it('clampToGamut 把越界颜色拉回色域，色相不变', () => {
    const outside: [number, number, number] = [0.97, 0.18, 0.12]
    const fixed = clampToGamut(outside)

    expect(inGamut(fixed)).toBe(true)
    expect(fixed[0]).toBe(outside[0]) // 明度不动

    const h0 = Math.atan2(outside[2], outside[1])
    const h1 = Math.atan2(fixed[2], fixed[1])
    expect(Math.abs(h0 - h1)).toBeLessThan(1e-6)

    // 彩度确实被降了
    expect(Math.hypot(fixed[1], fixed[2])).toBeLessThan(Math.hypot(outside[1], outside[2]))
  })

  it('已在色域内的颜色原样返回', () => {
    const lab = hexToOklab('#7a6cf0')
    expect(clampToGamut(lab)).toBe(lab)
  })

  /**
   * 这是导致「暖白背景变成青白」那个 bug 的根因：把明度推到接近 1 时，
   * sRGB 色域几乎收成一个点，硬夹三个通道会让夹取量不等，等于改了色相。
   */
  it('把暖色推到极高明度不会变成冷色', () => {
    const warm = hexToOklab('#f2eee8') // 暖白
    const pushed = oklabToHex(withLightness(warm, 0.97))
    const [r, , b] = hexToRgb(pushed)

    // 暖色的红通道应该不低于蓝通道
    expect(r).toBeGreaterThanOrEqual(b)
  })

  it('把冷色推到极高明度不会变成暖色', () => {
    const cool = hexToOklab('#e8eef5')
    const pushed = oklabToHex(withLightness(cool, 0.97))
    const [r, , b] = hexToRgb(pushed)
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('极端明度下所有色相都能安全转换', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180
      for (const L of [0.02, 0.05, 0.95, 0.99]) {
        const lab: [number, number, number] = [L, Math.cos(rad) * 0.3, Math.sin(rad) * 0.3]
        const hex = oklabToHex(lab)
        expect(hex, `色相 ${deg}° 明度 ${L}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
