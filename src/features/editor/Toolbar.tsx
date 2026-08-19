/**
 * 编辑器顶部工具栏。
 */

import { useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import type Konva from 'konva'
import { useEditor } from './store'
import { InsertBar } from './InsertBar'
import { store } from '../../core/store/LocalStore'
import {
  downloadBlob,
  exportPoster,
  safeFilename,
  type ExportFormat,
} from '../../core/render/export'

export function EditorToolbar({ stageRef }: { stageRef: RefObject<Konva.Stage | null> }) {
  const navigate = useNavigate()
  const doc = useEditor((s) => s.doc)
  const dirty = useEditor((s) => s.dirty)
  const showAnalysis = useEditor((s) => s.showAnalysis)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const past = useEditor((s) => s.past)
  const future = useEditor((s) => s.future)
  const toggleAnalysis = useEditor((s) => s.toggleAnalysis)
  const update = useEditor((s) => s.update)

  const [exportOpen, setExportOpen] = useState(false)

  if (!doc) return null

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <button className="btn btn-ghost" onClick={() => navigate('/')} title="返回首页">
        ←
      </button>

      <input
        className="input"
        value={doc.name}
        onChange={(e) => update('重命名', (d) => void (d.name = e.target.value))}
        style={{ width: 200, background: 'transparent', border: '1px solid transparent' }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--border)')}
        onBlur={(e) => (e.target.style.borderColor = 'transparent')}
      />

      <span className="faint" style={{ minWidth: 56 }}>
        {dirty ? '未保存' : '已保存'}
      </span>

      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      <button
        className="btn btn-ghost"
        onClick={undo}
        disabled={past.length === 0}
        title="撤销 (Ctrl/Cmd+Z)"
      >
        ↶
      </button>
      <button
        className="btn btn-ghost"
        onClick={redo}
        disabled={future.length === 0}
        title="重做 (Ctrl/Cmd+Shift+Z)"
      >
        ↷
      </button>

      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      <InsertBar />

      <div className="spacer" />

      <button
        className="btn btn-sm"
        onClick={toggleAnalysis}
        title="显示照片分析结果：青色框是识别到的主体，绿格是适合放文字的留白区"
        style={showAnalysis ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
      >
        分析视图
      </button>

      <div style={{ position: 'relative' }}>
        <button className="btn btn-primary" onClick={() => setExportOpen((v) => !v)}>
          导出
        </button>
        {exportOpen && (
          <ExportMenu stageRef={stageRef} onClose={() => setExportOpen(false)} />
        )}
      </div>
    </header>
  )
}

function ExportMenu({
  stageRef,
  onClose,
}: {
  stageRef: RefObject<Konva.Stage | null>
  onClose: () => void
}) {
  const doc = useEditor((s) => s.doc)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scale, setScale] = useState(2)
  const [quality, setQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!doc) return null

  const outW = Math.round(doc.canvas.width * scale)
  const outH = Math.round(doc.canvas.height * scale)

  const run = async () => {
    const stage = stageRef.current
    if (!stage) return

    setBusy(true)
    setError(null)

    try {
      // 导出前先把未保存改动落盘，导出的图和存的作品才一致
      const { doc: current, dirty } = useEditor.getState()
      if (current && dirty) {
        await store.putDoc(current)
        useEditor.getState().markSaved()
      }

      const blob = await exportPoster(stage, doc, { format, scale, quality })
      downloadBlob(blob, safeFilename(doc.name, format === 'png' ? 'png' : 'jpg'))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* 点外面关掉 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 20 }}
      />
      <div
        className="panel"
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 260,
          zIndex: 21,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div className="section">
          <div className="field">
            <span className="field-label">格式</span>
            <div className="row">
              {(['png', 'jpg'] as const).map((f) => (
                <button
                  key={f}
                  className="btn btn-sm"
                  onClick={() => setFormat(f)}
                  style={{
                    flex: 1,
                    ...(format === f
                      ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                      : {}),
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="faint">
              {format === 'png' ? '无损，文件大，支持透明' : '有损，文件小，适合分享'}
            </div>
          </div>

          <div className="field">
            <span className="field-label">倍数</span>
            <div className="row">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  className="btn btn-sm"
                  onClick={() => setScale(s)}
                  style={{
                    flex: 1,
                    ...(scale === s
                      ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                      : {}),
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
            <div className="faint">
              输出 {outW} × {outH}
            </div>
          </div>

          {format === 'jpg' && (
            <div className="field">
              <span className="field-label">质量 {Math.round(quality * 100)}%</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.02}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>
          )}

          {error && (
            <div className="faint" style={{ color: 'var(--danger)', marginBottom: 8 }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={run}
            disabled={busy}
          >
            {busy ? '导出中…' : '下载'}
          </button>
        </div>
      </div>
    </>
  )
}
