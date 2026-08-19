/**
 * 模板文字与文字图层之间的对应关系。
 *
 * 换版型时会重建全部图层，重建用的是 store 里的 texts。如果 texts 不是从
 * 文档里反推出来的，用户改过的标题就会在换版型时被重置回默认值 —— 那是
 * 实打实的内容丢失。所以打开文档时要用 extractTexts() 把文字捞回来。
 *
 * 名字映射集中放在这里，模板里给文字图层起名必须用这些名字之一，
 * 否则换版型时那段文字接不上。
 */

import type { PosterDoc, TemplateTexts, TextLayer } from '../model/types'
import { DEFAULT_TEXTS } from '../model/types'
import { flattenLayers } from '../model/doc'

export type TextRole = keyof TemplateTexts

/** 图层名 -> 文字角色。模板里用的名字都要登记在这。 */
export const LAYER_NAME_TO_ROLE: Record<string, TextRole> = {
  主标题: 'title',
  刊名: 'title',
  标题: 'title',
  副标题: 'subtitle',
  说明: 'caption',
}

/** 反向表：一个角色对应哪些可能的图层名。 */
export const ROLE_TO_LAYER_NAMES: Record<TextRole, string[]> = {
  title: ['主标题', '刊名', '标题'],
  subtitle: ['副标题'],
  caption: ['说明'],
}

/** 某个图层名对应哪个文字角色，认不出来返回 null。 */
export function roleOfLayerName(name: string): TextRole | null {
  return LAYER_NAME_TO_ROLE[name] ?? null
}

/**
 * 取文档的模板文字。
 *
 * 优先用持久化的 doc.texts；老文档没有这个字段，退回从文字图层反推。
 * 反推只能捞到当前模板实际渲染出来的那几段 —— 这正是当初必须把 texts
 * 存进文档的原因。
 */
export function getTexts(doc: PosterDoc): TemplateTexts {
  if (doc.texts) return doc.texts
  return extractTexts(doc)
}

/**
 * 从文字图层反推三段文字。仅用于兼容没有 texts 字段的老文档。
 *
 * 认不出角色的文字图层（用户自己插的）不参与 —— 它们是独立元素，
 * 换版型时本来就会被清掉，不该混进模板文字里。
 */
export function extractTexts(doc: PosterDoc): TemplateTexts {
  const found: Partial<TemplateTexts> = {}

  for (const layer of flattenLayers(doc.layers)) {
    if (layer.type !== 'text') continue
    const role = roleOfLayerName(layer.name)
    // 同一角色有多个图层时取第一个
    if (role && found[role] === undefined) {
      found[role] = (layer as TextLayer).text
    }
  }

  return { ...DEFAULT_TEXTS, ...found }
}

/** 把某个角色的文字同步到文档里对应的图层上，返回改动了几个图层。 */
export function syncTextToLayers(doc: PosterDoc, role: TextRole, value: string): number {
  const names = ROLE_TO_LAYER_NAMES[role]
  let count = 0

  for (const layer of flattenLayers(doc.layers)) {
    if (layer.type === 'text' && names.includes(layer.name)) {
      layer.text = value
      count++
    }
  }

  return count
}
