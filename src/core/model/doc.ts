/**
 * PosterDoc 的构造与操作辅助函数。
 * 所有创建图层的入口都在这里，保证默认值一致、id 唯一。
 */

import {
  DEFAULT_FILTERS,
  DOC_VERSION,
  solid,
  type BlendMode,
  type DecorLayer,
  type Frame,
  type Layer,
  type Palette,
  type PhotoLayer,
  type PosterDoc,
  type ShapeKind,
  type ShapeLayer,
  type StrokeLayer,
  type TextLayer,
} from './types'

// ---------------------------------------------------------------- id

/** crypto.randomUUID 在所有目标浏览器都有；带个后备免得非安全上下文炸掉。 */
export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${raw}` : raw
}

// ---------------------------------------------------------------- 默认值

export const DEFAULT_CANVAS = { width: 1080, height: 1350 } // 小红书竖图

export const EMPTY_PALETTE: Palette = {
  swatches: [],
  roles: {
    bg: '#12121a',
    surface: '#22222e',
    primary: '#7a6cf0',
    accent: '#f0b03c',
    accentText: '#f0b03c',
    textOnBg: '#ffffff',
    textOnPrimary: '#ffffff',
  },
  variantId: 'faithful',
}

const baseLayer = (name: string, frame: Frame) => ({
  id: uid('ly'),
  name,
  frame,
  rotation: 0,
  opacity: 1,
  blendMode: 'normal' as BlendMode,
  visible: true,
  locked: false,
})

// ---------------------------------------------------------------- 工厂

export function createDoc(params?: Partial<PosterDoc>): PosterDoc {
  const now = Date.now()
  return {
    id: uid('doc'),
    name: '未命名海报',
    version: DOC_VERSION,
    createdAt: now,
    updatedAt: now,
    canvas: {
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
      background: solid('@bg'),
    },
    palette: EMPTY_PALETTE,
    layers: [],
    ...params,
  }
}

export function createPhotoLayer(
  assetId: string,
  frame: Frame,
  name = '照片',
): PhotoLayer {
  return {
    ...baseLayer(name, frame),
    type: 'photo',
    assetId,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    mask: 'none',
    maskRadius: 0.06,
    filters: { ...DEFAULT_FILTERS },
  }
}

export function createTextLayer(
  text: string,
  frame: Frame,
  overrides: Partial<TextLayer> = {},
): TextLayer {
  return {
    ...baseLayer(text.slice(0, 12) || '文字', frame),
    type: 'text',
    text,
    fontId: 'sans',
    fontSize: 0.06,
    fontWeight: 400,
    italic: false,
    fill: solid('@textOnBg'),
    letterSpacing: 0,
    lineHeight: 1.25,
    align: 'left',
    vertical: false,
    stroke: null,
    shadow: null,
    backdrop: null,
    ...overrides,
  }
}

export function createShapeLayer(
  shape: ShapeKind,
  frame: Frame,
  overrides: Partial<ShapeLayer> = {},
): ShapeLayer {
  return {
    ...baseLayer('形状', frame),
    type: 'shape',
    shape,
    fill: solid('@primary'),
    stroke: null,
    radius: 0,
    points: [],
    ...overrides,
  }
}

export function createStrokeLayer(
  points: Array<[number, number]>,
  frame: Frame,
  overrides: Partial<StrokeLayer> = {},
): StrokeLayer {
  return {
    ...baseLayer('笔画', frame),
    type: 'stroke',
    points,
    color: '@accent',
    width: 0.008,
    closed: false,
    fill: null,
    ...overrides,
  }
}

export function createDecorLayer(
  decorId: string,
  frame: Frame,
  name = '装饰',
): DecorLayer {
  return {
    ...baseLayer(name, frame),
    type: 'decor',
    decorId,
    colors: {},
    flipX: false,
    flipY: false,
  }
}

// ---------------------------------------------------------------- 查询

/** 深度查找图层（会进 group）。 */
export function findLayer(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const found = findLayer(l.children, id)
      if (found) return found
    }
  }
  return null
}

/** 扁平化所有图层，group 自身也包含在内。 */
export function flattenLayers(layers: Layer[]): Layer[] {
  const out: Layer[] = []
  for (const l of layers) {
    out.push(l)
    if (l.type === 'group') out.push(...flattenLayers(l.children))
  }
  return out
}

/** 文档里第一个照片图层 —— 换照片、重新分析时都要找它。 */
export function findPhotoLayer(doc: PosterDoc): PhotoLayer | null {
  for (const l of flattenLayers(doc.layers)) {
    if (l.type === 'photo') return l
  }
  return null
}

/** 收集文档引用到的所有 assetId，用于清理孤儿资源。 */
export function collectAssetIds(doc: PosterDoc): Set<string> {
  const ids = new Set<string>()
  for (const l of flattenLayers(doc.layers)) {
    if (l.type === 'photo') ids.add(l.assetId)
  }
  return ids
}

// ---------------------------------------------------------------- 几何

/** frame 的中心点。 */
export function frameCenter(f: Frame): { x: number; y: number } {
  return { x: f.x + f.w / 2, y: f.y + f.h / 2 }
}

/** 两个 frame 的交并比。版型匹配打分用。 */
export function iou(a: Frame, b: Frame): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)

  if (x1 <= x0 || y1 <= y0) return 0

  const inter = (x1 - x0) * (y1 - y0)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/**
 * 计算「cover」式裁切：把源图按比例填满目标框，返回应取的源图区域。
 *
 * @param focus 焦点（相对源图 0~1）。裁切窗口会尽量把焦点放在中间，
 *   这样自动裁切不会把人脸切掉 —— 这是自动出稿最容易翻车的地方。
 */
export function coverCrop(
  sourceAspect: number,
  targetAspect: number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Frame {
  let w = 1
  let h = 1

  if (sourceAspect > targetAspect) {
    // 源图更宽，左右裁
    w = targetAspect / sourceAspect
  } else {
    // 源图更高，上下裁
    h = sourceAspect / targetAspect
  }

  // 以焦点为中心开窗，再夹回 [0,1] 内
  const x = clamp01(focus.x - w / 2, w)
  const y = clamp01(focus.y - h / 2, h)

  return { x, y, w, h }
}

function clamp01(v: number, size: number): number {
  return Math.max(0, Math.min(1 - size, v))
}
