/**
 * k-means 聚类（k-means++ 初始化）。
 *
 * 用固定种子的伪随机数，同一张图每次跑出来的主色完全一致 —— 用户重新
 * 打开作品不会看到配色莫名其妙变了。
 */

import type { Lab } from './oklab'
import { labDistance } from './oklab'

/** xorshift32。够随机，且跨平台完全确定。 */
function makeRandom(seed: number): () => number {
  let s = seed | 0
  if (s === 0) s = 0x9e3779b9
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    // 转成 0~1，用无符号读法避免负数
    return (s >>> 0) / 0x100000000
  }
}

export interface Cluster {
  center: Lab
  /** 归入该簇的像素数。 */
  count: number
}

export interface KMeansOptions {
  k: number
  maxIterations?: number
  seed?: number
  /** 中心点移动量小于该阈值就提前收敛。 */
  tolerance?: number
}

/**
 * @param points 待聚类的点。为性能考虑不会被修改。
 * @returns 按 count 降序排列的簇，空簇已剔除。
 */
export function kmeans(points: Lab[], options: KMeansOptions): Cluster[] {
  const { k, maxIterations = 30, seed = 0x5eed, tolerance = 1e-4 } = options

  if (points.length === 0) return []
  if (points.length <= k) {
    return points.map((p) => ({ center: p, count: 1 }))
  }

  const random = makeRandom(seed)
  let centers = kmeansPlusPlusInit(points, k, random)

  const assignment = new Int32Array(points.length)

  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配：每个点归到最近的中心
    let changed = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = labDistance(points[i], centers[c])
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best
        changed = true
      }
    }

    // 更新：中心移到簇质心
    const sums = centers.map(() => [0, 0, 0])
    const counts = new Int32Array(centers.length)
    for (let i = 0; i < points.length; i++) {
      const c = assignment[i]
      sums[c][0] += points[i][0]
      sums[c][1] += points[i][1]
      sums[c][2] += points[i][2]
      counts[c]++
    }

    let maxShift = 0
    const next: Lab[] = centers.map((old, c) => {
      if (counts[c] === 0) return old // 空簇保持原位，下轮可能重新吸到点
      const m: Lab = [
        sums[c][0] / counts[c],
        sums[c][1] / counts[c],
        sums[c][2] / counts[c],
      ]
      maxShift = Math.max(maxShift, labDistance(old, m))
      return m
    })
    centers = next

    if (!changed || maxShift < tolerance) break
  }

  // 结算
  const counts = new Int32Array(centers.length)
  for (let i = 0; i < points.length; i++) counts[assignment[i]]++

  return centers
    .map((center, c) => ({ center, count: counts[c] }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
}

/**
 * k-means++ 初始化：第一个中心随机取，后续中心按「距已有中心最远」的
 * 概率分布取。比纯随机初始化收敛更快、更不容易陷进坏局部最优。
 */
function kmeansPlusPlusInit(points: Lab[], k: number, random: () => number): Lab[] {
  const centers: Lab[] = [points[Math.floor(random() * points.length)]]
  const d2 = new Float64Array(points.length).fill(Infinity)

  while (centers.length < k) {
    const latest = centers[centers.length - 1]
    let total = 0
    for (let i = 0; i < points.length; i++) {
      const d = labDistance(points[i], latest)
      const sq = d * d
      if (sq < d2[i]) d2[i] = sq
      total += d2[i]
    }

    if (total <= 0) break // 所有点都重合了，没必要再加中心

    let target = random() * total
    let picked = points.length - 1
    for (let i = 0; i < points.length; i++) {
      target -= d2[i]
      if (target <= 0) {
        picked = i
        break
      }
    }
    centers.push(points[picked])
  }

  return centers
}
