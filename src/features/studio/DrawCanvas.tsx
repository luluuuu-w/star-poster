/**
 * 绘制画布。
 *
 * 所有坐标在 100x100 的装饰空间里，显示尺寸只用于换算。父组件持有元素数组，
 * 这里只负责把手势翻译成元素并回调 —— 这样撤销、保存都由父组件统一管理。
 */

import { useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva'
import type Konva from 'konva'
import type { DecorElement, Palette } from '../../core/model/types'
import { resolveColor } from '../../core/color/palette'
import {
  DECOR_SPACE,
  brushColorRef,
  clampToSpace,
  hitsElement,
  simplifyPath,
  type BrushSettings,
  type Tool,
} from './drawing'

export interface DrawCanvasProps {
  elements: DecorElement[]
  /** 色位 -> 配色变量，用于预览。 */
  slotBinding: Record<string, string>
  /** 预览用的配色方案。 */
  palette: Palette
  tool: Tool
  brush: BrushSettings
  /** 显示边长（像素）。 */
  size: number
  /** 导入的位图，assetId -> 已解码图片。 */
  images: Map<string, HTMLImageElement>
  selectedIndex: number | null

  onCommit: (el: DecorElement) => void
  onErase: (index: number) => void
  onSelect: (index: number | null) => void
  /** 网格吸附的格距，0 = 不吸附。 */
  gridSnap: number
}

export function DrawCanvas({
  elements,
  slotBinding,
  palette,
  tool,
  brush,
  size,
  images,
  selectedIndex,
  onCommit,
  onErase,
  onSelect,
  gridSnap,
}: DrawCanvasProps) {
  const scale = size / DECOR_SPACE

  /**
   * 正在画但还没提交的元素。
   *
   * 同时存在 ref 和 state 里：ref 是同步的真相（收笔时要立刻读到最新几何），
   * state 只负责触发重绘。绝不能在 setState 的 updater 里调用 onCommit ——
   * updater 在渲染阶段执行，React 严格模式会双调用它，一笔会被提交两次。
   */
  const draftRef = useRef<DecorElement | null>(null)
  const [draft, setDraftState] = useState<DecorElement | null>(null)

  const setDraft = (next: DecorElement | null) => {
    draftRef.current = next
    setDraftState(next)
  }

  /** 多边形正在累积的顶点。 */
  const [polyPoints, setPolyPoints] = useState<number[]>([])

  const drawingRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const shiftRef = useRef(false)

  /** 屏幕坐标 -> 装饰空间坐标，顺带处理网格吸附。 */
  const toSpace = (stage: Konva.Stage | null): { x: number; y: number } | null => {
    const p = stage?.getPointerPosition()
    if (!p) return null

    let x = p.x / scale
    let y = p.y / scale

    if (gridSnap > 0) {
      x = Math.round(x / gridSnap) * gridSnap
      y = Math.round(y / gridSnap) * gridSnap
    }

    return { x: clampToSpace(x), y: clampToSpace(y) }
  }

  const colorRef = brushColorRef(brush)
  /** 把色位/hex 解析成实际显示色。 */
  const show = (ref: string | undefined): string | undefined => {
    if (!ref) return undefined
    return resolveColor(slotBinding[ref] ?? ref, palette)
  }

  const strokeStyle = () => ({
    stroke: colorRef,
    strokeWidth: brush.width,
    opacity: brush.opacity,
  })

  const shapeStyle = () =>
    brush.filled
      ? { fill: colorRef, opacity: brush.opacity }
      : { stroke: colorRef, strokeWidth: brush.width, opacity: brush.opacity }

  const handleDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = toSpace(e.target.getStage())
    if (!pos) return

    shiftRef.current = 'shiftKey' in e.evt ? e.evt.shiftKey : false

    // --- 橡皮 / 选择：命中测试，从最上层往下找
    if (tool === 'eraser' || tool === 'select') {
      // 命中容差随笔宽走，但不小于 2（太小的话细线根本点不到）
      const tol = Math.max(2, brush.width)
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitsElement(elements[i], pos.x, pos.y, tol)) {
          if (tool === 'eraser') onErase(i)
          else onSelect(i)
          return
        }
      }
      if (tool === 'select') onSelect(null)
      return
    }

    // --- 多边形：点击累积顶点
    if (tool === 'polygon') {
      setPolyPoints((prev) => [...prev, pos.x, pos.y])
      return
    }

    drawingRef.current = true
    startRef.current = pos

    if (tool === 'brush') {
      setDraft({ kind: 'line', points: [pos.x, pos.y], ...strokeStyle() })
    } else if (tool === 'line') {
      setDraft({ kind: 'line', points: [pos.x, pos.y, pos.x, pos.y], ...strokeStyle() })
    } else if (tool === 'rect') {
      setDraft({ kind: 'rect', x: pos.x, y: pos.y, w: 0, h: 0, ...shapeStyle() })
    } else if (tool === 'ellipse') {
      setDraft({ kind: 'circle', cx: pos.x, cy: pos.y, r: 0, ...shapeStyle() })
    }
  }

  const handleMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!drawingRef.current || !startRef.current) return

    const pos = toSpace(e.target.getStage())
    if (!pos) return

    const start = startRef.current
    const shift = 'shiftKey' in e.evt ? e.evt.shiftKey : shiftRef.current
    const prev = draftRef.current
    if (!prev) return

    if (tool === 'brush' && prev.kind === 'line') {
      setDraft({ ...prev, points: [...prev.points, pos.x, pos.y] })
      return
    }

    if (tool === 'line' && prev.kind === 'line') {
      let end = pos
      if (shift) {
        // Shift 约束到水平/垂直/45°
        const dx = pos.x - start.x
        const dy = pos.y - start.y
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(dx, dy)
        end = { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len }
      }
      setDraft({ ...prev, points: [start.x, start.y, end.x, end.y] })
      return
    }

    if (tool === 'rect' && prev.kind === 'rect') {
      let w = pos.x - start.x
      let h = pos.y - start.y
      if (shift) {
        const s = Math.max(Math.abs(w), Math.abs(h))
        w = Math.sign(w || 1) * s
        h = Math.sign(h || 1) * s
      }
      // 支持往左上拖：负宽高换算成正的 + 起点前移
      setDraft({
        ...prev,
        x: w < 0 ? start.x + w : start.x,
        y: h < 0 ? start.y + h : start.y,
        w: Math.abs(w),
        h: Math.abs(h),
      })
      return
    }

    if (tool === 'ellipse' && prev.kind === 'circle') {
      setDraft({ ...prev, r: Math.hypot(pos.x - start.x, pos.y - start.y) })
    }
  }

  const handleUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    startRef.current = null

    // 从 ref 读，保证拿到的是最后一次 move 的几何
    const finished = draftRef.current
    setDraft(null)
    if (!finished) return

    // 太小的图形多半是误触，丢掉
    if (finished.kind === 'rect' && (finished.w < 0.8 || finished.h < 0.8)) return
    if (finished.kind === 'circle' && finished.r < 0.8) return

    if (finished.kind === 'line') {
      if (tool === 'brush') {
        // 单点也保留 —— 用户可能就是想点一个圆点
        onCommit({ ...finished, points: simplifyPath(finished.points) })
      } else {
        const [x1, y1, x2, y2] = finished.points
        if (Math.hypot(x2 - x1, y2 - y1) < 0.8) return
        onCommit(finished)
      }
      return
    }

    onCommit(finished)
  }

  /** 多边形闭合。 */
  const closePolygon = () => {
    if (polyPoints.length < 6) {
      // 少于 3 个点构不成多边形
      setPolyPoints([])
      return
    }
    onCommit({
      kind: 'line',
      points: polyPoints,
      ...(brush.filled
        ? { stroke: colorRef, strokeWidth: 0.01, opacity: brush.opacity }
        : { stroke: colorRef, strokeWidth: brush.width, opacity: brush.opacity }),
    })
    setPolyPoints([])
  }

  return (
    <div
      style={{ position: 'relative', width: size, height: size }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && polyPoints.length > 0) {
          e.preventDefault()
          closePolygon()
        }
        if (e.key === 'Escape') setPolyPoints([])
      }}
    >
      <Stage
        width={size}
        height={size}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleDown}
        onTouchStart={handleDown}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
        onMouseUp={handleUp}
        onTouchEnd={handleUp}
        // 鼠标拖出画布再松开也要收笔，否则会一直处于绘制状态
        onMouseLeave={handleUp}
        onDblClick={() => polyPoints.length > 0 && closePolygon()}
        style={{
          background: palette.roles.bg,
          borderRadius: 'var(--radius-sm)',
          cursor: tool === 'eraser' ? 'not-allowed' : tool === 'select' ? 'default' : 'crosshair',
        }}
      >
        {/* 网格垫底，方便对齐 */}
        <Layer listening={false}>
          <GridBackground snap={gridSnap} />
        </Layer>

        <Layer listening={false}>
          {elements.map((el, i) => (
            <DrawnElement
              key={i}
              el={el}
              show={show}
              images={images}
              highlighted={i === selectedIndex}
            />
          ))}

          {draft && <DrawnElement el={draft} show={show} images={images} />}

          {/* 多边形预览：已确定的边 + 顶点 */}
          {polyPoints.length >= 4 && (
            <Line
              points={polyPoints}
              stroke={show(colorRef)}
              strokeWidth={brush.width}
              opacity={brush.opacity * 0.8}
              lineCap="round"
            />
          )}
          {polyPoints.length >= 2 &&
            Array.from({ length: polyPoints.length / 2 }, (_, i) => (
              <Circle
                key={`pt${i}`}
                x={polyPoints[i * 2]}
                y={polyPoints[i * 2 + 1]}
                radius={1.2}
                fill="#4d9fff"
              />
            ))}
        </Layer>
      </Stage>

      {polyPoints.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: 99,
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          已放 {polyPoints.length / 2} 个点 · 双击或回车闭合 · Esc 取消
        </div>
      )}
    </div>
  )
}

/** 淡淡的网格，只在开启吸附时显示。 */
function GridBackground({ snap }: { snap: number }) {
  if (snap <= 0) return null

  const lines: React.ReactNode[] = []
  for (let v = snap; v < DECOR_SPACE; v += snap) {
    const major = Math.abs(v - DECOR_SPACE / 2) < 1e-6
    lines.push(
      <Line
        key={`v${v}`}
        points={[v, 0, v, DECOR_SPACE]}
        stroke="#ffffff"
        strokeWidth={major ? 0.35 : 0.15}
        opacity={major ? 0.28 : 0.14}
      />,
      <Line
        key={`h${v}`}
        points={[0, v, DECOR_SPACE, v]}
        stroke="#ffffff"
        strokeWidth={major ? 0.35 : 0.15}
        opacity={major ? 0.28 : 0.14}
      />,
    )
  }
  return <Group>{lines}</Group>
}

/** 画一个装饰元素。和渲染层的 DecorNode 逻辑一致，但多了选中高亮。 */
function DrawnElement({
  el,
  show,
  images,
  highlighted,
}: {
  el: DecorElement
  show: (ref: string | undefined) => string | undefined
  images: Map<string, HTMLImageElement>
  highlighted?: boolean
}) {
  const hl = highlighted
    ? { shadowColor: '#4d9fff', shadowBlur: 3, shadowOpacity: 1 }
    : {}

  switch (el.kind) {
    case 'line':
      return (
        <Line
          points={el.points}
          stroke={show(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          lineCap="round"
          lineJoin="round"
          tension={el.points.length > 6 ? 0.35 : 0}
          {...hl}
        />
      )
    case 'rect':
      return (
        <Rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          cornerRadius={el.rx}
          fill={show(el.fill)}
          stroke={show(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          {...hl}
        />
      )
    case 'circle':
      return (
        <Ellipse
          x={el.cx}
          y={el.cy}
          radiusX={el.r}
          radiusY={el.r}
          fill={show(el.fill)}
          stroke={show(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          {...hl}
        />
      )
    case 'image': {
      const img = images.get(el.assetId)
      if (!img) return null
      return (
        <KonvaImage
          image={img}
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          opacity={el.opacity ?? 1}
          {...hl}
        />
      )
    }
    default:
      return null
  }
}
