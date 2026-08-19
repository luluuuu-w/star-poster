import { describe, expect, it } from 'vitest'
import { flattenStops, gradientPoints } from '../src/core/render/gradient'

/**
 * 渐变轴长度必须等于矩形在该方向上的投影长度。
 *
 * 之前用的是半对角线，导致渐变超出矩形范围：矩形边缘处 alpha 还没降到 0，
 * 渐隐层就出现了一条肉眼可见的硬边。
 */
describe('gradientPoints', () => {
  it('0° 时横跨矩形宽度', () => {
    const { start, end } = gradientPoints(0, 200, 80)
    expect(start).toEqual({ x: 0, y: 40 })
    expect(end).toEqual({ x: 200, y: 40 })
  })

  it('90° 时纵跨矩形高度', () => {
    const { start, end } = gradientPoints(90, 200, 80)
    expect(start.x).toBeCloseTo(100, 6)
    expect(start.y).toBeCloseTo(0, 6)
    expect(end.x).toBeCloseTo(100, 6)
    expect(end.y).toBeCloseTo(80, 6)
  })

  it('180° 与 0° 方向相反、长度相同', () => {
    const a = gradientPoints(0, 200, 80)
    const b = gradientPoints(180, 200, 80)
    expect(b.start.x).toBeCloseTo(a.end.x, 6)
    expect(b.end.x).toBeCloseTo(a.start.x, 6)
  })

  it('45° 正方形时轴长等于对角线', () => {
    const { start, end } = gradientPoints(45, 100, 100)
    const len = Math.hypot(end.x - start.x, end.y - start.y)
    expect(len).toBeCloseTo(Math.hypot(100, 100), 6)
  })

  it('扁矩形的纵向渐变不会溢出（这是硬边 bug 的根因）', () => {
    // 1080 x 302 的渐隐条，90° 渐变
    const w = 1080
    const h = 302
    const { start, end } = gradientPoints(90, w, h)

    // 轴的两端必须正好落在矩形上下边界，不能跑到外面
    expect(start.y).toBeCloseTo(0, 6)
    expect(end.y).toBeCloseTo(h, 6)

    // 用半对角线的旧算法会给出 ±560，远超矩形高度
    const halfDiagonal = Math.hypot(w, h) / 2
    expect(Math.abs(end.y - h / 2)).toBeLessThan(halfDiagonal)
  })

  it('轴始终以矩形中心为中点', () => {
    for (const angle of [0, 30, 45, 90, 135, 200, 315]) {
      for (const [w, h] of [[100, 100], [300, 80], [80, 300]]) {
        const { start, end } = gradientPoints(angle, w, h)
        expect((start.x + end.x) / 2).toBeCloseTo(w / 2, 6)
        expect((start.y + end.y) / 2).toBeCloseTo(h / 2, 6)
      }
    }
  })

  it('轴长等于 |w·cosθ| + |h·sinθ|', () => {
    for (const angle of [0, 17, 45, 90, 123, 270]) {
      const w = 400
      const h = 150
      const { start, end } = gradientPoints(angle, w, h)
      const rad = (angle * Math.PI) / 180
      const expected = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(expected, 6)
    }
  })
})

describe('flattenStops', () => {
  it('转成 Konva 要的扁平数组', () => {
    expect(
      flattenStops([
        { offset: 0, color: '#000000' },
        { offset: 0.5, color: 'rgba(0, 0, 0, 0.5)' },
        { offset: 1, color: '#ffffff' },
      ]),
    ).toEqual([0, '#000000', 0.5, 'rgba(0, 0, 0, 0.5)', 1, '#ffffff'])
  })

  it('空数组返回空数组', () => {
    expect(flattenStops([])).toEqual([])
  })
})
