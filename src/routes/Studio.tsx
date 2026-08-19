/**
 * 创作工作室。两个模式：画装饰 / 设计版型。
 */

import { useState } from 'react'
import { Link } from 'react-router'
import { DecorDrawer } from '../features/studio/DecorDrawer'
import { TemplateDesigner } from '../features/studio/TemplateDesigner'

type Mode = 'decor' | 'template'

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'decor', label: '画装饰', hint: '自己画图形，存成可复用的装饰' },
  { id: 'template', label: '设计版型', hint: '摆放槽位，存成可复用的排版模板' },
]

export function Studio() {
  const [mode, setMode] = useState<Mode>('decor')
  const [savedHint, setSavedHint] = useState<string | null>(null)

  return (
    <div style={{ padding: '24px 24px 64px', minWidth: 1160 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>创作工作室</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className="btn btn-sm"
              onClick={() => {
                setMode(m.id)
                setSavedHint(null)
              }}
              style={
                mode === m.id
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : undefined
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        {savedHint && (
          <span className="faint" style={{ color: 'var(--success)' }}>
            {savedHint}
          </span>
        )}
        <Link to="/library" className="btn btn-sm" style={{ textDecoration: 'none' }}>
          我的库
        </Link>
      </div>

      <p className="muted" style={{ margin: '0 0 20px' }}>
        {MODES.find((m) => m.id === mode)?.hint}
      </p>

      {mode === 'decor' ? (
        <DecorDrawer onSaved={(d) => setSavedHint(`装饰「${d.name}」已保存`)} />
      ) : (
        <TemplateDesigner onSaved={(t) => setSavedHint(`模板「${t.name}」已保存`)} />
      )}
    </div>
  )
}
