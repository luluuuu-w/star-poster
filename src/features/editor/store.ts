/**
 * 编辑器状态。
 *
 * 撤销/重做用 immer 的 patch 机制：每次改动记录正向 patch 和反向 patch，
 * 撤销就是应用反向 patch。比快照栈省内存得多 —— 一张海报的完整快照是几十 KB，
 * 存 50 步就是几 MB；patch 通常只有几百字节。
 */

import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import type {
  Layer,
  PaletteRole,
  PaletteVariantId,
  PosterDoc,
  TransformResult,
} from '../../core/model/types'
import { applyVariant, overrideRole } from '../../core/color/palette'
import { findLayer, flattenLayers } from '../../core/model/doc'
import type { TemplateTexts } from '../../core/layout/types'
import { DEFAULT_TEXTS } from '../../core/layout/types'
import { getTexts, syncTextToLayers, type TextRole } from '../../core/layout/texts'

enablePatches()

/** 撤销栈上限。50 步够用，再多内存和心智负担都不划算。 */
const HISTORY_LIMIT = 50

interface HistoryEntry {
  /** 这一步的描述，将来做「撤销历史」列表时用。 */
  label: string
  redo: Patch[]
  undo: Patch[]
}

interface EditorState {
  doc: PosterDoc | null
  selectedIds: string[]
  /** 模板文字。存在 store 而不是 doc 里，因为换模板时要沿用。 */
  texts: TemplateTexts
  showAnalysis: boolean
  /** 有未保存改动。自动保存看这个标志。 */
  dirty: boolean

  past: HistoryEntry[]
  future: HistoryEntry[]

  // --- 文档
  setDoc: (doc: PosterDoc) => void
  /** 带撤销记录的改动入口。所有会改文档的操作都应该走这里。 */
  update: (label: string, recipe: (draft: PosterDoc) => void) => void
  /** 不进撤销栈的改动，用于自动保存打时间戳这类内部操作。 */
  updateSilent: (recipe: (draft: PosterDoc) => void) => void
  markSaved: () => void

  // --- 撤销
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // --- 选中
  select: (id: string | null, additive: boolean) => void
  selectMany: (ids: string[]) => void
  selectedLayers: () => Layer[]

  // --- 常用操作
  updateLayer: (id: string, label: string, recipe: (layer: any) => void) => void
  /** 画布上拖拽/缩放/旋转的写回入口。 */
  applyTransform: (id: string, result: TransformResult) => void
  removeLayers: (ids: string[]) => void
  duplicateLayer: (id: string) => void
  reorderLayer: (id: string, toIndex: number) => void
  addLayer: (layer: Layer) => void

  // --- 配色
  setVariant: (v: PaletteVariantId) => void
  setRoleColor: (role: PaletteRole, hex: string) => void

  // --- 文字
  // --- 文字
  /**
   * 改一段模板文字。
   *
   * 一次 update 里同时写 doc.texts 和对应的文字图层：
   * - doc.texts 是真相，换版型时用它重建，而且能持久化 —— 有的模板不渲染
   *   说明文字，只靠图层存的话那段内容会彻底丢失。
   * - 图层是当前可见的呈现，得跟着一起改。
   */
  setTemplateText: (role: TextRole, value: string) => void

  toggleAnalysis: () => void
  reset: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  selectedIds: [],
  texts: { ...DEFAULT_TEXTS },
  showAnalysis: false,
  dirty: false,
  past: [],
  future: [],

  setDoc: (doc) =>
    set({
      doc,
      // 文字取自文档本身（老文档退回从图层反推），否则换版型会把用户
      // 改过的标题重置回默认值
      texts: getTexts(doc),
      selectedIds: [],
      past: [],
      future: [],
      dirty: false,
    }),

  update: (label, recipe) => {
    const { doc, past } = get()
    if (!doc) return

    const [next, redo, undo] = produceWithPatches(doc, (draft) => {
      recipe(draft)
      draft.updatedAt = Date.now()
    })

    // 没产生实际改动就不入栈，避免「点一下没改任何东西也要撤销一次」
    if (redo.length === 0) return

    const nextPast = [...past, { label, redo, undo }]
    if (nextPast.length > HISTORY_LIMIT) nextPast.shift()

    set({
      doc: next,
      past: nextPast,
      future: [], // 新操作会切断 redo 分支
      dirty: true,
    })
  },

  updateSilent: (recipe) => {
    const { doc } = get()
    if (!doc) return
    const [next] = produceWithPatches(doc, recipe)
    set({ doc: next })
  },

  markSaved: () => set({ dirty: false }),

  undo: () => {
    const { doc, past, future } = get()
    if (!doc || past.length === 0) return

    const entry = past[past.length - 1]
    const next = applyPatches(doc, entry.undo)

    set({
      doc: next,
      past: past.slice(0, -1),
      future: [entry, ...future],
      dirty: true,
      // 撤销可能删掉了当前选中的图层，清掉已不存在的 id
      selectedIds: get().selectedIds.filter((id) => findLayer(next.layers, id)),
    })
  },

  redo: () => {
    const { doc, past, future } = get()
    if (!doc || future.length === 0) return

    const entry = future[0]
    const next = applyPatches(doc, entry.redo)

    set({
      doc: next,
      past: [...past, entry],
      future: future.slice(1),
      dirty: true,
      selectedIds: get().selectedIds.filter((id) => findLayer(next.layers, id)),
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  select: (id, additive) => {
    if (id === null) {
      set({ selectedIds: [] })
      return
    }
    const { selectedIds } = get()
    if (!additive) {
      set({ selectedIds: [id] })
      return
    }
    set({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    })
  },

  selectMany: (ids) => set({ selectedIds: ids }),

  selectedLayers: () => {
    const { doc, selectedIds } = get()
    if (!doc) return []
    const all = flattenLayers(doc.layers)
    return selectedIds
      .map((id) => all.find((l) => l.id === id))
      .filter((l): l is Layer => Boolean(l))
  },

  updateLayer: (id, label, recipe) => {
    get().update(label, (draft) => {
      const layer = findLayer(draft.layers, id)
      if (layer) recipe(layer)
    })
  },

  applyTransform: (id, result) => {
    /**
     * 拖拽是连续动作，但我们只在 dragend/transformend 时写一次模型，
     * 所以撤销栈里一次拖拽就是一步 —— 不会出现按 20 次撤销才退回原位的情况。
     */
    get().update('调整位置尺寸', (draft) => {
      const layer = findLayer(draft.layers, id)
      if (!layer) return

      layer.frame = result.frame
      layer.rotation = result.rotation

      // 文字等比缩放时同步字号，否则拉大文本框字还是原来那么小
      if (result.fontScale && layer.type === 'text') {
        layer.fontSize = Math.max(0.005, layer.fontSize * result.fontScale)
      }
    })
  },

  removeLayers: (ids) => {
    const idSet = new Set(ids)
    get().update('删除图层', (draft) => {
      draft.layers = removeDeep(draft.layers, idSet)
    })
    set({ selectedIds: [] })
  },

  duplicateLayer: (id) => {
    const { doc } = get()
    if (!doc) return
    const source = findLayer(doc.layers, id)
    if (!source) return

    // 结构化克隆并换掉所有 id，否则复制品和原件会互相干扰
    const copy = cloneWithNewIds(source)
    copy.name = `${source.name} 副本`
    // 稍微偏移，让用户看得出多了一个
    copy.frame = {
      ...copy.frame,
      x: Math.min(0.95, copy.frame.x + 0.02),
      y: Math.min(0.95, copy.frame.y + 0.02),
    }

    get().update('复制图层', (draft) => {
      const index = draft.layers.findIndex((l) => l.id === id)
      if (index >= 0) draft.layers.splice(index + 1, 0, copy)
      else draft.layers.push(copy)
    })
    set({ selectedIds: [copy.id] })
  },

  reorderLayer: (id, toIndex) => {
    get().update('调整图层顺序', (draft) => {
      const from = draft.layers.findIndex((l) => l.id === id)
      if (from < 0) return
      const [moved] = draft.layers.splice(from, 1)
      draft.layers.splice(Math.max(0, Math.min(draft.layers.length, toIndex)), 0, moved)
    })
  },

  addLayer: (layer) => {
    get().update('添加图层', (draft) => {
      draft.layers.push(layer)
    })
    set({ selectedIds: [layer.id] })
  },

  setVariant: (v) => {
    get().update(`切换配色：${v}`, (draft) => {
      draft.palette = applyVariant(draft.palette, v)
    })
  },

  setRoleColor: (role, hex) => {
    get().update('修改配色', (draft) => {
      draft.palette = overrideRole(draft.palette, role, hex)
    })
  },

  setTemplateText: (role, value) => {
    set((s) => ({ texts: { ...s.texts, [role]: value } }))

    get().update('修改文字', (draft) => {
      draft.texts = { ...(draft.texts ?? get().texts), [role]: value }
      syncTextToLayers(draft, role, value)
    })
  },

  toggleAnalysis: () => set((s) => ({ showAnalysis: !s.showAnalysis })),

  reset: () =>
    set({
      doc: null,
      selectedIds: [],
      past: [],
      future: [],
      dirty: false,
      texts: { ...DEFAULT_TEXTS },
    }),
}))

// ---------------------------------------------------------------- 辅助

/** 递归删除，group 内部的也要删掉。 */
function removeDeep(layers: Layer[], ids: Set<string>): Layer[] {
  return layers
    .filter((l) => !ids.has(l.id))
    .map((l) =>
      l.type === 'group' ? { ...l, children: removeDeep(l.children, ids) } : l,
    )
}

/** 深拷贝图层并给所有节点换新 id。 */
function cloneWithNewIds(layer: Layer): Layer {
  const copy: Layer = structuredClone(layer)
  const reid = (l: Layer) => {
    l.id = crypto.randomUUID()
    if (l.type === 'group') l.children.forEach(reid)
  }
  reid(copy)
  return copy
}
