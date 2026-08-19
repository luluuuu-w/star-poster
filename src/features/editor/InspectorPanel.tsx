/**
 * 右侧属性面板。三个标签页：属性（随选中图层变化）/ 配色 / 版型。
 */

import { useState } from 'react'
import { useEditor } from './store'
import { PalettePanel } from './PalettePanel'
import { TemplatePanel } from './TemplatePanel'
import { DecorPanel } from './DecorPanel'
import { LayerProperties } from './LayerProperties'

type Tab = 'props' | 'palette' | 'template' | 'decor'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'props', label: '属性' },
  { id: 'palette', label: '配色' },
  { id: 'template', label: '版型' },
  { id: 'decor', label: '装饰' },
]

export function InspectorPanel() {
  const [tab, setTab] = useState<Tab>('props')
  const selectedIds = useEditor((s) => s.selectedIds)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-panel)',
          zIndex: 2,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '11px 0',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              background: 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-dim)',
              fontSize: 13,
            }}
          >
            {t.label}
            {t.id === 'props' && selectedIds.length > 1 && ` (${selectedIds.length})`}
          </button>
        ))}
      </div>

      {tab === 'props' && <LayerProperties />}
      {tab === 'palette' && <PalettePanel />}
      {tab === 'template' && <TemplatePanel />}
      {tab === 'decor' && <DecorPanel />}
    </div>
  )
}
