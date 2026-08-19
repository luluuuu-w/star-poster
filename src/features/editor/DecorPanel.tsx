/**
 * 装饰面板：预设装饰库 + 我的装饰，点一下插进画布。
 *
 * 缩略图直接用内联 SVG 渲染装饰定义本身，而不是预先烘焙 PNG ——
 * 这样装饰跟着当前配色显示，用户看到的预览就是插进去的效果。
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  DECOR_CATEGORY_LABELS,
  type DecorCategory,
  type DecorElement,
  type Decoration,
  type Palette,
} from '../../core/model/types'
import { resolveColor } from '../../core/color/palette'
import { createDecorLayer } from '../../core/model/doc'
import { allDecorations } from '../../assets/decorations'
import { useEditor } from './store'

/** 不同类别的装饰适合的默认落点和尺寸差别很大，分开给。 */
const DEFAULT_FRAMES: Partial<Record<DecorCategory, { x: number; y: number; w: number; h: number }>> = {
  frame: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
  geometry: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
  light: { x: 0.25, y: 0.2, w: 0.5, h: 0.5 },
  ribbon: { x: 0.15, y: 0.42, w: 0.7, h: 0.16 },
  stamp: { x: 0.68, y: 0.05, w: 0.26, h: 0.12 },
}

const FALLBACK_FRAME = { x: 0.32, y: 0.32, w: 0.36, h: 0.36 }

export function DecorPanel() {
  const doc = useEditor((s) => s.doc)
  const addLayer = useEditor((s) => s.addLayer)
  const [category, setCategory] = useState<DecorCategory | 'all'>('all')

  const decorations = useMemo(() => allDecorations(), [])

  const categories = useMemo(() => {
    const present = new Set(decorations.map((d) => d.category))
    return (Object.keys(DECOR_CATEGORY_LABELS) as DecorCategory[]).filter((c) =>
      present.has(c),
    )
  }, [decorations])

  if (!doc) return null

  const visible =
    category === 'all' ? decorations : decorations.filter((d) => d.category === category)

  const insert = (d: Decoration) => {
    const frame = DEFAULT_FRAMES[d.category] ?? FALLBACK_FRAME
    addLayer(createDecorLayer(d.id, frame, d.name))
  }

  const customCount = decorations.filter((d) => !d.builtin).length

  return (
    <div>
      <div className="section">
        <div className="panel-title">装饰</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          <CatChip active={category === 'all'} onClick={() => setCategory('all')}>
            全部
          </CatChip>
          {categories.map((c) => (
            <CatChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {DECOR_CATEGORY_LABELS[c]}
            </CatChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="faint">这个分类下还没有装饰。</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {visible.map((d) => (
              <button
                key={d.id}
                onClick={() => insert(d)}
                title={`${d.name}（点击插入）`}
                style={{
                  aspectRatio: '1',
                  padding: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: doc.palette.roles.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <DecorThumb decoration={d} palette={doc.palette} />
              </button>
            ))}
          </div>
        )}

        <div className="faint" style={{ marginTop: 10 }}>
          点一下插入到画布中央，之后可以拖动、缩放、改颜色。
          {customCount === 0 && (
            <>
              {' '}
              想要自己画？去 <Link to="/studio">创作工作室</Link>。
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 9px',
        fontSize: 12,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 99,
        background: active ? 'rgba(108, 124, 255, 0.14)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * 用内联 SVG 画装饰缩略图。
 *
 * 装饰的内部坐标系就是 100x100，正好可以直接当 SVG viewBox 用，
 * 不需要任何额外的换算。
 */
export function DecorThumb({
  decoration,
  palette,
  size,
}: {
  decoration: Decoration
  palette: Palette
  size?: number
}) {
  const color = (slot: string | undefined): string | undefined => {
    if (!slot) return undefined
    return resolveColor(decoration.palette[slot] ?? slot, palette)
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size ?? '100%'}
      height={size ?? '100%'}
      style={{ display: 'block' }}
    >
      {decoration.elements.map((el, i) => (
        <DecorSvgElement key={i} el={el} color={color} />
      ))}
    </svg>
  )
}

function DecorSvgElement({
  el,
  color,
}: {
  el: DecorElement
  color: (slot: string | undefined) => string | undefined
}) {
  const common = {
    fill: 'fill' in el ? (color(el.fill) ?? 'none') : 'none',
    stroke: 'stroke' in el ? color(el.stroke) : undefined,
    strokeWidth: 'strokeWidth' in el ? el.strokeWidth : undefined,
    opacity: el.opacity ?? 1,
  }

  switch (el.kind) {
    case 'path':
      return <path d={el.d} {...common} />
    case 'circle':
      return <circle cx={el.cx} cy={el.cy} r={el.r} {...common} />
    case 'rect':
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          rx={el.rx}
          transform={el.rotation ? `rotate(${el.rotation} ${el.x} ${el.y})` : undefined}
          {...common}
        />
      )
    case 'line':
      return (
        <polyline
          points={el.points.join(',')}
          fill="none"
          stroke={color(el.stroke)}
          strokeWidth={el.strokeWidth}
          strokeDasharray={el.dash?.join(',')}
          strokeLinecap="round"
          opacity={el.opacity ?? 1}
        />
      )
    case 'image':
      // 缩略图里不加载位图，用占位块表示
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill="currentColor"
          opacity={0.25}
        />
      )
    default:
      return null
  }
}
