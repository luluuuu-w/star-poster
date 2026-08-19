import { describe, expect, it } from 'vitest'
import {
  analyze,
  computeEmptiness,
  computeSaliency,
  computeTone,
  extractFocus,
  extractSubject,
} from '../src/core/vision/saliency'

/**
 * 合成一张「人像」测试图：纯色背景 + 一块高对比的主体矩形。
 * 主体内部加纹理，让边缘信号也有东西可抓 —— 纯色块只有轮廓有梯度，
 * 和真实照片的主体（脸、头发、衣服）不一样。
 */
function synth(
  w: number,
  h: number,
  bg: [number, number, number],
  subject: { x: number; y: number; w: number; h: number; color: [number, number, number] },
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)

  const sx0 = Math.floor(subject.x * w)
  const sx1 = Math.floor((subject.x + subject.w) * w)
  const sy0 = Math.floor(subject.y * h)
  const sy1 = Math.floor((subject.y + subject.h) * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inside = x >= sx0 && x < sx1 && y >= sy0 && y < sy1

      if (inside) {
        // 棋盘纹理，制造内部边缘
        const t = ((x >> 2) + (y >> 2)) % 2 === 0 ? 22 : -22
        data[i] = subject.color[0] + t
        data[i + 1] = subject.color[1] + t
        data[i + 2] = subject.color[2] + t
      } else {
        data[i] = bg[0]
        data[i + 1] = bg[1]
        data[i + 2] = bg[2]
      }
      data[i + 3] = 255
    }
  }

  return data
}

const W = 96
const H = 128

describe('computeSaliency', () => {
  it('输出尺寸与输入一致，值域归一到 0~1', () => {
    const data = synth(W, H, [20, 24, 40], {
      x: 0.3, y: 0.15, w: 0.4, h: 0.55, color: [230, 190, 160],
    })
    const sal = computeSaliency(data, W, H)

    expect(sal.w).toBe(W)
    expect(sal.h).toBe(H)
    expect(sal.map.length).toBe(W * H)

    for (let i = 0; i < sal.map.length; i++) {
      expect(sal.map[i]).toBeGreaterThanOrEqual(0)
      expect(sal.map[i]).toBeLessThanOrEqual(1)
    }
  })

  it('主体区域的平均显著性高于背景', () => {
    const data = synth(W, H, [20, 24, 40], {
      x: 0.3, y: 0.15, w: 0.4, h: 0.55, color: [230, 190, 160],
    })
    const sal = computeSaliency(data, W, H)

    let inSum = 0, inN = 0, outSum = 0, outN = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inside =
          x / W >= 0.3 && x / W < 0.7 && y / H >= 0.15 && y / H < 0.7
        const v = sal.map[y * W + x]
        if (inside) { inSum += v; inN++ } else { outSum += v; outN++ }
      }
    }

    expect(inSum / inN).toBeGreaterThan(outSum / outN)
  })

  it('纯色图不会崩，也不会产出 NaN', () => {
    const data = synth(W, H, [128, 128, 128], {
      x: 0, y: 0, w: 0, h: 0, color: [128, 128, 128],
    })
    const sal = computeSaliency(data, W, H)
    expect([...sal.map].every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('extractSubject', () => {
  const cases = [
    { name: '居中人像', box: { x: 0.3, y: 0.15, w: 0.4, h: 0.55 } },
    { name: '偏左', box: { x: 0.08, y: 0.2, w: 0.36, h: 0.5 } },
    { name: '偏右', box: { x: 0.55, y: 0.2, w: 0.36, h: 0.5 } },
    { name: '大主体', box: { x: 0.12, y: 0.06, w: 0.72, h: 0.82 } },
  ]

  for (const c of cases) {
    it(`${c.name}：检测框与真实框大致重合`, () => {
      const data = synth(W, H, [18, 22, 36], { ...c.box, color: [235, 195, 165] })
      const sal = computeSaliency(data, W, H)
      const found = extractSubject(sal)

      // 中心点误差不超过画面的 20%
      const trueCx = c.box.x + c.box.w / 2
      const trueCy = c.box.y + c.box.h / 2
      const foundCx = found.x + found.w / 2
      const foundCy = found.y + found.h / 2

      expect(Math.abs(foundCx - trueCx), `cx ${foundCx} vs ${trueCx}`).toBeLessThan(0.2)
      expect(Math.abs(foundCy - trueCy), `cy ${foundCy} vs ${trueCy}`).toBeLessThan(0.22)
    })
  }

  it('输出的框始终在画面内且非空', () => {
    const data = synth(W, H, [200, 200, 200], {
      x: 0.7, y: 0.7, w: 0.25, h: 0.25, color: [10, 10, 10],
    })
    const found = extractSubject(computeSaliency(data, W, H))

    expect(found.x).toBeGreaterThanOrEqual(0)
    expect(found.y).toBeGreaterThanOrEqual(0)
    expect(found.w).toBeGreaterThan(0)
    expect(found.h).toBeGreaterThan(0)
    expect(found.x + found.w).toBeLessThanOrEqual(1.0001)
    expect(found.y + found.h).toBeLessThanOrEqual(1.0001)
  })

  it('全均匀图退化为中间偏上的默认框，而不是抛错', () => {
    const flat = new Uint8ClampedArray(W * H * 4).fill(128)
    for (let i = 3; i < flat.length; i += 4) flat[i] = 255
    const found = extractSubject(computeSaliency(flat, W, H))
    expect(found.w).toBeGreaterThan(0)
    expect(found.h).toBeGreaterThan(0)
  })
})

describe('extractFocus', () => {
  it('焦点落在主体内部', () => {
    const box = { x: 0.3, y: 0.12, w: 0.4, h: 0.5 }
    const data = synth(W, H, [18, 22, 36], { ...box, color: [235, 195, 165] })
    const focus = extractFocus(computeSaliency(data, W, H))

    // 允许一点外溢，但不能跑到画面另一半去
    expect(focus.x).toBeGreaterThan(box.x - 0.12)
    expect(focus.x).toBeLessThan(box.x + box.w + 0.12)
    expect(focus.y).toBeGreaterThan(box.y - 0.12)
    expect(focus.y).toBeLessThan(box.y + box.h + 0.15)
  })

  it('焦点坐标在 0~1 之间', () => {
    const data = synth(W, H, [18, 22, 36], {
      x: 0.02, y: 0.02, w: 0.2, h: 0.2, color: [250, 250, 250],
    })
    const focus = extractFocus(computeSaliency(data, W, H))
    expect(focus.x).toBeGreaterThanOrEqual(0)
    expect(focus.x).toBeLessThanOrEqual(1)
    expect(focus.y).toBeGreaterThanOrEqual(0)
    expect(focus.y).toBeLessThanOrEqual(1)
  })
})

describe('computeEmptiness', () => {
  it('返回 9 格，值都在 0~1', () => {
    const data = synth(W, H, [18, 22, 36], {
      x: 0.3, y: 0.05, w: 0.4, h: 0.5, color: [235, 195, 165],
    })
    const e = computeEmptiness(computeSaliency(data, W, H))

    expect(e).toHaveLength(9)
    for (const v of e) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('主体在上半部时，底部三格比顶部三格更空', () => {
    const data = synth(W, H, [18, 22, 36], {
      x: 0.28, y: 0.02, w: 0.44, h: 0.42, color: [235, 195, 165],
    })
    const e = computeEmptiness(computeSaliency(data, W, H))

    const top = (e[0] + e[1] + e[2]) / 3
    const bottom = (e[6] + e[7] + e[8]) / 3
    expect(bottom).toBeGreaterThan(top)
  })
})

describe('computeTone', () => {
  it('暗图明度低，亮图明度高', () => {
    const dark = new Uint8ClampedArray(64 * 64 * 4).fill(20)
    const light = new Uint8ClampedArray(64 * 64 * 4).fill(240)
    for (let i = 3; i < dark.length; i += 4) { dark[i] = 255; light[i] = 255 }

    expect(computeTone(dark, 64 * 64).luminance).toBeLessThan(
      computeTone(light, 64 * 64).luminance,
    )
  })

  it('灰图彩度接近 0，饱和图彩度明显更高', () => {
    const n = 32 * 32
    const gray = new Uint8ClampedArray(n * 4)
    const vivid = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      gray[i * 4] = gray[i * 4 + 1] = gray[i * 4 + 2] = 128
      gray[i * 4 + 3] = 255
      vivid[i * 4] = 255; vivid[i * 4 + 1] = 20; vivid[i * 4 + 2] = 90
      vivid[i * 4 + 3] = 255
    }

    expect(computeTone(gray, n).chroma).toBeLessThan(0.02)
    expect(computeTone(vivid, n).chroma).toBeGreaterThan(0.3)
  })
})

describe('analyze', () => {
  it('打包出完整且合法的 ImageAnalysis', () => {
    const data = synth(W, H, [18, 22, 36], {
      x: 0.3, y: 0.12, w: 0.4, h: 0.55, color: [235, 195, 165],
    })
    const a = analyze(data, W, H, 0.75)

    expect(a.aspect).toBe(0.75)
    expect(a.emptiness).toHaveLength(9)
    expect(a.subject.w).toBeGreaterThan(0)
    expect(a.luminance).toBeGreaterThanOrEqual(0)
    expect(a.luminance).toBeLessThanOrEqual(1)
    expect(a.chroma).toBeGreaterThanOrEqual(0)
    expect(a.chroma).toBeLessThanOrEqual(1)
    expect(Number.isFinite(a.focus.x)).toBe(true)
    expect(Number.isFinite(a.focus.y)).toBe(true)
  })

  it('同一张图分析两次结果完全一致', () => {
    // 分析必须是确定性的，否则重开作品版型推荐会变
    const data = synth(W, H, [18, 22, 36], {
      x: 0.3, y: 0.12, w: 0.4, h: 0.55, color: [235, 195, 165],
    })
    expect(analyze(data, W, H, 0.75)).toEqual(analyze(data, W, H, 0.75))
  })
})
