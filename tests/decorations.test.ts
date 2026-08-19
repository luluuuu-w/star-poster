import { describe, expect, it } from 'vitest'
import {
  BUILTIN_DECORATIONS,
  allDecorations,
  cacheCustomDecoration,
  getDecoration,
  primeCustomDecorations,
  uncacheCustomDecoration,
} from '../src/assets/decorations'
import { DECOR_CATEGORY_LABELS, type DecorCategory, type Decoration } from '../src/core/model/types'

describe('内置装饰库', () => {
  it('数量达到规划的 36 个以上', () => {
    expect(BUILTIN_DECORATIONS.length).toBeGreaterThanOrEqual(36)
  })

  it('id 唯一', () => {
    const ids = BUILTIN_DECORATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('名称唯一（面板上靠名字区分）', () => {
    const names = BUILTIN_DECORATIONS.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每个装饰都有名字、元素和合法分类', () => {
    for (const d of BUILTIN_DECORATIONS) {
      expect(d.name.length, d.id).toBeGreaterThan(0)
      expect(d.elements.length, d.id).toBeGreaterThan(0)
      expect(Object.keys(DECOR_CATEGORY_LABELS), d.id).toContain(d.category)
      expect(d.builtin, d.id).toBe(true)
    }
  })

  it('覆盖了规划的全部分类（custom 除外，那是用户自建的）', () => {
    const present = new Set(BUILTIN_DECORATIONS.map((d) => d.category))
    const expected = (Object.keys(DECOR_CATEGORY_LABELS) as DecorCategory[]).filter(
      (c) => c !== 'custom',
    )
    for (const c of expected) {
      expect(present.has(c), `缺少分类：${DECOR_CATEGORY_LABELS[c]}`).toBe(true)
    }
  })

  /**
   * 这是「装饰跟着海报配色变」能生效的前提：颜色引用的必须是色位名，
   * 且该色位在 palette 里映射到了配色变量。写死 hex 的装饰换配色时不会变。
   */
  it('所有颜色引用都映射到了配色变量', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        for (const key of ['fill', 'stroke'] as const) {
          const slot = key in el ? (el as Record<string, unknown>)[key] : undefined
          if (typeof slot !== 'string') continue

          const mapped = d.palette[slot]
          expect(mapped, `${d.id} 的色位「${slot}」没有在 palette 里声明`).toBeDefined()
          expect(mapped, `${d.id} 的色位「${slot}」没绑定配色变量`).toMatch(/^@/)
        }
      }
    }
  })

  it('palette 里声明的色位都真的被用到了', () => {
    for (const d of BUILTIN_DECORATIONS) {
      const used = new Set<string>()
      for (const el of d.elements) {
        if ('fill' in el && typeof el.fill === 'string') used.add(el.fill)
        if ('stroke' in el && typeof el.stroke === 'string') used.add(el.stroke)
      }
      for (const slot of Object.keys(d.palette)) {
        expect(used.has(slot), `${d.id} 声明了色位「${slot}」但没用到`).toBe(true)
      }
    }
  })

  it('几何数值都是有限数，没有 NaN', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        const nums: number[] = []
        if (el.kind === 'circle') nums.push(el.cx, el.cy, el.r)
        if (el.kind === 'rect') nums.push(el.x, el.y, el.w, el.h)
        if (el.kind === 'image') nums.push(el.x, el.y, el.w, el.h)
        if (el.kind === 'line') nums.push(...el.points)

        for (const n of nums) {
          expect(Number.isFinite(n), `${d.id} 有非法坐标：${n}`).toBe(true)
        }
      }
    }
  })

  it('不透明度都在 0~1 之间', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        if (el.opacity === undefined) continue
        expect(el.opacity, d.id).toBeGreaterThanOrEqual(0)
        expect(el.opacity, d.id).toBeLessThanOrEqual(1)
      }
    }
  })

  it('line 元素的点数是偶数且至少两个点', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        if (el.kind !== 'line') continue
        expect(el.points.length % 2, `${d.id} 的 line 点数不成对`).toBe(0)
        expect(el.points.length, `${d.id} 的 line 点太少`).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('path 的 d 是非空字符串且以 M 开头', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        if (el.kind !== 'path') continue
        expect(el.d.trim().length, d.id).toBeGreaterThan(0)
        expect(el.d.trim(), `${d.id} 的 path 没有起始 M 指令`).toMatch(/^M/i)
      }
    }
  })

  it('坐标大体落在 100x100 设计空间内（允许少量出血）', () => {
    for (const d of BUILTIN_DECORATIONS) {
      for (const el of d.elements) {
        if (el.kind === 'circle') {
          // 暗角那类刻意画在角上的圆允许中心贴边
          expect(el.cx, d.id).toBeGreaterThanOrEqual(-30)
          expect(el.cx, d.id).toBeLessThanOrEqual(130)
          expect(el.r, d.id).toBeGreaterThan(0)
        }
        if (el.kind === 'rect') {
          expect(el.w, d.id).toBeGreaterThan(0)
          expect(el.h, d.id).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('装饰查找与自定义缓存', () => {
  const fake: Decoration = {
    id: 'dc_test_custom',
    name: '测试装饰',
    category: 'custom',
    elements: [{ kind: 'circle', cx: 50, cy: 50, r: 20, fill: 'c1' }],
    palette: { c1: '@accent' },
    builtin: false,
    createdAt: 0,
  }

  it('能按 id 找到内置装饰', () => {
    const first = BUILTIN_DECORATIONS[0]
    expect(getDecoration(first.id)?.id).toBe(first.id)
  })

  it('找不到时返回 undefined，而不是抛错', () => {
    expect(getDecoration('不存在')).toBeUndefined()
  })

  it('primeCustomDecorations 灌入后能查到', () => {
    primeCustomDecorations([fake])
    expect(getDecoration(fake.id)?.name).toBe('测试装饰')
  })

  it('primeCustomDecorations 会替换掉上一批，不是累加', () => {
    primeCustomDecorations([fake])
    primeCustomDecorations([])
    expect(getDecoration(fake.id)).toBeUndefined()
  })

  it('cacheCustomDecoration 单个加入', () => {
    primeCustomDecorations([])
    cacheCustomDecoration(fake)
    expect(getDecoration(fake.id)?.id).toBe(fake.id)
  })

  it('uncacheCustomDecoration 移除', () => {
    cacheCustomDecoration(fake)
    uncacheCustomDecoration(fake.id)
    expect(getDecoration(fake.id)).toBeUndefined()
  })

  it('allDecorations 包含内置 + 自定义', () => {
    primeCustomDecorations([fake])
    const all = allDecorations()
    expect(all.length).toBe(BUILTIN_DECORATIONS.length + 1)
    expect(all.some((d) => d.id === fake.id)).toBe(true)
    primeCustomDecorations([])
  })

  it('自定义装饰不会覆盖内置装饰的查找', () => {
    const builtinId = BUILTIN_DECORATIONS[0].id
    // 故意用同一个 id 造一个自定义装饰
    primeCustomDecorations([{ ...fake, id: builtinId }])
    // 内置优先，避免用户误操作把内置装饰改坏
    expect(getDecoration(builtinId)?.builtin).toBe(true)
    primeCustomDecorations([])
  })
})
