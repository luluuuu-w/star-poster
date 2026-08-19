/**
 * 图层面板。列表顺序与 z-order 相反（最上层显示在最前）。
 */

import { LAYER_TYPE_LABELS, type Layer } from '../../core/model/types'
import { useEditor } from './store'

const TYPE_ICONS: Record<Layer['type'], string> = {
  photo: '▣',
  shape: '◆',
  stroke: '✎',
  text: 'T',
  decor: '✦',
  group: '▤',
}

export function LayerPanel() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const select = useEditor((s) => s.select)
  const updateLayer = useEditor((s) => s.updateLayer)
  const removeLayers = useEditor((s) => s.removeLayers)
  const duplicateLayer = useEditor((s) => s.duplicateLayer)
  const reorderLayer = useEditor((s) => s.reorderLayer)

  if (!doc) return null

  // 顶层在列表最前面，符合设计软件的习惯
  const ordered = [...doc.layers].reverse()

  return (
    <div className="section" style={{ borderBottom: 'none' }}>
      <div className="panel-title">图层 ({doc.layers.length})</div>

      {ordered.length === 0 && <div className="faint">还没有图层</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ordered.map((layer, displayIndex) => {
          // 列表是反序的，换算回真实索引
          const realIndex = doc.layers.length - 1 - displayIndex
          const selected = selectedIds.includes(layer.id)

          return (
            <div
              key={layer.id}
              onClick={(e) => select(layer.id, e.shiftKey)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                background: selected ? 'rgba(108, 124, 255, 0.16)' : 'transparent',
                border: `1px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer',
                opacity: layer.visible ? 1 : 0.42,
              }}
            >
              <span
                style={{
                  width: 16,
                  textAlign: 'center',
                  color: 'var(--text-faint)',
                  fontSize: 12,
                  flexShrink: 0,
                }}
                title={LAYER_TYPE_LABELS[layer.type]}
              >
                {TYPE_ICONS[layer.type]}
              </span>

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={layer.name}
              >
                {layer.name}
              </span>

              <IconBtn
                title={layer.visible ? '隐藏' : '显示'}
                onClick={() =>
                  updateLayer(layer.id, '切换可见', (l) => void (l.visible = !l.visible))
                }
              >
                {layer.visible ? '◉' : '○'}
              </IconBtn>

              <IconBtn
                title={layer.locked ? '解锁' : '锁定'}
                onClick={() =>
                  updateLayer(layer.id, '切换锁定', (l) => void (l.locked = !l.locked))
                }
              >
                {layer.locked ? '🔒' : '🔓'}
              </IconBtn>

              <IconBtn
                title="上移一层"
                disabled={realIndex === doc.layers.length - 1}
                onClick={() => reorderLayer(layer.id, realIndex + 1)}
              >
                ↑
              </IconBtn>

              <IconBtn
                title="下移一层"
                disabled={realIndex === 0}
                onClick={() => reorderLayer(layer.id, realIndex - 1)}
              >
                ↓
              </IconBtn>

              <IconBtn title="复制" onClick={() => duplicateLayer(layer.id)}>
                ⧉
              </IconBtn>

              <IconBtn title="删除" danger onClick={() => removeLayers([layer.id])}>
                ×
              </IconBtn>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => {
        // 别触发外层的选中
        e.stopPropagation()
        onClick()
      }}
      style={{
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--danger)' : 'var(--text-faint)',
        fontSize: 12,
        borderRadius: 3,
        opacity: disabled ? 0.25 : 1,
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}
