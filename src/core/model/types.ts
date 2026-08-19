/**
 * 海报文档模型。
 *
 * 两条贯穿全局的约定：
 *
 * 1. 几何一律用相对值（0~1，相对画布宽高）。这样同一份模板能套用到任意
 *    画布尺寸，导出 2x/3x 也只是换个 pixelRatio。
 * 2. 颜色字段可以写死 "#RRGGBB"，也可以写 palette token（"@primary"）。
 *    换配色方案时所有 token 引用自动联动 —— 见 core/color/palette.ts 的
 *    resolveColor()。
 */

/** 文档结构版本。改动 PosterDoc 形状时 +1，并在 migrate.ts 里补一条迁移。 */
export const DOC_VERSION = 2

// ---------------------------------------------------------------- 基础类型

/** 相对画布的矩形，取值 0~1。 */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 画布上拖拽/缩放/旋转的结果，全部是相对值。
 *
 * 定义在模型层而不是渲染层，是为了让 store 不必 import react-konva ——
 * 否则 Node 环境下测试 store 会因为缺少原生 canvas 模块而失败。
 */
export interface TransformResult {
  frame: Frame
  rotation: number
  /** 文字图层做等比缩放时的字号倍数。其他类型为 undefined。 */
  fontScale?: number
}

/** 颜色：可以是 "#RRGGBB"，也可以是 "@primary" 这样的 palette token。 */
export type ColorRef = string

export interface SolidFill {
  kind: 'solid'
  color: ColorRef
}

export interface GradientFill {
  kind: 'gradient'
  /** 渐变角度，度数，0 = 从左到右，顺时针增加。 */
  angle: number
  stops: GradientStop[]
}

export interface GradientStop {
  offset: number
  color: ColorRef
  /**
   * 该色标的不透明度 0~1，默认 1。
   *
   * 渐隐效果必须靠这个，不能靠图层整体 opacity —— 整体 opacity 是把整块
   * 均匀调淡，做不出「从实到透」的过渡。淡出时把末端色标设为同色 + alpha 0，
   * 而不是渐变到透明黑，可以避免某些浏览器出现的灰边。
   */
  alpha?: number
}

export type Fill = SolidFill | GradientFill

export const solid = (color: ColorRef): SolidFill => ({ kind: 'solid', color })

// ---------------------------------------------------------------- 配色

export type PaletteRole =
  | 'bg'
  | 'surface'
  | 'primary'
  | 'accent'
  | 'accentText'
  | 'textOnBg'
  | 'textOnPrimary'

export const PALETTE_ROLES: PaletteRole[] = [
  'bg',
  'surface',
  'primary',
  'accent',
  'accentText',
  'textOnBg',
  'textOnPrimary',
]

export const ROLE_LABELS: Record<PaletteRole, string> = {
  bg: '背景',
  surface: '色块',
  primary: '主色',
  accent: '点缀',
  accentText: '点缀色文字',
  textOnBg: '背景上文字',
  textOnPrimary: '主色上文字',
}

/**
 * 哪些角色是当文字用的 —— 它们必须过 WCAG AA。
 *
 * `accent` 和 `accentText` 分开是有必要的：点缀色既要当色块填充（对比度太高
 * 反而刺眼、也会失去原本的色彩感觉），又要当小字（对比度不够就看不清）。
 * 两种用途的要求相反，所以给文字用途单独留一个变体。
 */
export const TEXT_ROLES: PaletteRole[] = ['accentText', 'textOnBg', 'textOnPrimary']

/** 从照片里聚类出的一个色。 */
export interface Swatch {
  hex: string
  /** 该簇像素占比 0~1。 */
  weight: number
  /** OKLab 坐标，排序和调色时用，避免反复转换。 */
  lab: [number, number, number]
}

export type PaletteVariantId = 'faithful' | 'contrast' | 'soft' | 'mono'

export const VARIANT_LABELS: Record<PaletteVariantId, string> = {
  faithful: '原色',
  contrast: '高对比',
  soft: '柔和',
  mono: '单色',
}

export interface Palette {
  /** 照片里提取出的全部色，按重要性降序。 */
  swatches: Swatch[]
  /** 语义角色到具体 hex 的映射。token 解析查的就是这张表。 */
  roles: Record<PaletteRole, string>
  variantId: PaletteVariantId
}

// ---------------------------------------------------------------- 图层

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'

export interface BaseLayer {
  id: string
  name: string
  frame: Frame
  /** 度数，绕 frame 中心旋转。 */
  rotation: number
  opacity: number
  blendMode: BlendMode
  visible: boolean
  locked: boolean
}

/** 照片图层。图片本体存在 IndexedDB 的 assets 表，这里只放引用。 */
export interface PhotoLayer extends BaseLayer {
  type: 'photo'
  assetId: string
  /**
   * 源图裁切区域，相对源图尺寸 0~1。默认取整张图。
   * 配合 frame 实现「填充」式裁切（cover）。
   */
  crop: Frame
  /** 遮罩形状。none = 矩形。 */
  mask: 'none' | 'circle' | 'rounded' | 'arch'
  /** rounded 遮罩的圆角，相对 frame 短边 0~0.5。 */
  maskRadius: number
  filters: PhotoFilters
}

export interface PhotoFilters {
  brightness: number // -1 ~ 1，0 = 原样
  contrast: number // -1 ~ 1
  saturation: number // -1 ~ 1，-1 = 全灰
  blur: number // px @ 1x
  /** 单色化叠加强度 0~1，配合 tintColor 做胶片/单色风。 */
  tint: number
  tintColor: ColorRef
}

export const DEFAULT_FILTERS: PhotoFilters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  tint: 0,
  tintColor: '@primary',
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'line' | 'polygon'

export interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  fill: Fill | null
  stroke: { color: ColorRef; width: number } | null
  /** rect 圆角，相对短边 0~0.5。 */
  radius: number
  /** polygon / line 的顶点，相对 frame 0~1。 */
  points: Array<[number, number]>
}

/** 手绘笔画。points 相对 frame 0~1，渲染时乘画布尺寸。 */
export interface StrokeLayer extends BaseLayer {
  type: 'stroke'
  points: Array<[number, number]>
  color: ColorRef
  /** 线宽，相对画布短边，保证缩放时粗细比例不变。 */
  width: number
  /** 是否闭合并填充。 */
  closed: boolean
  fill: ColorRef | null
}

export type TextAlign = 'left' | 'center' | 'right'

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontId: string
  /** 字号，相对画布短边，保证换尺寸时视觉比例不变。 */
  fontSize: number
  fontWeight: number
  italic: boolean
  fill: Fill
  /** 相对字号的倍数。 */
  letterSpacing: number
  lineHeight: number
  align: TextAlign
  /** 竖排中文。 */
  vertical: boolean
  stroke: { color: ColorRef; width: number } | null
  shadow: { color: ColorRef; blur: number; dx: number; dy: number } | null
  /** 文字底色块。 */
  backdrop: { color: ColorRef; padding: number; radius: number } | null
}

/** 装饰实例。decorId 指向预设库或 IndexedDB 里的自定义装饰。 */
export interface DecorLayer extends BaseLayer {
  type: 'decor'
  decorId: string
  /** 装饰内部色位 -> 实际颜色的覆盖。缺省走装饰自己声明的默认 token。 */
  colors: Record<string, ColorRef>
  flipX: boolean
  flipY: boolean
}

export interface GroupLayer extends BaseLayer {
  type: 'group'
  children: Layer[]
}

export type Layer =
  | PhotoLayer
  | ShapeLayer
  | StrokeLayer
  | TextLayer
  | DecorLayer
  | GroupLayer

export type LayerType = Layer['type']

export const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  photo: '照片',
  shape: '形状',
  stroke: '笔画',
  text: '文字',
  decor: '装饰',
  group: '编组',
}

// ---------------------------------------------------------------- 文档

export interface CanvasSpec {
  width: number
  height: number
  background: Fill
}

/**
 * 模板要填的三段文字。
 *
 * 定义在模型层而不是 layout 层，因为它是**文档数据**：必须跟着文档一起存。
 * 不然遇到不渲染某一段的模板（比如极简写真没有说明文字），那段内容在文档里
 * 就没有任何落脚处，刷新后彻底丢失。
 */
export interface TemplateTexts {
  /** 主标题，通常是艺人名。 */
  title: string
  /** 副标题。 */
  subtitle: string
  /** 补充信息，日期/地点/期号等。 */
  caption: string
}

export const DEFAULT_TEXTS: TemplateTexts = {
  title: '你的名字',
  subtitle: 'YOUR NAME',
  caption: '2026 · SPECIAL ISSUE',
}

export interface PosterDoc {
  id: string
  name: string
  version: number
  createdAt: number
  updatedAt: number
  canvas: CanvasSpec
  palette: Palette
  /** 数组顺序即 z-order，末尾在最上层。 */
  layers: Layer[]
  /** 生成这张海报所用的模板 id，用于「重新套用」和统计。 */
  templateId?: string
  /** 照片分析结果，切换模板时复用，不必重算。 */
  analysis?: ImageAnalysis
  /** 模板文字。换版型时沿用，所以必须持久化。 */
  texts?: TemplateTexts
}

// ---------------------------------------------------------------- 图像分析

/** 显著性分析的产物，喂给版型匹配。 */
export interface ImageAnalysis {
  /** 源图宽高比 w/h。 */
  aspect: number
  /** 主体包围盒，相对源图 0~1。 */
  subject: Frame
  /** 主体重心，相对源图 0~1。 */
  focus: { x: number; y: number }
  /**
   * 3x3 网格的「留白度」，0 = 信息密集，1 = 大片留白。
   * 行优先：[左上, 中上, 右上, 左中, ..., 右下]。
   */
  emptiness: number[]
  /** 整体明度均值 0~1，决定深底还是浅底更搭。 */
  luminance: number
  /** 整体彩度均值 0~1。 */
  chroma: number
}

// ---------------------------------------------------------------- 素材

/** 存进 IndexedDB assets 表的图片。 */
export interface ImageAsset {
  id: string
  blob: Blob
  width: number
  height: number
  createdAt: number
}

/** 装饰定义。预设库和用户自绘共用这一套结构。 */
export interface Decoration {
  id: string
  name: string
  category: DecorCategory
  /** 装饰内部坐标系，统一按 100x100 设计，实例化时缩放到 frame。 */
  elements: DecorElement[]
  /** 色位名 -> 默认颜色（通常是 palette token）。 */
  palette: Record<string, ColorRef>
  builtin: boolean
  createdAt: number
}

export type DecorCategory =
  | 'geometry'
  | 'frame'
  | 'sticker'
  | 'light'
  | 'sparkle'
  | 'brush'
  | 'ribbon'
  | 'stamp'
  | 'custom'

export const DECOR_CATEGORY_LABELS: Record<DecorCategory, string> = {
  geometry: '几何线框',
  frame: '边框角标',
  sticker: '胶带贴纸',
  light: '光斑噪点',
  sparkle: '星芒闪耀',
  brush: '笔触墨迹',
  ribbon: '丝带绶带',
  stamp: '日期戳',
  custom: '我的装饰',
}

/**
 * 装饰的绘制指令。刻意做得比 Layer 简单 —— 装饰是「一团图形」，
 * 不需要独立的图层属性。颜色引用色位名，由 Decoration.palette 解析。
 */
export type DecorElement =
  | {
      kind: 'path'
      /** SVG path d，坐标在 0~100 空间。 */
      d: string
      fill?: string
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }
  | {
      kind: 'circle'
      cx: number
      cy: number
      r: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }
  | {
      kind: 'rect'
      x: number
      y: number
      w: number
      h: number
      rx?: number
      rotation?: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }
  | {
      kind: 'line'
      points: number[]
      stroke: string
      strokeWidth: number
      opacity?: number
      dash?: number[]
    }
  | {
      kind: 'image'
      /** 用户导入的位图，指向 assets 表。 */
      assetId: string
      x: number
      y: number
      w: number
      h: number
      opacity?: number
    }
