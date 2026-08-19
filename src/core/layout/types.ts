/**
 * 版型模板。
 *
 * 模板分两种，但对外是同一个类型：
 * - 内置模板：build() 是代码写的函数，能做任意复杂的逻辑（按明暗切换配色、
 *   按文字长度调字号等）。
 * - 用户模板：在工作室里摆槽位存出来的，只有 slots 数据，没有 build()。
 *   由 applyTemplate() 用通用逻辑实例化。
 *
 * 两者共用同一套 meta，所以自定义模板也能参与自动匹配打分。
 */

import type { Frame, ImageAnalysis, Layer, Palette } from '../model/types'

// 模板文字是文档数据，定义在模型层。这里再导出一次，方便 layout 层的调用方
// 不用跨层 import。
export { DEFAULT_TEXTS } from '../model/types'
export type { TemplateTexts } from '../model/types'

/** 主体在画面里的期望落点。匹配打分时和实际检测到的主体框比对。 */
export type SubjectAnchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'full' // 满版出血，主体在哪都行

/** 模板的匹配元数据。 */
export interface TemplateMeta {
  /** 最适合的照片宽高比。1 = 方图，0.75 = 竖图，1.5 = 横图。 */
  idealAspect: number
  /** 宽高比容差，超出后开始扣分。 */
  aspectTolerance: number
  subjectAnchor: SubjectAnchor
  /**
   * 文字/装饰要占用的区域（相对画布 0~1）。
   * 打分时检查这些区域在照片上是否足够留白。
   */
  textZones: Frame[]
  /** 适合深色调照片 / 浅色调照片 / 都行。 */
  tonePreference: 'dark' | 'light' | 'any'
}

/** 模板需要用户填的文字。 */
import type { TemplateTexts } from '../model/types'

/** 实例化模板时能拿到的全部上下文。 */
export interface BuildContext {
  canvas: { width: number; height: number }
  palette: Palette
  analysis: ImageAnalysis
  texts: TemplateTexts
  /** 照片素材 id。模板负责决定它摆在哪、怎么裁。 */
  assetId: string
}

/** 用户自建模板里的一个槽位。 */
export interface TemplateSlot {
  id: string
  role: 'photo' | 'title' | 'subtitle' | 'caption' | 'decor' | 'shape'
  frame: Frame
  rotation: number
  /** decor 槽位指向的装饰 id。 */
  decorId?: string
  /** 文字槽位的样式覆盖。 */
  text?: {
    fontId: string
    fontSize: number
    fontWeight: number
    color: string
    align: 'left' | 'center' | 'right'
    letterSpacing: number
    vertical: boolean
  }
  /** shape 槽位的样式。 */
  shape?: {
    kind: 'rect' | 'ellipse'
    fill: string
    radius: number
  }
  /** photo 槽位的遮罩。 */
  mask?: 'none' | 'circle' | 'rounded' | 'arch'
}

export interface LayoutTemplate {
  id: string
  name: string
  /** 风格标签，用于筛选。 */
  tags: string[]
  meta: TemplateMeta
  builtin: boolean
  createdAt: number
  /** 内置模板的构造函数。用户模板没有这个字段（函数无法序列化进 IndexedDB）。 */
  build?: (ctx: BuildContext) => Layer[]
  /** 用户模板的槽位定义。 */
  slots?: TemplateSlot[]
  /** 列表页缩略图。 */
  thumbnail?: string
}
