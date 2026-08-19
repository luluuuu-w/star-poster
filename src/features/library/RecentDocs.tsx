/**
 * 首页底部的「最近作品」。
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { store } from '../../core/store/LocalStore'
import type { DocSummary } from '../../core/store/Store'

export function RecentDocs({ limit = 6 }: { limit?: number }) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void store.listDocs().then((list) => {
      if (!cancelled) setDocs(list.slice(0, limit))
    })
    return () => {
      cancelled = true
    }
  }, [limit])

  // 加载中和「确实没有作品」是两回事，前者不该闪一下空状态
  if (docs === null || docs.length === 0) return null

  return (
    <section style={{ marginTop: 40 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="panel-title" style={{ padding: 0 }}>
          最近作品
        </div>
        <div className="spacer" />
        <Link to="/library" className="faint" style={{ color: 'var(--text-dim)' }}>
          查看全部 →
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 14,
        }}
      >
        {docs.map((d) => (
          <Link
            key={d.id}
            to={`/editor/${d.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              style={{
                aspectRatio: '3 / 4',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {d.thumbnail ? (
                <img
                  src={d.thumbnail}
                  alt={d.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="faint">无预览</span>
              )}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {d.name}
            </div>
            <div className="faint">{formatDate(d.updatedAt)}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (sameDay) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
