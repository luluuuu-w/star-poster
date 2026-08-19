import { describe, expect, it } from 'vitest'
import { explainScore, rankTemplates, scoreTemplate } from '../src/core/layout/match'
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from '../src/core/layout/templates'
import { buildLayers } from '../src/core/layout/apply'
import { DEFAULT_TEXTS } from '../src/core/layout/types'
import type { LayoutTemplate } from '../src/core/layout/types'
import { buildPalette } from '../src/core/color/palette'
import { contrastRatio, AA_NORMAL } from '../src/core/color/contrast'
import { hexToOklab, type Lab } from '../src/core/color/oklab'
import { coverCrop, iou } from '../src/core/model/doc'
import type { ImageAnalysis, TextLayer } from '../src/core/model/types'

function analysisOf(over: Partial<ImageAnalysis> = {}): ImageAnalysis {
  return {
    aspect: 0.75,
    subject: { x: 0.25, y: 0.15, w: 0.5, h: 0.6 },
    focus: { x: 0.5, y: 0.38 },
    emptiness: [0.8, 0.4, 0.8, 0.5, 0.2, 0.5, 0.9, 0.7, 0.9],
    luminance: 0.45,
    chroma: 0.4,
    ...over,
  }
}

const palette = buildPalette(
  [
    ['#c98a5b', 400],
    ['#2b1a12', 300],
    ['#f2e3d0', 200],
    ['#7a3b28', 120],
  ].map(([hex, count]) => ({ center: hexToOklab(hex as string) as Lab, count: count as number })),
)

describe('模板库完整性', () => {
  it('内置模板有 10 套', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(10)
  })

  it('模板 id 唯一', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('模板名称唯一（面板上靠名字区分）', () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每套模板都有名字、标签和完整的匹配元数据', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.name.length, t.id).toBeGreaterThan(0)
      expect(t.tags.length, t.id).toBeGreaterThan(0)
      expect(t.builtin, t.id).toBe(true)
      expect(t.meta.idealAspect, t.id).toBeGreaterThan(0)
      expect(t.meta.aspectTolerance, t.id).toBeGreaterThan(0)
      expect(['dark', 'light', 'any'], t.id).toContain(t.meta.tonePreference)
      expect(typeof t.build, t.id).toBe('function')
    }
  })

  it('getBuiltinTemplate 能按 id 取到，取不到返回 undefined', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(getBuiltinTemplate(t.id)?.id).toBe(t.id)
    }
    expect(getBuiltinTemplate('不存在的id')).toBeUndefined()
  })

  it('覆盖了多种宽高比偏好，不是全挤在一个值上', () => {
    // 全部模板都偏好同一个宽高比的话，横图竖图都只能套到同一批版型
    const aspects = new Set(BUILTIN_TEMPLATES.map((t) => t.meta.idealAspect))
    expect(aspects.size).toBeGreaterThanOrEqual(5)
  })

  it('覆盖了多种主体锚点', () => {
    const anchors = new Set(BUILTIN_TEMPLATES.map((t) => t.meta.subjectAnchor))
    expect(anchors.size).toBeGreaterThanOrEqual(3)
  })

  it('深浅色调偏好都有覆盖', () => {
    const tones = BUILTIN_TEMPLATES.map((t) => t.meta.tonePreference)
    expect(tones).toContain('dark')
    expect(tones).toContain('light')
    expect(tones).toContain('any')
  })
})

describe('scoreTemplate', () => {
  it('分数与各分项都落在 0~1', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const s = scoreTemplate(t, analysisOf())
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(1)
      for (const [k, v] of Object.entries(s.breakdown)) {
        expect(v, k).toBeGreaterThanOrEqual(0)
        expect(v, k).toBeLessThanOrEqual(1)
      }
    }
  })

  it('宽高比越接近模板期望，aspect 分越高', () => {
    const tpl = getBuiltinTemplate('tpl_magazine')!
    const near = scoreTemplate(tpl, analysisOf({ aspect: tpl.meta.idealAspect }))
    const far = scoreTemplate(tpl, analysisOf({ aspect: tpl.meta.idealAspect * 3 }))
    expect(near.breakdown.aspect).toBeGreaterThan(far.breakdown.aspect)
    expect(near.breakdown.aspect).toBeCloseTo(1, 3)
  })

  it('宽高比偏离方向对称：2 倍宽和 2 倍高扣分一样', () => {
    const tpl = getBuiltinTemplate('tpl_magazine')!
    const wide = scoreTemplate(tpl, analysisOf({ aspect: tpl.meta.idealAspect * 2 }))
    const tall = scoreTemplate(tpl, analysisOf({ aspect: tpl.meta.idealAspect / 2 }))
    expect(wide.breakdown.aspect).toBeCloseTo(tall.breakdown.aspect, 6)
  })

  it('主体位置贴合锚点时 subject 分更高', () => {
    // 极简写真期望主体在上方
    const tpl = getBuiltinTemplate('tpl_minimal')!
    expect(tpl.meta.subjectAnchor).toBe('top')

    const atTop = scoreTemplate(tpl, analysisOf({ subject: { x: 0.2, y: 0.03, w: 0.6, h: 0.5 } }))
    const atBottom = scoreTemplate(tpl, analysisOf({ subject: { x: 0.2, y: 0.5, w: 0.6, h: 0.48 } }))
    expect(atTop.breakdown.subject).toBeGreaterThan(atBottom.breakdown.subject)
  })

  it('文字区落在留白上时 space 分更高', () => {
    const tpl = getBuiltinTemplate('tpl_minimal')!
    // 极简写真的文字区在底部
    const bottomEmpty = scoreTemplate(
      tpl,
      analysisOf({ emptiness: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.95, 0.95, 0.95] }),
    )
    const bottomFull = scoreTemplate(
      tpl,
      analysisOf({ emptiness: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.05, 0.05, 0.05] }),
    )
    expect(bottomEmpty.breakdown.space).toBeGreaterThan(bottomFull.breakdown.space)
  })

  it('色调偏好生效', () => {
    // 大字报偏好暗调
    const tpl = getBuiltinTemplate('tpl_bold')!
    expect(tpl.meta.tonePreference).toBe('dark')
    const dark = scoreTemplate(tpl, analysisOf({ luminance: 0.2 }))
    const light = scoreTemplate(tpl, analysisOf({ luminance: 0.85 }))
    expect(dark.breakdown.tone).toBeGreaterThan(light.breakdown.tone)
  })

  it('满版模板不挑主体位置，但主体太小会扣分', () => {
    const tpl = getBuiltinTemplate('tpl_bold')!
    const big = scoreTemplate(tpl, analysisOf({ subject: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }))
    const tiny = scoreTemplate(tpl, analysisOf({ subject: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } }))
    expect(big.breakdown.subject).toBeGreaterThan(tiny.breakdown.subject)
  })
})

describe('rankTemplates', () => {
  it('返回全部模板且按分数降序', () => {
    const ranked = rankTemplates(BUILTIN_TEMPLATES, analysisOf())
    expect(ranked).toHaveLength(BUILTIN_TEMPLATES.length)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })

  it('不同构图会选出不同的最佳模板', () => {
    // 主体在上、底部大留白 -> 应该倾向极简写真那类
    const topSubject = rankTemplates(
      BUILTIN_TEMPLATES,
      analysisOf({
        aspect: 0.8,
        luminance: 0.75,
        subject: { x: 0.2, y: 0.03, w: 0.6, h: 0.5 },
        emptiness: [0.3, 0.2, 0.3, 0.5, 0.4, 0.5, 0.95, 0.95, 0.95],
      }),
    )
    // 满版暗调大主体 -> 应该倾向大字报
    const fullDark = rankTemplates(
      BUILTIN_TEMPLATES,
      analysisOf({
        aspect: 0.7,
        luminance: 0.18,
        subject: { x: 0.05, y: 0.02, w: 0.9, h: 0.9 },
        emptiness: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.6, 0.6, 0.6],
      }),
    )

    expect(topSubject[0].template.id).not.toBe(fullDark[0].template.id)
  })

  it('空模板列表返回空数组', () => {
    expect(rankTemplates([], analysisOf())).toEqual([])
  })

  it('explainScore 总能给出一句非空说明', () => {
    for (const s of rankTemplates(BUILTIN_TEMPLATES, analysisOf())) {
      expect(explainScore(s).length).toBeGreaterThan(0)
    }
  })
})

describe('内置模板实例化', () => {
  const ctx = {
    canvas: { width: 1080, height: 1350 },
    palette,
    analysis: analysisOf(),
    texts: DEFAULT_TEXTS,
    assetId: 'img_test',
  }

  it('每个模板都能产出图层', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const layers = buildLayers(t, ctx)
      expect(layers.length, t.name).toBeGreaterThan(0)
    }
  })

  it('每个模板都包含照片图层且引用了正确的 assetId', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const photos = buildLayers(t, ctx).filter((l) => l.type === 'photo')
      expect(photos.length, t.name).toBeGreaterThanOrEqual(1)
      expect(photos[0].type === 'photo' && photos[0].assetId).toBe('img_test')
    }
  })

  it('每个模板都放了主标题文字', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const texts = buildLayers(t, ctx).filter((l): l is TextLayer => l.type === 'text')
      expect(texts.length, t.name).toBeGreaterThan(0)
      expect(texts.some((l) => l.text === DEFAULT_TEXTS.title), t.name).toBe(true)
    }
  })

  it('所有图层的 frame 都在画布内且非空', () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const l of buildLayers(t, ctx)) {
        expect(l.frame.w, `${t.name}/${l.name} 宽`).toBeGreaterThan(0)
        expect(l.frame.h, `${t.name}/${l.name} 高`).toBeGreaterThan(0)
        // 允许出血（负坐标 / 超过 1），但不能整个跑到画布外
        expect(l.frame.x, `${t.name}/${l.name} x`).toBeLessThan(1)
        expect(l.frame.y, `${t.name}/${l.name} y`).toBeLessThan(1)
        expect(l.frame.x + l.frame.w, `${t.name}/${l.name} 右边`).toBeGreaterThan(0)
      }
    }
  })

  it('所有图层的 id 唯一', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const ids = buildLayers(t, ctx).map((l) => l.id)
      expect(new Set(ids).size, t.name).toBe(ids.length)
    }
  })

  it('长名字会自动缩小字号，不会溢出', () => {
    const short = buildLayers(getBuiltinTemplate('tpl_bold')!, {
      ...ctx,
      texts: { ...DEFAULT_TEXTS, title: '王' },
    }).find((l): l is TextLayer => l.type === 'text' && l.name === '主标题')!

    const long = buildLayers(getBuiltinTemplate('tpl_bold')!, {
      ...ctx,
      texts: { ...DEFAULT_TEXTS, title: '欧阳娜娜娜娜娜娜娜娜' },
    }).find((l): l is TextLayer => l.type === 'text' && l.name === '主标题')!

    expect(long.fontSize).toBeLessThan(short.fontSize)
    expect(long.fontSize).toBeGreaterThan(0)
  })

  it('文字颜色用的是配色变量，换配色能联动', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const texts = buildLayers(t, ctx).filter((l): l is TextLayer => l.type === 'text')
      for (const tx of texts) {
        if (tx.fill.kind !== 'solid') continue
        expect(tx.fill.color.startsWith('@'), `${t.name}/${tx.name} 用了写死的颜色`).toBe(true)
      }
    }
  })

  it('文字与其底色的对比度达标', () => {
    /**
     * 每个文字色变量实际压在什么底色上，是模板决定的。这里按语义把
     * 「文字色 -> 它的底色」的对应关系写清楚，才能算出真实的对比度。
     */
    const backdropOf: Record<string, keyof typeof palette.roles> = {
      textOnBg: 'bg',
      accentText: 'bg',
      textOnPrimary: 'primary',
      // 有的模板把文字压在 accent 色块上，这时用背景色反白
      bg: 'accent',
    }

    for (const t of BUILTIN_TEMPLATES) {
      const texts = buildLayers(t, ctx).filter((l): l is TextLayer => l.type === 'text')

      for (const tx of texts) {
        if (tx.fill.kind !== 'solid' || !tx.fill.color.startsWith('@')) continue

        const role = tx.fill.color.slice(1) as keyof typeof palette.roles
        const bgRole = backdropOf[role]

        expect(bgRole, `${t.name}/${tx.name} 用了没登记底色的文字变量：${role}`).toBeDefined()

        const fg = palette.roles[role]
        const bg = palette.roles[bgRole]

        // 海报字通常很大，按 AA 大字标准 3:1 要求
        expect(
          contrastRatio(fg, bg),
          `${t.name}/${tx.name}: ${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('小字（字号 < 0.025）用的是过了 AA 4.5 的文字变量', () => {
    // 说明文字之类的小字最容易看不清，不能用只保证 3:1 的变量
    const strict = new Set(['textOnBg', 'accentText', 'textOnPrimary'])

    for (const t of BUILTIN_TEMPLATES) {
      const texts = buildLayers(t, ctx).filter((l): l is TextLayer => l.type === 'text')

      for (const tx of texts) {
        if (tx.fontSize >= 0.025) continue
        if (tx.fill.kind !== 'solid' || !tx.fill.color.startsWith('@')) continue

        const role = tx.fill.color.slice(1)
        // 压在 accent 色块上的反白小字另算，它的底色是实心色块
        if (role === 'bg') continue

        expect(
          strict.has(role),
          `${t.name}/${tx.name} 是小字（${tx.fontSize}）但用了 @${role}`,
        ).toBe(true)

        const fg = palette.roles[role as keyof typeof palette.roles]
        const bg = role === 'textOnPrimary' ? palette.roles.primary : palette.roles.bg
        expect(
          contrastRatio(fg, bg),
          `${t.name}/${tx.name} 小字对比度不足`,
        ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02)
      }
    }
  })

  it('换画布尺寸时相对几何不变（模板可复用到任意尺寸）', () => {
    const t = getBuiltinTemplate('tpl_magazine')!
    const a = buildLayers(t, { ...ctx, canvas: { width: 1080, height: 1350 } })
    const b = buildLayers(t, { ...ctx, canvas: { width: 2160, height: 2700 } })

    // 同宽高比下，除了照片裁切外所有 frame 应该一致
    for (let i = 0; i < a.length; i++) {
      if (a[i].type === 'photo') continue
      expect(a[i].frame).toEqual(b[i].frame)
    }
  })

  it('没有 build 也没有 slots 的模板返回空数组而不是抛错', () => {
    const broken: LayoutTemplate = {
      id: 'x', name: 'x', tags: [], builtin: false, createdAt: 0,
      meta: {
        idealAspect: 1, aspectTolerance: 0.3, subjectAnchor: 'center',
        textZones: [], tonePreference: 'any',
      },
    }
    expect(buildLayers(broken, ctx)).toEqual([])
  })
})

describe('coverCrop', () => {
  it('宽高比一致时取整张图', () => {
    const c = coverCrop(0.75, 0.75)
    expect(c.w).toBeCloseTo(1, 6)
    expect(c.h).toBeCloseTo(1, 6)
  })

  it('源图更宽时左右裁，高度取满', () => {
    const c = coverCrop(1.5, 0.75)
    expect(c.h).toBeCloseTo(1, 6)
    expect(c.w).toBeCloseTo(0.5, 6)
  })

  it('源图更高时上下裁，宽度取满', () => {
    const c = coverCrop(0.5, 1)
    expect(c.w).toBeCloseTo(1, 6)
    expect(c.h).toBeCloseTo(0.5, 6)
  })

  it('裁切窗口把焦点放在中间', () => {
    // 焦点在上方 0.2，裁切窗口应该往上靠
    const c = coverCrop(0.5, 1, { x: 0.5, y: 0.2 })
    const center = c.y + c.h / 2
    expect(Math.abs(center - 0.2)).toBeLessThan(0.06)
  })

  it('焦点在边缘时窗口被夹回画面内，不会露出空白', () => {
    for (const fy of [0, 0.02, 0.98, 1]) {
      const c = coverCrop(0.5, 1, { x: 0.5, y: fy })
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('裁切窗口始终在 [0,1] 内', () => {
    for (const src of [0.4, 0.75, 1, 1.5, 3]) {
      for (const dst of [0.5, 0.8, 1, 1.6]) {
        const c = coverCrop(src, dst, { x: 0.3, y: 0.7 })
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
        expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
      }
    }
  })
})

describe('iou', () => {
  it('完全重合是 1', () => {
    const f = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }
    expect(iou(f, f)).toBeCloseTo(1, 6)
  })

  it('完全不相交是 0', () => {
    expect(iou({ x: 0, y: 0, w: 0.3, h: 0.3 }, { x: 0.6, y: 0.6, w: 0.3, h: 0.3 })).toBe(0)
  })

  it('部分重合落在 0~1 之间', () => {
    const v = iou({ x: 0, y: 0, w: 0.6, h: 0.6 }, { x: 0.3, y: 0.3, w: 0.6, h: 0.6 })
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(1)
  })
})

describe('全流程冒烟：分析 -> 配色 -> 选版型 -> 出图层', () => {
  const scenarios = [
    { name: '暗调竖构图', analysis: analysisOf({ luminance: 0.2, aspect: 0.7 }) },
    { name: '亮调方构图', analysis: analysisOf({ luminance: 0.85, aspect: 1 }) },
    { name: '横构图', analysis: analysisOf({ luminance: 0.5, aspect: 1.6 }) },
    {
      name: '主体偏下',
      analysis: analysisOf({ subject: { x: 0.2, y: 0.45, w: 0.6, h: 0.5 } }),
    },
  ]

  for (const s of scenarios) {
    it(`${s.name} 能生成一张完整可用的海报`, () => {
      const ranked = rankTemplates(BUILTIN_TEMPLATES, s.analysis)
      expect(ranked.length).toBeGreaterThan(0)

      const layers = buildLayers(ranked[0].template, {
        canvas: { width: 1080, height: 1350 },
        palette,
        analysis: s.analysis,
        texts: DEFAULT_TEXTS,
        assetId: 'img_x',
      })

      // 有照片、有文字、没有非法几何
      expect(layers.some((l) => l.type === 'photo')).toBe(true)
      expect(layers.some((l) => l.type === 'text')).toBe(true)
      for (const l of layers) {
        expect(Number.isFinite(l.frame.x)).toBe(true)
        expect(Number.isFinite(l.frame.y)).toBe(true)
        expect(l.opacity).toBeGreaterThanOrEqual(0)
        expect(l.opacity).toBeLessThanOrEqual(1)
      }

      // 配色仍然合规
      expect(contrastRatio(palette.roles.textOnBg, palette.roles.bg)).toBeGreaterThanOrEqual(
        AA_NORMAL - 0.02,
      )
    })
  }
})
