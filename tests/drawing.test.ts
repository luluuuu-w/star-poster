import { describe, expect, it } from 'vitest'
import type { DecorElement } from '../src/core/model/types'
import {
  brushColorRef,
  clampToSpace,
  DEFAULT_BRUSH,
  elementBounds,
  hitsElement,
  simplifyPath,
} from '../src/features/studio/drawing'

describe('simplifyPath', () => {
  it('点太少时原样返回', () => {
    expect(simplifyPath([1, 2])).toEqual([1, 2])
    expect(simplifyPath([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
  })

  it('共线的中间点会被去掉', () => {
    // 一条直线上均匀取 5 个点，简化后应该只剩首尾
    const straight = [0, 0, 10, 10, 20, 20, 30, 30, 40, 40]
    expect(simplifyPath(straight, 0.4)).toEqual([0, 0, 40, 40])
  })

  it('保留首尾点', () => {
    const pts = [0, 0, 5, 30, 10, 0, 15, 30, 20, 0]
    const out = simplifyPath(pts, 0.4)
    expect(out.slice(0, 2)).toEqual([0, 0])
    expect(out.slice(-2)).toEqual([20, 0])
  })

  it('转折明显的点不会被去掉', () => {
    const zigzag = [0, 0, 10, 40, 20, 0, 30, 40, 40, 0]
    const out = simplifyPath(zigzag, 0.5)
    // 每个折点都超出容差，应该全部保留
    expect(out.length).toBe(zigzag.length)
  })

  it('容差越大，点数越少', () => {
    // 模拟一条抖动的手绘线
    const wobbly: number[] = []
    for (let i = 0; i <= 60; i++) {
      wobbly.push(i, 30 + Math.sin(i / 3) * 0.6)
    }

    const tight = simplifyPath(wobbly, 0.1)
    const loose = simplifyPath(wobbly, 3)
    expect(loose.length).toBeLessThan(tight.length)
    expect(loose.length).toBeLessThan(wobbly.length)
  })

  it('大幅减少点数但形状不失真', () => {
    // 一条 300 点的平滑弧线
    const arc: number[] = []
    for (let i = 0; i < 300; i++) {
      const t = (i / 299) * Math.PI
      arc.push(50 + Math.cos(t) * 40, 50 + Math.sin(t) * 40)
    }

    const out = simplifyPath(arc, 0.4)
    // 点数大幅下降 —— 不简化的话存进 IndexedDB 的装饰会非常臃肿
    expect(out.length).toBeLessThan(arc.length / 3)

    // 但每个原始点到简化后折线的距离都应在容差量级内
    for (let i = 0; i < arc.length; i += 2) {
      let best = Infinity
      for (let j = 0; j + 3 < out.length; j += 2) {
        best = Math.min(best, distToSegment(arc[i], arc[i + 1], out[j], out[j + 1], out[j + 2], out[j + 3]))
      }
      expect(best).toBeLessThan(1.2)
    }
  })

  it('所有点重合时不会崩', () => {
    const same = Array.from({ length: 20 }, () => [7, 7]).flat()
    const out = simplifyPath(same)
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(Number.isFinite(out[0])).toBe(true)
  })
})

function distToSegment(
  px: number, py: number, x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

describe('elementBounds', () => {
  it('圆的包围盒', () => {
    expect(elementBounds({ kind: 'circle', cx: 50, cy: 40, r: 10 })).toEqual({
      x: 40, y: 30, w: 20, h: 20,
    })
  })

  it('矩形的包围盒就是它自己', () => {
    expect(elementBounds({ kind: 'rect', x: 5, y: 6, w: 20, h: 30 })).toEqual({
      x: 5, y: 6, w: 20, h: 30,
    })
  })

  it('折线的包围盒取极值', () => {
    const b = elementBounds({
      kind: 'line',
      points: [10, 20, 40, 5, 25, 60],
      stroke: 'c1',
      strokeWidth: 1,
    })
    expect(b).toEqual({ x: 10, y: 5, w: 30, h: 55 })
  })

  it('path 返回 null（绘制工具不产出 path）', () => {
    expect(elementBounds({ kind: 'path', d: 'M 0 0 L 10 10' })).toBeNull()
  })
})

describe('hitsElement', () => {
  const line: DecorElement = {
    kind: 'line',
    points: [10, 10, 90, 90],
    stroke: 'c1',
    strokeWidth: 2,
  }

  it('点在线上算命中', () => {
    expect(hitsElement(line, 50, 50, 2)).toBe(true)
  })

  /**
   * 这条是关键：斜线的包围盒几乎是整个画布，如果用包围盒判断命中，
   * 用户点空白处也会把线擦掉。
   */
  it('点在斜线包围盒内但远离线本身，不算命中', () => {
    expect(hitsElement(line, 85, 15, 2)).toBe(false)
    expect(hitsElement(line, 15, 85, 2)).toBe(false)
  })

  it('容差越大越容易命中', () => {
    expect(hitsElement(line, 50, 58, 2)).toBe(false)
    expect(hitsElement(line, 50, 58, 12)).toBe(true)
  })

  it('单点笔画（点一下没拖动）也能命中', () => {
    const dot: DecorElement = { kind: 'line', points: [30, 30], stroke: 'c1', strokeWidth: 3 }
    expect(hitsElement(dot, 30, 30, 2)).toBe(true)
    expect(hitsElement(dot, 70, 70, 2)).toBe(false)
  })

  it('填充的圆内部算命中', () => {
    const filled: DecorElement = { kind: 'circle', cx: 50, cy: 50, r: 20, fill: 'c1' }
    expect(hitsElement(filled, 50, 50, 1)).toBe(true)
    expect(hitsElement(filled, 90, 90, 1)).toBe(false)
  })

  it('只有描边的圆，圆心不算命中', () => {
    const hollow: DecorElement = {
      kind: 'circle', cx: 50, cy: 50, r: 20, stroke: 'c1', strokeWidth: 2,
    }
    expect(hitsElement(hollow, 50, 50, 2)).toBe(false)
    expect(hitsElement(hollow, 70, 50, 2)).toBe(true)
  })

  it('矩形按包围盒判断', () => {
    const rect: DecorElement = { kind: 'rect', x: 20, y: 20, w: 30, h: 30, fill: 'c1' }
    expect(hitsElement(rect, 35, 35, 1)).toBe(true)
    expect(hitsElement(rect, 80, 80, 1)).toBe(false)
  })
})

describe('clampToSpace', () => {
  it('夹到 0~100', () => {
    expect(clampToSpace(-10)).toBe(0)
    expect(clampToSpace(50)).toBe(50)
    expect(clampToSpace(180)).toBe(100)
  })
})

describe('brushColorRef', () => {
  it('选了色位就用色位名', () => {
    expect(brushColorRef({ ...DEFAULT_BRUSH, slot: 'c2' })).toBe('c2')
  })

  it('没选色位就用固定颜色', () => {
    expect(brushColorRef({ ...DEFAULT_BRUSH, slot: null, fixedColor: '#abcdef' })).toBe(
      '#abcdef',
    )
  })
})
