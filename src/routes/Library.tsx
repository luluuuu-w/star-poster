/**
 * 我的库。三个标签页：作品 / 模板 / 装饰，加上备份导入导出。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { store } from '../core/store/LocalStore'
import type { DocSummary } from '../core/store/Store'
import type { Decoration } from '../core/model/types'
import { DECOR_CATEGORY_LABELS } from '../core/model/types'
import { EMPTY_PALETTE } from '../core/model/doc'
import type { LayoutTemplate } from '../core/layout/types'
import { uncacheCustomDecoration } from '../assets/decorations'
import {
  formatBytes,
  getStorageStatus,
  type StorageStatus,
} from '../core/store/persistence'
import { DecorThumb } from '../features/editor/DecorPanel'
import { formatDate } from '../features/library/RecentDocs'

type Tab = 'docs' | 'templates' | 'decorations'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'docs', label: '我的作品' },
  { id: 'templates', label: '我的模板' },
  { id: 'decorations', label: '我的装饰' },
]

export function Library() {
  const [tab, setTab] = useState<Tab>('docs')
  const [docs, setDocs] = useState<DocSummary[] | null>(null)
  const [templates, setTemplates] = useState<LayoutTemplate[] | null>(null)
  const [decorations, setDecorations] = useState<Decoration[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [d, t, dec] = await Promise.all([
      store.listDocs(),
      store.listTemplates(),
      store.listDecorations(),
    ])
    setDocs(d)
    setTemplates(t)
    setDecorations(dec)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const exportBackup = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const backup = await store.exportAll()
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
      ).padStart(2, '0')}`
      a.download = `星海报备份_${stamp}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMessage(
        `备份已下载：${backup.docs.length} 个作品、${backup.templates.length} 个模板、${backup.decorations.length} 个装饰`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '备份失败')
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (file: File) => {
    if (!confirm('导入会合并备份里的作品、模板和装饰。同 id 的会被覆盖。继续？')) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = JSON.parse(await file.text())
      await store.importAll(backup, 'merge')
      await refresh()
      setMessage('导入完成')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  const prune = async () => {
    setBusy(true)
    try {
      const n = await store.pruneAssets()
      setMessage(n > 0 ? `清理了 ${n} 张不再使用的图片` : '没有需要清理的图片')
    } finally {
      setBusy(false)
    }
  }

  const counts: Record<Tab, number | null> = {
    docs: docs?.length ?? null,
    templates: templates?.length ?? null,
    decorations: decorations?.length ?? null,
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 24px 64px' }}>
      <div className="row" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>我的库</h1>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={prune} disabled={busy}>
          清理无用图片
        </button>
        <button className="btn btn-sm" onClick={exportBackup} disabled={busy}>
          导出备份
        </button>
        <label className="btn btn-sm" style={{ margin: 0 }}>
          导入备份
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importBackup(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 14px',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              background: 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-dim)',
              fontSize: 14,
            }}
          >
            {t.label}
            {counts[t.id] !== null && (
              <span className="faint" style={{ marginLeft: 5 }}>
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="faint" style={{ marginBottom: 18 }}>
        所有内容只存在这台设备的浏览器里。换设备或清理浏览器数据前记得导出备份。
      </div>

      <StorageNotice />

      {message && (
        <div
          style={{
            marginBottom: 18,
            padding: '10px 14px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          {message}
        </div>
      )}

      {tab === 'docs' && <DocsTab docs={docs} onChanged={refresh} />}
      {tab === 'templates' && <TemplatesTab templates={templates} onChanged={refresh} />}
      {tab === 'decorations' && (
        <DecorationsTab decorations={decorations} onChanged={refresh} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 存储状态

/**
 * 显示存储用量和持久化状态。
 *
 * 做成可见的，是因为「我的作品会不会丢」是纯前端应用最让人不安的地方。
 * 与其让用户猜，不如把浏览器到底给了什么保证摊开讲清楚。
 */
function StorageNotice() {
  const [status, setStatus] = useState<StorageStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void getStorageStatus().then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!status || !status.supported) return null

  const used = status.usage !== null ? formatBytes(status.usage) : '未知'
  const quota = status.quota !== null ? formatBytes(status.quota) : '未知'

  return (
    <div
      style={{
        marginBottom: 20,
        padding: '11px 14px',
        background: 'var(--bg-panel)',
        border: `1px solid ${status.persisted ? 'var(--border)' : '#5a4a20'}`,
        borderRadius: 'var(--radius)',
        fontSize: 13,
      }}
    >
      <div className="row" style={{ marginBottom: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.persisted ? 'var(--success)' : '#ffc043',
            flexShrink: 0,
          }}
        />
        <span>
          {status.persisted
            ? '存储已受保护：浏览器不会自动清掉你的作品'
            : '存储未受保护：磁盘空间紧张时浏览器可能自动清掉数据'}
        </span>
        <div className="spacer" />
        <span className="faint">
          已用 {used} / 可用 {quota}
        </span>
      </div>

      {!status.persisted && (
        <div className="faint">
          持久化权限由浏览器决定，通常多访问几次这个站点后会自动授予。
          在此之前建议定期「导出备份」。
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 作品

function DocsTab({
  docs,
  onChanged,
}: {
  docs: DocSummary[] | null
  onChanged: () => Promise<void>
}) {
  if (docs === null) return <div className="muted">加载中…</div>

  if (docs.length === 0) {
    return (
      <EmptyState text="还没有作品">
        <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          上传照片生成第一张
        </Link>
      </EmptyState>
    )
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`删除「${name}」？这个操作无法撤销。`)) return
    await store.deleteDoc(id)
    await onChanged()
  }

  return (
    <Grid min={180}>
      {docs.map((d) => (
        <div key={d.id}>
          <Link to={`/editor/${d.id}`}>
            <Thumb aspect="3 / 4">
              {d.thumbnail ? (
                <img
                  src={d.thumbnail}
                  alt={d.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="faint">无预览</span>
              )}
            </Thumb>
          </Link>
          <CardFooter
            title={d.name}
            subtitle={formatDate(d.updatedAt)}
            onDelete={() => void remove(d.id, d.name)}
          />
        </div>
      ))}
    </Grid>
  )
}

// ---------------------------------------------------------------- 模板

function TemplatesTab({
  templates,
  onChanged,
}: {
  templates: LayoutTemplate[] | null
  onChanged: () => Promise<void>
}) {
  if (templates === null) return <div className="muted">加载中…</div>

  if (templates.length === 0) {
    return (
      <EmptyState text="还没有自建模板">
        <Link to="/studio" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          去创作工作室设计一个
        </Link>
      </EmptyState>
    )
  }

  const remove = async (t: LayoutTemplate) => {
    if (!confirm(`删除模板「${t.name}」？已经用它生成的海报不受影响。`)) return
    await store.deleteTemplate(t.id)
    await onChanged()
  }

  return (
    <Grid min={200}>
      {templates.map((t) => (
        <div key={t.id}>
          <Thumb aspect={`${t.meta.idealAspect} / 1`}>
            <SlotPreview template={t} />
          </Thumb>
          <CardFooter
            title={t.name}
            subtitle={`${t.slots?.length ?? 0} 个槽位 · ${t.tags.join(' / ') || '无标签'}`}
            onDelete={() => void remove(t)}
          />
        </div>
      ))}
    </Grid>
  )
}

/** 用 CSS 绝对定位把槽位画出来当缩略图，不需要 Konva。 */
function SlotPreview({ template }: { template: LayoutTemplate }) {
  const colors: Record<string, string> = {
    photo: '#4d9fff',
    title: '#ffc043',
    subtitle: '#3ddc84',
    caption: '#9a9aab',
    decor: '#c77dff',
    shape: '#ff8a5b',
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#15151c' }}>
      {(template.slots ?? []).map((s) => (
        <div
          key={s.id}
          style={{
            position: 'absolute',
            left: `${s.frame.x * 100}%`,
            top: `${s.frame.y * 100}%`,
            width: `${s.frame.w * 100}%`,
            height: `${s.frame.h * 100}%`,
            background: colors[s.role] ?? '#666',
            opacity: 0.35,
            border: `1px solid ${colors[s.role] ?? '#666'}`,
            borderRadius: 2,
            transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- 装饰

function DecorationsTab({
  decorations,
  onChanged,
}: {
  decorations: Decoration[] | null
  onChanged: () => Promise<void>
}) {
  if (decorations === null) return <div className="muted">加载中…</div>

  if (decorations.length === 0) {
    return (
      <EmptyState text="还没有自己画的装饰">
        <Link to="/studio" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          去创作工作室画一个
        </Link>
      </EmptyState>
    )
  }

  const remove = async (d: Decoration) => {
    if (
      !confirm(
        `删除装饰「${d.name}」？已经用了它的海报会显示成红色虚线框，需要手动删掉那个图层。`,
      )
    ) {
      return
    }
    await store.deleteDecoration(d.id)
    // 同步清掉渲染缓存，否则本次会话里还能查到它
    uncacheCustomDecoration(d.id)
    await onChanged()
  }

  return (
    <Grid min={140}>
      {decorations.map((d) => (
        <div key={d.id}>
          <Thumb aspect="1 / 1" padding={10}>
            <DecorThumb decoration={d} palette={EMPTY_PALETTE} />
          </Thumb>
          <CardFooter
            title={d.name}
            subtitle={`${DECOR_CATEGORY_LABELS[d.category]} · ${d.elements.length} 个笔画`}
            onDelete={() => void remove(d)}
          />
        </div>
      ))}
    </Grid>
  )
}

// ---------------------------------------------------------------- 通用小件

function Grid({ min, children }: { min: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: 18,
      }}
    >
      {children}
    </div>
  )
}

function Thumb({
  aspect,
  padding,
  children,
}: {
  aspect: string
  padding?: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: aspect,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
      }}
    >
      {children}
    </div>
  )
}

function CardFooter({
  title,
  subtitle,
  onDelete,
}: {
  title: string
  subtitle: string
  onDelete: () => void
}) {
  return (
    <div className="row" style={{ marginTop: 7 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </div>
        <div
          className="faint"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {subtitle}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm btn-danger" onClick={onDelete} title="删除">
        ×
      </button>
    </div>
  )
}

function EmptyState({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius)',
      }}
    >
      <p className="muted" style={{ marginBottom: 16 }}>
        {text}
      </p>
      {children}
    </div>
  )
}
