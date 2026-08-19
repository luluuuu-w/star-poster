/**
 * 上传与自动生成。
 *
 * 完整流程：选图 -> 存进 IndexedDB -> worker 分析（取色 + 构图）
 * -> 版型打分排序 -> 用得分最高的模板实例化 -> 存文档 -> 跳编辑器。
 */

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { createDoc, uid } from '../core/model/doc'
import { store } from '../core/store/LocalStore'
import { analyzeBlob } from '../core/vision/client'
import { BUILTIN_TEMPLATES } from '../core/layout/templates'
import { rankTemplates } from '../core/layout/match'
import { buildLayers } from '../core/layout/apply'
import { DEFAULT_TEXTS, type TemplateTexts } from '../core/layout/types'
import { SIZE_PRESETS } from '../core/render/export'
import { RecentDocs } from '../features/library/RecentDocs'
import { Dropzone } from '../features/upload/Dropzone'

type Stage = 'idle' | 'reading' | 'analyzing' | 'composing'

const STAGE_TEXT: Record<Stage, string> = {
  idle: '',
  reading: '正在读取图片…',
  analyzing: '正在分析配色与构图…',
  composing: '正在生成排版…',
}

export function Home() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [texts, setTexts] = useState<TemplateTexts>({ ...DEFAULT_TEXTS })
  const [sizeId, setSizeId] = useState('xhs')

  const generate = useCallback(
    async (file: File) => {
      setError(null)

      try {
        setStage('reading')

        // 先把原图存进 IndexedDB。存原图而不是压缩图 —— 用户可能要导出 A3 印刷
        const bitmap = await createImageBitmap(file)
        const assetId = uid('img')
        await store.putAsset({
          id: assetId,
          blob: file,
          width: bitmap.width,
          height: bitmap.height,
          createdAt: Date.now(),
        })

        setStage('analyzing')
        // analyzeBlob 会自己 createImageBitmap，上面那个用完就关掉
        bitmap.close()
        const { palette, analysis } = await analyzeBlob(file)

        setStage('composing')

        const preset = SIZE_PRESETS.find((p) => p.id === sizeId) ?? SIZE_PRESETS[0]
        const doc = createDoc({
          name: texts.title || '未命名海报',
          canvas: {
            width: preset.width,
            height: preset.height,
            background: { kind: 'solid', color: '@bg' },
          },
          palette,
          analysis,
          // 存进文档：有的模板不渲染说明文字，只靠图层反推的话那段会丢
          texts,
        })

        // 内置模板和用户自建模板一起参与打分 —— 自己设计的版型理应和内置的
        // 平等竞争，而不是只能手动套用
        const custom = await store.listTemplates()
        const candidates = [...BUILTIN_TEMPLATES, ...custom]
        const ranked = rankTemplates(candidates, analysis)
        const best = ranked[0].template

        doc.layers = buildLayers(best, {
          canvas: { width: doc.canvas.width, height: doc.canvas.height },
          palette,
          analysis,
          texts,
          assetId,
        })
        doc.templateId = best.id

        await store.putDoc(doc)
        navigate(`/editor/${doc.id}`)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : '生成失败，请换一张图试试')
        setStage('idle')
      }
    },
    [navigate, sizeId, texts],
  )

  const busy = stage !== 'idle'

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '40px 24px 64px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
        上传一张照片，自动生成海报
      </h1>
      <p className="muted" style={{ margin: '0 0 28px' }}>
        网站会分析照片的主色调和人物位置，自动配色并挑选合适的版型。生成后可以随意修改。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <Dropzone onFile={generate} disabled={busy} />

        <div className="panel">
          <div className="section">
            <div className="panel-title">海报文字</div>
            <div className="field">
              <label className="field-label" htmlFor="t-title">
                主标题
              </label>
              <input
                id="t-title"
                className="input"
                value={texts.title}
                disabled={busy}
                onChange={(e) => setTexts({ ...texts, title: e.target.value })}
                placeholder="艺人名"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="t-sub">
                副标题
              </label>
              <input
                id="t-sub"
                className="input"
                value={texts.subtitle}
                disabled={busy}
                onChange={(e) => setTexts({ ...texts, subtitle: e.target.value })}
                placeholder="英文名 / 标语"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label" htmlFor="t-cap">
                说明文字
              </label>
              <input
                id="t-cap"
                className="input"
                value={texts.caption}
                disabled={busy}
                onChange={(e) => setTexts({ ...texts, caption: e.target.value })}
                placeholder="日期 / 地点"
              />
            </div>
          </div>

          <div className="section">
            <div className="panel-title">尺寸</div>
            <select
              className="select"
              value={sizeId}
              disabled={busy}
              onChange={(e) => setSizeId(e.target.value)}
            >
              {SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.width}×{p.height}
                </option>
              ))}
            </select>
            <div className="faint" style={{ marginTop: 6 }}>
              {SIZE_PRESETS.find((p) => p.id === sizeId)?.hint}
            </div>
          </div>
        </div>
      </div>

      {busy && (
        <div
          className="row"
          style={{
            marginTop: 18,
            padding: '12px 16px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <Spinner />
          <span>{STAGE_TEXT[stage]}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 18,
            padding: '12px 16px',
            background: 'rgba(255, 95, 109, 0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: '#ffb0b6',
          }}
        >
          {error}
        </div>
      )}

      <RecentDocs />
    </div>
  )
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes sp { to { transform: rotate(360deg) } }`}</style>
      <div
        style={{
          width: 16,
          height: 16,
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'sp 0.7s linear infinite',
          flexShrink: 0,
        }}
      />
    </>
  )
}
