import { describe, expect, it, vi } from 'vitest'
import { migrateDoc } from '../src/core/model/migrate'
import { DOC_VERSION } from '../src/core/model/types'
import { AA_NORMAL, contrastRatio } from '../src/core/color/contrast'
import {
  collectAssetIds,
  createDoc,
  createPhotoLayer,
  createTextLayer,
  findLayer,
  findPhotoLayer,
  flattenLayers,
  frameCenter,
  uid,
} from '../src/core/model/doc'
import type { GroupLayer } from '../src/core/model/types'

const F = { x: 0, y: 0, w: 1, h: 1 }

describe('migrateDoc', () => {
  it('当前版本的文档原样通过', () => {
    const doc = createDoc()
    expect(migrateDoc(doc).version).toBe(DOC_VERSION)
  })

  it('没有 version 字段的旧文档被升到当前版本', () => {
    const legacy = { id: 'x', name: '旧作品', layers: [], canvas: {} }
    const migrated = migrateDoc(legacy)
    expect(migrated.version).toBe(DOC_VERSION)
    expect(migrated.name).toBe('旧作品')
  })

  it('旧文档缺失的 palette 被补上兜底值', () => {
    const migrated = migrateDoc({ id: 'x', name: 'y', layers: [] })
    expect(migrated.palette).toBeDefined()
    expect(migrated.palette.variantId).toBe('faithful')
  })

  it('已有 palette 的旧文档不会被覆盖', () => {
    const palette = { swatches: [], roles: { bg: '#123456' }, variantId: 'mono' }
    const migrated = migrateDoc({ id: 'x', name: 'y', layers: [], palette })
    expect(migrated.palette.roles.bg).toBe('#123456')
  })

  it('来自更高版本的文档给出警告但仍返回内容，不抛错', () => {
    // 用户可能在新版本存了作品又回到旧版本打开，不该直接白屏
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const future = { ...createDoc(), version: DOC_VERSION + 5, name: '未来作品' }

    const migrated = migrateDoc(future)
    expect(migrated.name).toBe('未来作品')
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it('迁移是幂等的', () => {
    const once = migrateDoc({ id: 'x', name: 'y', layers: [] })
    expect(migrateDoc(once)).toEqual(once)
  })

  describe('v1 -> v2：补上 accentText 角色', () => {
    /** 一份 v1 时代的文档：有 accent 和 bg，但没有 accentText。 */
    const v1Doc = () => ({
      id: 'old',
      name: '老作品',
      version: 1,
      layers: [],
      canvas: { width: 1080, height: 1350 },
      palette: {
        swatches: [],
        variantId: 'faithful',
        roles: {
          bg: '#12121a',
          surface: '#22222e',
          primary: '#7a6cf0',
          accent: '#6b4a20', // 深棕，当小字用对比度不够
          textOnBg: '#ffffff',
          textOnPrimary: '#ffffff',
        },
      },
    })

    it('补上了 accentText', () => {
      const m = migrateDoc(v1Doc())
      expect(m.version).toBe(DOC_VERSION)
      expect(m.palette.roles.accentText).toBeDefined()
      expect(m.palette.roles.accentText).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('补出来的 accentText 对比度达标', () => {
      const m = migrateDoc(v1Doc())
      expect(
        contrastRatio(m.palette.roles.accentText, m.palette.roles.bg),
      ).toBeGreaterThanOrEqual(AA_NORMAL - 0.02)
    })

    it('不动原有的其他角色', () => {
      const before = v1Doc()
      const m = migrateDoc(before)
      expect(m.palette.roles.bg).toBe(before.palette.roles.bg)
      expect(m.palette.roles.accent).toBe(before.palette.roles.accent)
      expect(m.palette.roles.textOnBg).toBe(before.palette.roles.textOnBg)
    })

    it('palette 完全缺失的老文档也能升上来，不抛错', () => {
      const m = migrateDoc({ id: 'x', name: 'y', layers: [] })
      expect(m.version).toBe(DOC_VERSION)
      expect(m.palette.roles.accentText).toBeDefined()
    })
  })
})

describe('uid', () => {
  it('产出唯一 id', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()))
    expect(ids.size).toBe(500)
  })

  it('前缀生效', () => {
    expect(uid('ly')).toMatch(/^ly_/)
  })
})

describe('图层查询', () => {
  const text = createTextLayer('标题', F)
  const photo = createPhotoLayer('img_1', F)
  const nested = createTextLayer('组内文字', F)
  const group: GroupLayer = {
    id: 'g1', name: '组', type: 'group', frame: F, rotation: 0, opacity: 1,
    blendMode: 'normal', visible: true, locked: false, children: [nested],
  }

  const doc = createDoc({ layers: [photo, text, group] })

  it('findLayer 能找到顶层图层', () => {
    expect(findLayer(doc.layers, text.id)?.id).toBe(text.id)
  })

  it('findLayer 能递归进 group', () => {
    expect(findLayer(doc.layers, nested.id)?.id).toBe(nested.id)
  })

  it('findLayer 找不到时返回 null', () => {
    expect(findLayer(doc.layers, '不存在')).toBeNull()
  })

  it('flattenLayers 包含 group 自身和它的子层', () => {
    const flat = flattenLayers(doc.layers)
    expect(flat.map((l) => l.id)).toContain('g1')
    expect(flat.map((l) => l.id)).toContain(nested.id)
    expect(flat).toHaveLength(4)
  })

  it('findPhotoLayer 找到第一个照片图层', () => {
    expect(findPhotoLayer(doc)?.assetId).toBe('img_1')
  })

  it('没有照片时 findPhotoLayer 返回 null', () => {
    expect(findPhotoLayer(createDoc({ layers: [text] }))).toBeNull()
  })

  it('collectAssetIds 收集全部引用，包括 group 内的', () => {
    const inner = createPhotoLayer('img_2', F)
    const g: GroupLayer = { ...group, children: [inner] }
    const d = createDoc({ layers: [photo, g] })

    expect(collectAssetIds(d)).toEqual(new Set(['img_1', 'img_2']))
  })

  it('collectAssetIds 对空文档返回空集合', () => {
    expect(collectAssetIds(createDoc()).size).toBe(0)
  })
})

describe('图层工厂', () => {
  it('创建的图层带有唯一 id 和合理默认值', () => {
    const a = createTextLayer('A', F)
    const b = createTextLayer('B', F)

    expect(a.id).not.toBe(b.id)
    expect(a.opacity).toBe(1)
    expect(a.visible).toBe(true)
    expect(a.locked).toBe(false)
    expect(a.blendMode).toBe('normal')
  })

  it('文字图层默认用配色变量做颜色', () => {
    const t = createTextLayer('A', F)
    expect(t.fill.kind).toBe('solid')
    expect(t.fill.kind === 'solid' && t.fill.color).toMatch(/^@/)
  })

  it('文字图层名字取自内容，长内容会截断', () => {
    expect(createTextLayer('短', F).name).toBe('短')
    expect(createTextLayer('这是一段非常非常非常长的文字内容', F).name.length).toBeLessThanOrEqual(12)
  })

  it('空文字的图层有兜底名字', () => {
    expect(createTextLayer('', F).name).toBe('文字')
  })

  it('照片图层默认取整张图', () => {
    const p = createPhotoLayer('img', F)
    expect(p.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(p.mask).toBe('none')
  })

  it('overrides 能覆盖默认值', () => {
    const t = createTextLayer('A', F, { fontSize: 0.2, align: 'center' })
    expect(t.fontSize).toBe(0.2)
    expect(t.align).toBe('center')
  })
})

describe('frameCenter', () => {
  it('算出矩形中心', () => {
    expect(frameCenter({ x: 0.2, y: 0.1, w: 0.4, h: 0.6 })).toEqual({ x: 0.4, y: 0.4 })
  })
})

describe('createDoc', () => {
  it('默认值完整', () => {
    const d = createDoc()
    expect(d.version).toBe(DOC_VERSION)
    expect(d.layers).toEqual([])
    expect(d.canvas.width).toBeGreaterThan(0)
    expect(d.canvas.height).toBeGreaterThan(0)
    expect(d.createdAt).toBeGreaterThan(0)
  })

  it('params 能覆盖默认值', () => {
    const d = createDoc({ name: '自定义' })
    expect(d.name).toBe('自定义')
  })

  it('每次创建的 id 不同', () => {
    expect(createDoc().id).not.toBe(createDoc().id)
  })
})
