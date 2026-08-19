/**
 * 编辑器主界面。
 *
 * 布局：左侧图层面板 / 中间画布 / 右侧属性面板，顶部工具栏。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type Konva from 'konva'
import { store } from '../core/store/LocalStore'
import { PosterStage } from '../core/render/Stage'
import { makeThumbnail } from '../core/render/export'
import { flattenLayers } from '../core/model/doc'
import { roleOfLayerName } from '../core/layout/texts'
import { primeCustomDecorations } from '../assets/decorations'
import { useEditor } from '../features/editor/store'
import { EditorToolbar } from '../features/editor/Toolbar'
import { LayerPanel } from '../features/editor/LayerPanel'
import { InspectorPanel } from '../features/editor/InspectorPanel'
import { useCanvasSize } from '../features/editor/useCanvasSize'
import { useKeyboard } from '../features/editor/useKeyboard'
import { useAutosave } from '../features/editor/useAutosave'

export function Editor() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const stageRef = useRef<Konva.Stage>(null)

  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const showAnalysis = useEditor((s) => s.showAnalysis)
  const setDoc = useEditor((s) => s.setDoc)
  const select = useEditor((s) => s.select)
  const applyTransform = useEditor((s) => s.applyTransform)
  const reset = useEditor((s) => s.reset)

  const [loadError, setLoadError] = useState<string | null>(null)

  // --- 载入文档
  useEffect(() => {
    if (!docId) return
    let cancelled = false

    void (async () => {
      try {
        const [loaded, customDecors] = await Promise.all([
          store.getDoc(docId),
          store.listDecorations(),
        ])
        if (cancelled) return

        if (!loaded) {
          setLoadError('找不到这个作品，可能已被删除')
          return
        }

        // 渲染是同步的，自定义装饰必须在首帧前进缓存
        primeCustomDecorations(customDecors)
        setDoc(loaded)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '打开失败')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [docId, setDoc])

  // 离开编辑器时清空，避免下次进来闪一下上一个作品
  useEffect(() => reset, [reset])

  const { containerRef, displayWidth } = useCanvasSize(doc)
  useKeyboard()

  const captureThumbnail = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !doc) return undefined
    try {
      return makeThumbnail(stage, doc)
    } catch (err) {
      // 缩略图失败不该阻塞保存
      console.warn('[star-poster] 生成缩略图失败', err)
      return undefined
    }
  }, [doc])

  useAutosave(captureThumbnail)

  /**
   * 双击文字图层直接改内容。
   *
   * 用 prompt 而不是画布内联编辑：画布内联要在 Konva 上叠一个绝对定位的
   * textarea 并同步字体、字号、旋转、缩放，边界情况很多。双击弹输入框虽然
   * 朴素，但改多行文字反而更顺手，右侧属性面板也随时能改。
   */
  const handleDoubleClick = useCallback(
    (id: string) => {
      const { doc: d } = useEditor.getState()
      if (!d) return
      const layer = flattenLayers(d.layers).find((l) => l.id === id)
      if (!layer || layer.type !== 'text') return

      const next = window.prompt('修改文字内容', layer.text)
      if (next === null || next === layer.text) return

      // 模板文字（主标题/副标题/说明）走 setTemplateText，它会同时更新
      // doc.texts 和图层；用户自己插的文字图层只改图层本身
      const role = roleOfLayerName(layer.name)
      if (role) {
        useEditor.getState().setTemplateText(role, next)
      } else {
        useEditor.getState().updateLayer(id, '修改文字', (l) => void (l.text = next))
      }
    },
    [],
  )

  if (loadError) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>{loadError}</p>
        <button className="btn" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    )
  }

  if (!doc) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }} className="muted">
        正在打开…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <EditorToolbar stageRef={stageRef} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          className="scroll"
          style={{
            width: 'var(--sidebar-w)',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            flexShrink: 0,
          }}
        >
          <LayerPanel />
        </aside>

        <div
          ref={containerRef}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            background:
              // 棋盘格背景，方便看清海报边界
              'repeating-conic-gradient(#15151c 0% 25%, #12121a 0% 50%) 50% / 22px 22px',
            overflow: 'hidden',
          }}
        >
          {displayWidth > 0 && (
            <div style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)', lineHeight: 0 }}>
              <PosterStage
                ref={stageRef}
                doc={doc}
                displayWidth={displayWidth}
                selectedIds={selectedIds}
                onSelect={select}
                onTransform={applyTransform}
                onDoubleClick={handleDoubleClick}
                showAnalysis={showAnalysis}
              />
            </div>
          )}
        </div>

        <aside
          className="scroll"
          style={{
            width: 'var(--panel-w)',
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            flexShrink: 0,
          }}
        >
          <InspectorPanel />
        </aside>
      </div>
    </div>
  )
}
