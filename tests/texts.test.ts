import { describe, expect, it } from 'vitest'
import {
  LAYER_NAME_TO_ROLE,
  ROLE_TO_LAYER_NAMES,
  extractTexts,
  getTexts,
  roleOfLayerName,
  syncTextToLayers,
} from '../src/core/layout/texts'
import { DEFAULT_TEXTS } from '../src/core/layout/types'
import { BUILTIN_TEMPLATES } from '../src/core/layout/templates'
import { buildLayers } from '../src/core/layout/apply'
import { createDoc, createTextLayer } from '../src/core/model/doc'
import { EMPTY_PALETTE } from '../src/core/model/doc'
import type { ImageAnalysis, TextLayer } from '../src/core/model/types'

const F = { x: 0, y: 0, w: 1, h: 0.1 }

const analysis: ImageAnalysis = {
  aspect: 0.75,
  subject: { x: 0.25, y: 0.15, w: 0.5, h: 0.6 },
  focus: { x: 0.5, y: 0.38 },
  emptiness: [0.8, 0.4, 0.8, 0.5, 0.2, 0.5, 0.9, 0.7, 0.9],
  luminance: 0.45,
  chroma: 0.4,
}

const MY_TEXTS = { title: '林素怀', subtitle: 'LIN SUHUAI', caption: '2026 春季特辑' }

describe('名字映射表自身一致', () => {
  it('正反两张表互相对得上', () => {
    for (const [name, role] of Object.entries(LAYER_NAME_TO_ROLE)) {
      expect(ROLE_TO_LAYER_NAMES[role], `${name} -> ${role}`).toContain(name)
    }
    for (const [role, names] of Object.entries(ROLE_TO_LAYER_NAMES)) {
      for (const n of names) {
        expect(LAYER_NAME_TO_ROLE[n]).toBe(role)
      }
    }
  })

  it('roleOfLayerName 认得登记过的名字，认不出的返回 null', () => {
    expect(roleOfLayerName('主标题')).toBe('title')
    expect(roleOfLayerName('刊名')).toBe('title')
    expect(roleOfLayerName('副标题')).toBe('subtitle')
    expect(roleOfLayerName('说明')).toBe('caption')
    expect(roleOfLayerName('用户随手插的文字')).toBeNull()
  })

  /**
   * 这条最关键：模板给文字图层起的名字必须在映射表里，否则换版型时
   * 那段文字接不上，用户改过的内容会被重置成默认值。
   */
  it('所有内置模板产出的文字图层，名字都能认出角色', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const layers = buildLayers(t, {
        canvas: { width: 1080, height: 1350 },
        palette: EMPTY_PALETTE,
        analysis,
        texts: DEFAULT_TEXTS,
        assetId: 'img',
      })

      for (const l of layers) {
        if (l.type !== 'text') continue
        expect(
          roleOfLayerName(l.name),
          `模板「${t.name}」的文字图层「${l.name}」没登记在名字映射表里`,
        ).not.toBeNull()
      }
    }
  })
})

describe('extractTexts', () => {
  it('空文档返回默认文字', () => {
    expect(extractTexts(createDoc())).toEqual(DEFAULT_TEXTS)
  })

  it('从文字图层反推出三段文字', () => {
    const doc = createDoc({
      layers: [
        createTextLayer('林素怀', F, { name: '主标题' }),
        createTextLayer('LIN SUHUAI', F, { name: '副标题' }),
        createTextLayer('2026 春季特辑', F, { name: '说明' }),
      ],
    })

    expect(extractTexts(doc)).toEqual(MY_TEXTS)
  })

  it('刊名也算标题（杂志封面模板用的是这个名字）', () => {
    const doc = createDoc({ layers: [createTextLayer('林素怀', F, { name: '刊名' })] })
    expect(extractTexts(doc).title).toBe('林素怀')
  })

  it('缺失的角色用默认值补齐', () => {
    const doc = createDoc({ layers: [createTextLayer('只有标题', F, { name: '主标题' })] })
    const texts = extractTexts(doc)

    expect(texts.title).toBe('只有标题')
    expect(texts.subtitle).toBe(DEFAULT_TEXTS.subtitle)
    expect(texts.caption).toBe(DEFAULT_TEXTS.caption)
  })

  it('认不出名字的文字图层不参与（那是用户自己插的独立元素）', () => {
    const doc = createDoc({
      layers: [
        createTextLayer('用户插的字', F, { name: '文字' }),
        createTextLayer('真标题', F, { name: '主标题' }),
      ],
    })
    expect(extractTexts(doc).title).toBe('真标题')
  })

  it('同一角色有多个图层时取第一个', () => {
    const doc = createDoc({
      layers: [
        createTextLayer('第一个', F, { name: '主标题' }),
        createTextLayer('第二个', F, { name: '标题' }),
      ],
    })
    expect(extractTexts(doc).title).toBe('第一个')
  })

  /**
   * 回归测试：曾经换版型会把用户改过的标题重置回「你的名字」，
   * 而且遇到不渲染说明文字的模板（极简写真）时，说明那段会彻底丢失。
   *
   * 修复方式是把 texts 存进文档本身，而不是只靠从图层反推。
   */
  it('走一遍「生成 -> 反推 -> 换版型」，文字不会丢', () => {
    const first = BUILTIN_TEMPLATES[0]
    const second = BUILTIN_TEMPLATES[3]

    // 1. 用户填的文字生成海报
    const doc = createDoc({
      palette: EMPTY_PALETTE,
      analysis,
      texts: MY_TEXTS,
      layers: buildLayers(first, {
        canvas: { width: 1080, height: 1350 },
        palette: EMPTY_PALETTE,
        analysis,
        texts: MY_TEXTS,
        assetId: 'img',
      }),
    })

    // 2. 重新打开文档
    const recovered = getTexts(doc)
    expect(recovered.title).toBe(MY_TEXTS.title)

    // 3. 换版型
    const swapped = buildLayers(second, {
      canvas: { width: 1080, height: 1350 },
      palette: EMPTY_PALETTE,
      analysis,
      texts: recovered,
      assetId: 'img',
    })

    const titles = swapped
      .filter((l): l is TextLayer => l.type === 'text')
      .filter((l) => roleOfLayerName(l.name) === 'title')

    expect(titles.length).toBeGreaterThan(0)
    expect(titles[0].text).toBe(MY_TEXTS.title)
  })

  it('依次换遍所有模板，三段文字都保得住', () => {
    let texts = MY_TEXTS

    for (const t of BUILTIN_TEMPLATES) {
      const doc = createDoc({
        analysis,
        // 换版型时把文字一起写进文档（TemplatePanel 就是这么做的）
        texts,
        layers: buildLayers(t, {
          canvas: { width: 1080, height: 1350 },
          palette: EMPTY_PALETTE,
          analysis,
          texts,
          assetId: 'img',
        }),
      })
      texts = getTexts(doc)

      expect(texts.title, `换到「${t.name}」后标题丢了`).toBe(MY_TEXTS.title)
      expect(texts.subtitle, `换到「${t.name}」后副标题丢了`).toBe(MY_TEXTS.subtitle)
      expect(texts.caption, `换到「${t.name}」后说明丢了`).toBe(MY_TEXTS.caption)
    }
  })

  it('极简写真不渲染说明文字，但文档里那段仍然在', () => {
    // 这就是必须持久化 texts 的具体理由
    const minimal = BUILTIN_TEMPLATES.find((t) => t.name === '极简写真')!
    const layers = buildLayers(minimal, {
      canvas: { width: 1080, height: 1350 },
      palette: EMPTY_PALETTE,
      analysis,
      texts: MY_TEXTS,
      assetId: 'img',
    })

    // 确认这个模板确实没有说明文字图层
    const captions = layers
      .filter((l): l is TextLayer => l.type === 'text')
      .filter((l) => roleOfLayerName(l.name) === 'caption')
    expect(captions).toHaveLength(0)

    // 从图层反推会丢，从文档取不会
    const doc = createDoc({ analysis, texts: MY_TEXTS, layers })
    expect(extractTexts(doc).caption).toBe(DEFAULT_TEXTS.caption)
    expect(getTexts(doc).caption).toBe(MY_TEXTS.caption)
  })

  it('老文档没有 texts 字段时退回从图层反推', () => {
    const doc = createDoc({
      layers: [createTextLayer('老标题', F, { name: '主标题' })],
    })
    delete (doc as { texts?: unknown }).texts

    expect(getTexts(doc).title).toBe('老标题')
  })
})

describe('syncTextToLayers', () => {
  it('改到对应的图层上，返回改了几个', () => {
    const doc = createDoc({
      layers: [
        createTextLayer('旧标题', F, { name: '主标题' }),
        createTextLayer('副标题', F, { name: '副标题' }),
      ],
    })

    const n = syncTextToLayers(doc, 'title', '新标题')

    expect(n).toBe(1)
    expect((doc.layers[0] as TextLayer).text).toBe('新标题')
    // 别的角色不受影响
    expect((doc.layers[1] as TextLayer).text).toBe('副标题')
  })

  it('同一角色的多个图层一起改', () => {
    const doc = createDoc({
      layers: [
        createTextLayer('a', F, { name: '主标题' }),
        createTextLayer('b', F, { name: '刊名' }),
      ],
    })

    expect(syncTextToLayers(doc, 'title', 'X')).toBe(2)
    expect((doc.layers[0] as TextLayer).text).toBe('X')
    expect((doc.layers[1] as TextLayer).text).toBe('X')
  })

  it('没有对应图层时返回 0，不抛错', () => {
    expect(syncTextToLayers(createDoc(), 'title', 'X')).toBe(0)
  })

  it('不动用户自己插的文字图层', () => {
    const doc = createDoc({ layers: [createTextLayer('我的字', F, { name: '文字' })] })
    syncTextToLayers(doc, 'title', 'X')
    expect((doc.layers[0] as TextLayer).text).toBe('我的字')
  })
})
