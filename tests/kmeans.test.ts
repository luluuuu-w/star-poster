import { describe, expect, it } from 'vitest'
import { kmeans } from '../src/core/color/kmeans'
import type { Lab } from '../src/core/color/oklab'
import { hexToOklab } from '../src/core/color/oklab'

/** 围绕若干中心生成点簇，用固定的伪随机保证测试可复现。 */
function makeClusters(centers: Lab[], perCluster: number, spread: number): Lab[] {
  const points: Lab[] = []
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff - 0.5
  }

  for (const c of centers) {
    for (let i = 0; i < perCluster; i++) {
      points.push([
        c[0] + rnd() * spread,
        c[1] + rnd() * spread,
        c[2] + rnd() * spread,
      ])
    }
  }
  return points
}

describe('kmeans', () => {
  it('空输入返回空数组', () => {
    expect(kmeans([], { k: 3 })).toEqual([])
  })

  it('点数少于 k 时每个点自成一簇', () => {
    const points: Lab[] = [
      [0.1, 0, 0],
      [0.5, 0, 0],
    ]
    const result = kmeans(points, { k: 5 })
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.count === 1)).toBe(true)
  })

  it('能分离出明显的三个簇', () => {
    const centers: Lab[] = [
      [0.2, 0.1, 0.05],
      [0.6, -0.1, 0.12],
      [0.9, 0.02, -0.15],
    ]
    const points = makeClusters(centers, 60, 0.02)
    const result = kmeans(points, { k: 3, seed: 42 })

    expect(result).toHaveLength(3)
    // 每个真实中心都应该有一个聚类中心落在附近
    for (const c of centers) {
      const nearest = Math.min(
        ...result.map((r) => Math.hypot(r.center[0] - c[0], r.center[1] - c[1], r.center[2] - c[2])),
      )
      expect(nearest).toBeLessThan(0.03)
    }
  })

  it('结果按占比降序排列', () => {
    const points = [
      ...makeClusters([[0.2, 0, 0]], 100, 0.01),
      ...makeClusters([[0.8, 0, 0]], 20, 0.01),
    ]
    const result = kmeans(points, { k: 2, seed: 7 })
    expect(result[0].count).toBeGreaterThan(result[1].count)
  })

  it('相同种子产出完全一致的结果', () => {
    // 这是「同一张照片每次打开配色都一样」的保证
    const points = makeClusters(
      [
        [0.3, 0.05, 0.02],
        [0.7, -0.08, 0.1],
      ],
      50,
      0.05,
    )

    const a = kmeans(points, { k: 4, seed: 999 })
    const b = kmeans(points, { k: 4, seed: 999 })

    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].count).toBe(b[i].count)
      expect(a[i].center).toEqual(b[i].center)
    }
  })

  it('不同种子可能不同，但都应收敛到合理的簇数', () => {
    const points = makeClusters(
      [
        [0.2, 0, 0],
        [0.5, 0.1, 0],
        [0.8, -0.1, 0.1],
      ],
      40,
      0.02,
    )
    for (const seed of [1, 2, 3, 100]) {
      const r = kmeans(points, { k: 3, seed })
      expect(r.length).toBeGreaterThan(0)
      expect(r.length).toBeLessThanOrEqual(3)
    }
  })

  it('所有点重合时不会死循环，也不会产出空簇', () => {
    const same: Lab[] = Array.from({ length: 50 }, () => [0.5, 0.1, 0.1] as Lab)
    const result = kmeans(same, { k: 5, seed: 3 })
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((c) => c.count > 0)).toBe(true)
    // 总数守恒
    expect(result.reduce((s, c) => s + c.count, 0)).toBe(50)
  })

  it('簇的点数总和等于输入点数', () => {
    const points = makeClusters([[0.3, 0, 0], [0.7, 0, 0]], 33, 0.04)
    const result = kmeans(points, { k: 4, seed: 11 })
    expect(result.reduce((s, c) => s + c.count, 0)).toBe(points.length)
  })

  it('真实照片色也能跑通', () => {
    const hexes = ['#2b1a12', '#c98a5b', '#f2e3d0', '#7a3b28', '#1a1a22', '#e0b24a']
    const points = hexes.flatMap((h) => makeClusters([hexToOklab(h)], 30, 0.015))
    const result = kmeans(points, { k: 6, seed: 0x5eed })
    expect(result).toHaveLength(6)
  })
})
