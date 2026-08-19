/**
 * 配色面板：4 套变体切换 + 单个角色手动改色 + 提取到的色板。
 */

import {
  PALETTE_ROLES,
  ROLE_LABELS,
  VARIANT_LABELS,
  type PaletteVariantId,
} from '../../core/model/types'
import { contrastRatio } from '../../core/color/contrast'
import { useEditor } from './store'

const VARIANTS: PaletteVariantId[] = ['faithful', 'contrast', 'soft', 'mono']

export function PalettePanel() {
  const doc = useEditor((s) => s.doc)
  const setVariant = useEditor((s) => s.setVariant)
  const setRoleColor = useEditor((s) => s.setRoleColor)

  if (!doc) return null
  const { palette } = doc

  return (
    <div>
      <div className="section">
        <div className="panel-title">配色方案</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {VARIANTS.map((v) => (
            <button
              key={v}
              className="btn btn-sm"
              onClick={() => setVariant(v)}
              style={
                palette.variantId === v
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : undefined
              }
            >
              {VARIANT_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 8 }}>
          切换方案会让所有用了配色变量的元素同步变色。
        </div>
      </div>

      <div className="section">
        <div className="panel-title">角色颜色</div>
        {PALETTE_ROLES.map((role) => {
          const hex = palette.roles[role]
          // 文字色要提示对比度，这是自动生成最容易出问题的地方
          const bgFor =
            role === 'textOnBg' ? palette.roles.bg
              : role === 'textOnPrimary' ? palette.roles.primary
              : null
          const ratio = bgFor ? contrastRatio(hex, bgFor) : null

          return (
            <div
              key={role}
              className="row"
              style={{ marginBottom: 8 }}
            >
              <label
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: hex,
                  border: '1px solid var(--border-strong)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setRoleColor(role, e.target.value)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />
              </label>

              <span style={{ fontSize: 13, flex: 1 }}>{ROLE_LABELS[role]}</span>

              {ratio !== null && (
                <span
                  className="faint"
                  title={`与底色的对比度。低于 4.5 文字会看不清`}
                  style={{ color: ratio >= 4.5 ? 'var(--success)' : 'var(--danger)' }}
                >
                  {ratio.toFixed(1)}:1
                </span>
              )}

              <code style={{ fontSize: 11, color: 'var(--text-faint)' }}>{hex}</code>
            </div>
          )
        })}
      </div>

      {palette.swatches.length > 0 && (
        <div className="section">
          <div className="panel-title">从照片提取</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {palette.swatches.map((s, i) => (
              <div
                key={i}
                title={`${s.hex} · 占比 ${(s.weight * 100).toFixed(1)}%`}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 4,
                  background: s.hex,
                  border: '1px solid var(--border)',
                }}
              />
            ))}
          </div>
          <div className="faint" style={{ marginTop: 8 }}>
            按在照片里的占比排序。
          </div>
        </div>
      )}
    </div>
  )
}
