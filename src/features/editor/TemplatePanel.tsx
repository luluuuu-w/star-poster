/**
 * 版型面板：推荐排序 + 一键换版型 + 改模板文字。
 *
 * 换版型会重建全部图层，所以会丢掉手动调整。这里给了明确提示，不做静默覆盖。
 */

import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_TEMPLATES } from '../../core/layout/templates'
import { explainScore, rankTemplates } from '../../core/layout/match'
import { buildLayers } from '../../core/layout/apply'
import { findPhotoLayer } from '../../core/model/doc'
import { store } from '../../core/store/LocalStore'
import type { LayoutTemplate } from '../../core/layout/types'
import { type TextRole } from '../../core/layout/texts'
import { useEditor } from './store'

export function TemplatePanel() {
  const doc = useEditor((s) => s.doc)
  const texts = useEditor((s) => s.texts)
  const setTemplateText = useEditor((s) => s.setTemplateText)
  const update = useEditor((s) => s.update)
  const [confirming, setConfirming] = useState<string | null>(null)

  /** 用户自建模板。挂载时读一次即可，工作室里新存的模板下次进编辑器会看到。 */
  const [custom, setCustom] = useState<LayoutTemplate[]>([])
  useEffect(() => {
    let cancelled = false
    void store.listTemplates().then((list) => {
      if (!cancelled) setCustom(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...custom], [custom])

  const ranked = useMemo(() => {
    if (!doc?.analysis) return []
    return rankTemplates(allTemplates, doc.analysis)
  }, [doc?.analysis, allTemplates])

  if (!doc) return null

  const photo = findPhotoLayer(doc)

  const swap = (templateId: string) => {
    const template = allTemplates.find((t) => t.id === templateId)
    if (!template || !doc.analysis || !photo) return

    update(`套用版型：${template.name}`, (draft) => {
      draft.layers = buildLayers(template, {
        canvas: { width: draft.canvas.width, height: draft.canvas.height },
        palette: draft.palette,
        analysis: draft.analysis!,
        texts,
        assetId: photo.assetId,
      })
      draft.templateId = template.id
      // 文字跟着一起存，新模板可能不渲染其中某一段
      draft.texts = texts
    })
    setConfirming(null)
  }

  /**
   * 只改文字内容，不重排版 —— 用户改标题时不该丢掉手动调整。
   * store 会同时写 doc.texts 和对应的文字图层。
   */
  const syncText = (field: TextRole, value: string) => {
    setTemplateText(field, value)
  }

  return (
    <div>
      <div className="section">
        <div className="panel-title">海报文字</div>
        <div className="field">
          <label className="field-label">主标题</label>
          <input
            className="input"
            value={texts.title}
            onChange={(e) => syncText('title', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">副标题</label>
          <input
            className="input"
            value={texts.subtitle}
            onChange={(e) => syncText('subtitle', e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">说明</label>
          <input
            className="input"
            value={texts.caption}
            onChange={(e) => syncText('caption', e.target.value)}
          />
        </div>
      </div>

      <div className="section">
        <div className="panel-title">推荐版型</div>
        {!doc.analysis && (
          <div className="faint">这个作品没有照片分析数据，无法给出推荐。</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ranked.map((scored) => {
            const active = doc.templateId === scored.template.id
            const isConfirming = confirming === scored.template.id

            return (
              <div
                key={scored.template.id}
                // 给自动化测试和调试一个稳定的抓手 —— 靠文字内容定位卡片
                // 很容易点到外层容器上
                data-template-name={scored.template.name}
                data-template-active={active ? 'true' : 'false'}
                style={{
                  padding: 10,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'rgba(108, 124, 255, 0.08)' : 'var(--bg-elevated)',
                }}
              >
                <div className="row">
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {scored.template.name}
                  </span>
                  {!scored.template.builtin && (
                    <span
                      className="faint"
                      style={{ color: 'var(--accent)' }}
                      title="你在创作工作室里自己设计的版型"
                    >
                      自建
                    </span>
                  )}
                  <div className="spacer" />
                  <span
                    className="faint"
                    title="匹配度：综合照片比例、主体位置、留白和色调"
                  >
                    {Math.round(scored.score * 100)}
                  </span>
                </div>

                <div className="faint" style={{ marginTop: 2 }}>
                  {explainScore(scored)} · {scored.template.tags.join(' / ')}
                </div>

                {!active && (
                  <div style={{ marginTop: 8 }}>
                    {isConfirming ? (
                      <div className="row">
                        <span className="faint" style={{ flex: 1, color: 'var(--danger)' }}>
                          会覆盖手动调整
                        </span>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirming(null)}
                        >
                          取消
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => swap(scored.template.id)}
                        >
                          确认
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm"
                        style={{ width: '100%' }}
                        onClick={() => setConfirming(scored.template.id)}
                        disabled={!photo}
                      >
                        套用
                      </button>
                    )}
                  </div>
                )}

                {active && (
                  <div className="faint" style={{ marginTop: 6, color: 'var(--accent)' }}>
                    当前使用中
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
