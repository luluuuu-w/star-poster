/**
 * 插入元素工具条。
 *
 * 新元素统一插在画布中央附近、尺寸适中，用户插入后马上能看到并调整 ——
 * 比插在 (0,0) 或者要求用户先画一个框友好得多。
 */

import { useState } from 'react'
import { solid, type ShapeKind } from '../../core/model/types'
import {
  createShapeLayer,
  createTextLayer,
} from '../../core/model/doc'
import { useEditor } from './store'

/** 新元素默认落点。稍微偏上，因为多数海报下半部已经有文字了。 */
const DROP = { x: 0.22, y: 0.36, w: 0.56, h: 0.14 }

const SHAPES: Array<{ kind: ShapeKind; label: string; frame?: typeof DROP }> = [
  { kind: 'rect', label: '矩形' },
  { kind: 'ellipse', label: '椭圆', frame: { x: 0.3, y: 0.34, w: 0.4, h: 0.28 } },
  { kind: 'triangle', label: '三角', frame: { x: 0.32, y: 0.34, w: 0.36, h: 0.3 } },
  { kind: 'line', label: '线条', frame: { x: 0.2, y: 0.45, w: 0.6, h: 0.02 } },
]

export function InsertBar() {
  const doc = useEditor((s) => s.doc)
  const addLayer = useEditor((s) => s.addLayer)
  const [shapeOpen, setShapeOpen] = useState(false)

  if (!doc) return null

  const addText = () => {
    addLayer(
      createTextLayer('双击编辑文字', DROP, {
        name: '文字',
        fontSize: 0.055,
        fontWeight: 600,
        align: 'center',
        // 默认给个阴影，保证压在照片上也读得清
        shadow: { color: '@bg', blur: 0.01, dx: 0.002, dy: 0.003 },
      }),
    )
  }

  const addShape = (kind: ShapeKind, frame = DROP) => {
    addLayer(
      createShapeLayer(kind, frame, {
        name: SHAPES.find((s) => s.kind === kind)?.label ?? '形状',
        fill: kind === 'line' ? null : solid('@accent'),
        stroke: kind === 'line' ? { color: '@accent', width: 0.004 } : null,
        radius: kind === 'rect' ? 0.04 : 0,
      }),
    )
    setShapeOpen(false)
  }

  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="btn btn-sm" onClick={addText} title="插入文字">
        + 文字
      </button>

      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-sm"
          onClick={() => setShapeOpen((v) => !v)}
          title="插入形状"
        >
          + 形状
        </button>
        {shapeOpen && (
          <>
            <div
              onClick={() => setShapeOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 20 }}
            />
            <div
              className="panel"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 21,
                minWidth: 120,
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ padding: 6 }}>
                {SHAPES.map((s) => (
                  <button
                    key={s.kind}
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => addShape(s.kind, s.frame)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
