/**
 * 绘制工作区共享的类型与工具。
 *
 * 装饰的内部坐标系固定是 100x100（见 model/types.ts 的 Decoration），
 * 所以绘制时一律在 0~100 的空间里记录，显示尺寸只影响换算，不影响数据。
 * 好处是同一个装饰放大到整张海报或缩成一个小角标，都不用改定义。
 */

import type { DecorElement } from '../../core/model/types'

/** 装饰内部坐标系边长。 */
export const DECOR_SPACE = 100

export type Tool =
  | 'brush'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'select'

export const TOOL_LABELS: Record<Tool, string> = {
  brush: '画笔',
  eraser: '橡皮',
  line: '直线',
  rect: '矩形',
  ellipse: '椭圆',
  polygon: '多边形',
  select: '选择',
}

export const TOOL_HINTS: Record<Tool, string> = {
  brush: '按住拖动自由绘制',
  eraser: '点击笔画把它整条删掉（装饰是矢量的，没法擦掉局部像素）',
  line: '按住拖动画一条直线',
  rect: '按住拖动画矩形，按住 Shift 画正方形',
  ellipse: '按住拖动画椭圆，按住 Shift 画圆',
  polygon: '依次点击顶点，双击或按 Enter 闭合',
  select: '点击选中笔画，Delete 删除',
}

/**
 * 色位。
 *
 * 这是让「自己画的装饰」和内置装饰一样能跟着海报配色变的关键：绘制时选的
 * 不是具体颜色，而是 c1/c2/c3 三个色位，色位再映射到配色变量。插进海报后
 * 换配色方案，装饰就会跟着变。想要固定颜色也可以，直接存 hex。
 */
export const COLOR_SLOTS = ['c1', 'c2', 'c3'] as const
export type ColorSlot = (typeof COLOR_SLOTS)[number]

export const DEFAULT_SLOT_BINDING: Record<ColorSlot, string> = {
  c1: '@accent',
  c2: '@primary',
  c3: '@textOnBg',
}

export const SLOT_LABELS: Record<ColorSlot, string> = {
  c1: '色位 1',
  c2: '色位 2',
  c3: '色位 3',
}

/** 绘制时的画笔设置。 */
export interface BrushSettings {
  /** 用哪个色位，或 null 表示用 fixedColor 的固定颜色。 */
  slot: ColorSlot | null
  fixedColor: string
  /** 线宽，100x100 空间里的值。 */
  width: number
  opacity: number
  /** 形状工具是填充还是描边。 */
  filled: boolean
}

export const DEFAULT_BRUSH: BrushSettings = {
  slot: 'c1',
  fixedColor: '#ffffff',
  width: 2.5,
  opacity: 1,
  filled: false,
}

/** 画笔当前该用的颜色引用（色位名或 hex）。 */
export function brushColorRef(brush: BrushSettings): string {
  return brush.slot ?? brush.fixedColor
}

/**
 * 把点序列简化，去掉几乎共线的中间点。
 *
 * 鼠标每移动一像素就产生一个点，一笔下来动辄几百个。不简化的话，
 * 存进 IndexedDB 的装饰会非常臃肿，渲染也慢。用 Ramer–Douglas–Peucker，
 * 视觉上看不出差别但点数通常能降到十分之一。
 */
export function simplifyPath(points: number[], tolerance = 0.4): number[] {
  if (points.length <= 4) return points

  // 转成点对方便处理
  const pts: Array<[number, number]> = []
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]])

  const keep = rdp(pts, tolerance)

  const out: number[] = []
  for (const [x, y] of keep) out.push(x, y)
  return out
}

function rdp(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length < 3) return pts

  let maxDist = 0
  let index = 0
  const first = pts[0]
  const last = pts[pts.length - 1]

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], first, last)
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist <= tol) return [first, last]

  const left = rdp(pts.slice(0, index + 1), tol)
  const right = rdp(pts.slice(index), tol)
  // left 的末尾和 right 的开头是同一个点，去掉一个
  return [...left.slice(0, -1), ...right]
}

function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)

  // 首尾重合时退化为点距
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1])

  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

/** 元素的粗略包围盒，用于橡皮命中判断和自动裁切。 */
export function elementBounds(
  el: DecorElement,
): { x: number; y: number; w: number; h: number } | null {
  switch (el.kind) {
    case 'circle':
      return { x: el.cx - el.r, y: el.cy - el.r, w: el.r * 2, h: el.r * 2 }
    case 'rect':
    case 'image':
      return { x: el.x, y: el.y, w: el.w, h: el.h }
    case 'line': {
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < el.points.length; i += 2) {
        xs.push(el.points[i])
        ys.push(el.points[i + 1])
      }
      if (xs.length === 0) return null
      const x0 = Math.min(...xs)
      const y0 = Math.min(...ys)
      return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
    }
    case 'path':
      // path 的精确包围盒要解析 d，绘制工具不产出 path，这里不需要
      return null
    default:
      return null
  }
}

/** 点到某个元素的距离是否在阈值内（橡皮 / 选择的命中判断）。 */
export function hitsElement(el: DecorElement, x: number, y: number, tol: number): boolean {
  if (el.kind === 'line') {
    // 逐段算点到线段距离，比用包围盒精确得多 —— 一条斜线的包围盒很大，
    // 用包围盒判断会导致点空白处也把线删掉
    for (let i = 0; i + 3 < el.points.length; i += 2) {
      const d = pointToSegment(
        x,
        y,
        el.points[i],
        el.points[i + 1],
        el.points[i + 2],
        el.points[i + 3],
      )
      if (d <= tol + (el.strokeWidth ?? 1) / 2) return true
    }
    // 单点笔画（点一下没拖动）
    if (el.points.length === 2) {
      return Math.hypot(x - el.points[0], y - el.points[1]) <= tol + (el.strokeWidth ?? 1)
    }
    return false
  }

  if (el.kind === 'circle') {
    const d = Math.hypot(x - el.cx, y - el.cy)
    // 填充的圆内部也算命中；只有描边的话只有边缘附近算
    if (el.fill) return d <= el.r + tol
    return Math.abs(d - el.r) <= tol + (el.strokeWidth ?? 1)
  }

  const b = elementBounds(el)
  if (!b) return false
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
}

function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1)

  // 投影参数夹到 [0,1]，保证落在线段而不是无限长直线上
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** 夹到装饰坐标空间内。 */
export function clampToSpace(v: number): number {
  return Math.max(0, Math.min(DECOR_SPACE, v))
}
