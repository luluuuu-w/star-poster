/**
 * 把模板实例化成图层。
 *
 * 内置模板走自己的 build()；用户在工作室摆出来的槽位模板走 buildFromSlots()
 * 的通用逻辑。对调用方来说没有区别。
 */

import type { Layer, PosterDoc } from '../model/types'
import { solid } from '../model/types'
import {
  coverCrop,
  createDecorLayer,
  createPhotoLayer,
  createShapeLayer,
  createTextLayer,
} from '../model/doc'
import type { BuildContext, LayoutTemplate, TemplateSlot, TemplateTexts } from './types'

/** 实例化模板，返回图层数组。 */
export function buildLayers(template: LayoutTemplate, ctx: BuildContext): Layer[] {
  if (template.build) return template.build(ctx)
  if (template.slots) return buildFromSlots(template.slots, ctx)
  return []
}

/**
 * 换模板：保留照片、配色和文字内容，只重排版。
 *
 * 「保留文字内容」很重要 —— 用户改过标题后再换模板，不该把名字重置回默认值。
 */
export function applyTemplate(
  doc: PosterDoc,
  template: LayoutTemplate,
  texts: TemplateTexts,
  assetId: string,
): PosterDoc {
  if (!doc.analysis) {
    throw new Error('文档缺少照片分析结果，无法套用模板')
  }

  const ctx: BuildContext = {
    canvas: { width: doc.canvas.width, height: doc.canvas.height },
    palette: doc.palette,
    analysis: doc.analysis,
    texts,
    assetId,
  }

  return {
    ...doc,
    layers: buildLayers(template, ctx),
    templateId: template.id,
    updatedAt: Date.now(),
  }
}

/** 用户槽位模板的通用实例化逻辑。 */
function buildFromSlots(slots: TemplateSlot[], ctx: BuildContext): Layer[] {
  const layers: Layer[] = []

  for (const slot of slots) {
    switch (slot.role) {
      case 'photo': {
        const targetAspect =
          (slot.frame.w * ctx.canvas.width) / (slot.frame.h * ctx.canvas.height)
        const photo = createPhotoLayer(ctx.assetId, slot.frame)
        photo.crop = coverCrop(ctx.analysis.aspect, targetAspect, ctx.analysis.focus)
        photo.mask = slot.mask ?? 'none'
        photo.rotation = slot.rotation
        layers.push(photo)
        break
      }

      case 'title':
      case 'subtitle':
      case 'caption': {
        const content = textForRole(slot.role, ctx.texts)
        const style = slot.text
        layers.push(
          createTextLayer(content, slot.frame, {
            name: ROLE_NAMES[slot.role],
            rotation: slot.rotation,
            fontId: style?.fontId ?? 'sans',
            fontSize: style?.fontSize ?? defaultSize(slot.role),
            fontWeight: style?.fontWeight ?? defaultWeight(slot.role),
            fill: solid(style?.color ?? '@textOnBg'),
            align: style?.align ?? 'left',
            letterSpacing: style?.letterSpacing ?? 0,
            vertical: style?.vertical ?? false,
          }),
        )
        break
      }

      case 'shape': {
        layers.push(
          createShapeLayer(slot.shape?.kind ?? 'rect', slot.frame, {
            rotation: slot.rotation,
            fill: solid(slot.shape?.fill ?? '@primary'),
            radius: slot.shape?.radius ?? 0,
          }),
        )
        break
      }

      case 'decor': {
        if (!slot.decorId) break
        const decor = createDecorLayer(slot.decorId, slot.frame)
        decor.rotation = slot.rotation
        layers.push(decor)
        break
      }
    }
  }

  return layers
}

const ROLE_NAMES = {
  title: '主标题',
  subtitle: '副标题',
  caption: '说明',
} as const

function textForRole(role: 'title' | 'subtitle' | 'caption', texts: TemplateTexts): string {
  return texts[role]
}

function defaultSize(role: 'title' | 'subtitle' | 'caption'): number {
  return role === 'title' ? 0.1 : role === 'subtitle' ? 0.035 : 0.022
}

function defaultWeight(role: 'title' | 'subtitle' | 'caption'): number {
  return role === 'title' ? 700 : role === 'subtitle' ? 500 : 400
}
