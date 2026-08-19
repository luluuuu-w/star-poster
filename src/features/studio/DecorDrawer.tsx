/**
 * 画装饰 —— 创作工作室的 A 模式。
 *
 * 画完存成自定义装饰，之后在编辑器的装饰面板里就能像内置装饰一样插进海报，
 * 并且会跟着海报配色变色（前提是绘制时用的是色位而不是固定颜色）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DecorCategory, DecorElement, Decoration } from '../../core/model/types'
import { DECOR_CATEGORY_LABELS } from '../../core/model/types'
import { EMPTY_PALETTE, uid } from '../../core/model/doc'
import { store } from '../../core/store/LocalStore'
import { cacheCustomDecoration } from '../../assets/decorations'
import { useImages } from '../../core/render/useImages'
import { Field, SegmentedControl, Slider } from '../../ui/controls'
import { DrawCanvas } from './DrawCanvas'
import {
  COLOR_SLOTS,
  DEFAULT_BRUSH,
  DEFAULT_SLOT_BINDING,
  SLOT_LABELS,
  TOOL_HINTS,
  TOOL_LABELS,
  type BrushSettings,
  type ColorSlot,
  type Tool,
} from './drawing'

const TOOLS: Tool[] = ['brush', 'line', 'rect', 'ellipse', 'polygon', 'eraser', 'select']

const CANVAS_SIZE = 460

/** 可选的配色变量，绑定给色位。 */
const TOKEN_CHOICES = [
  { ref: '@accent', label: '点缀色' },
  { ref: '@primary', label: '主色' },
  { ref: '@textOnBg', label: '背景上文字色' },
  { ref: '@surface', label: '色块色' },
  { ref: '@bg', label: '背景色' },
]

/**
 * 画布状态。
 *
 * 元素和撤销栈放在同一个 state 里，是为了能在一次 setState 里原子地更新两者。
 * 之前拆成两个 state、在 setElements 的 updater 里调 setHistory —— updater 在
 * 渲染阶段执行，React 严格模式会双调用它，结果一笔被记了两次。
 */
interface CanvasState {
  elements: DecorElement[]
  past: DecorElement[][]
  future: DecorElement[][]
}

const EMPTY_CANVAS: CanvasState = { elements: [], past: [], future: [] }

/** 撤销栈上限。装饰元素很少，快照法足够，不必上 patch。 */
const HISTORY_LIMIT = 50

/** 产生一个「改动了元素」的新状态，自动维护撤销栈。 */
function withChange(s: CanvasState, next: DecorElement[]): CanvasState {
  return {
    elements: next,
    past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.elements],
    future: [], // 新操作切断 redo 分支
  }
}

export function DecorDrawer({ onSaved }: { onSaved?: (d: Decoration) => void }) {
  const [canvas, setCanvas] = useState<CanvasState>(EMPTY_CANVAS)
  const { elements } = canvas

  const [tool, setTool] = useState<Tool>('brush')
  const [brush, setBrush] = useState<BrushSettings>({ ...DEFAULT_BRUSH })
  const [slotBinding, setSlotBinding] = useState<Record<string, string>>({
    ...DEFAULT_SLOT_BINDING,
  })
  const [gridSnap, setGridSnap] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<DecorCategory>('custom')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  /** 导入的位图。 */
  const [importedAssets, setImportedAssets] = useState<string[]>([])
  const images = useImages(importedAssets)

  const commit = useCallback((el: DecorElement) => {
    setCanvas((s) => withChange(s, [...s.elements, el]))
  }, [])

  const erase = useCallback((index: number) => {
    setCanvas((s) => withChange(s, s.elements.filter((_, i) => i !== index)))
    setSelectedIndex(null)
  }, [])

  const undo = useCallback(() => {
    setCanvas((s) => {
      if (s.past.length === 0) return s
      return {
        elements: s.past[s.past.length - 1],
        past: s.past.slice(0, -1),
        future: [s.elements, ...s.future],
      }
    })
    setSelectedIndex(null)
  }, [])

  const redo = useCallback(() => {
    setCanvas((s) => {
      if (s.future.length === 0) return s
      return {
        elements: s.future[0],
        past: [...s.past, s.elements],
        future: s.future.slice(1),
      }
    })
    setSelectedIndex(null)
  }, [])

  const clearAll = () => {
    if (elements.length === 0) return
    if (!confirm('清空画布？可以用撤销恢复。')) return
    setCanvas((s) => withChange(s, []))
    setSelectedIndex(null)
  }

  // 快捷键。绑在 window 上，但输入框里打字时放行
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null) {
        e.preventDefault()
        erase(selectedIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, erase, selectedIndex])

  /** 导入位图作为装饰的一部分。 */
  const importImage = async (file: File) => {
    setMessage(null)
    try {
      const bitmap = await createImageBitmap(file)
      const assetId = uid('img')
      await store.putAsset({
        id: assetId,
        blob: file,
        width: bitmap.width,
        height: bitmap.height,
        createdAt: Date.now(),
      })

      // 按原图比例放进 100x100 空间，长边占 80
      const aspect = bitmap.width / bitmap.height
      bitmap.close()
      const w = aspect >= 1 ? 80 : 80 * aspect
      const h = aspect >= 1 ? 80 / aspect : 80

      setImportedAssets((prev) => [...prev, assetId])
      commit({
        kind: 'image',
        assetId,
        x: (100 - w) / 2,
        y: (100 - h) / 2,
        w,
        h,
        opacity: 1,
      })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入失败')
    }
  }

  const save = async () => {
    if (elements.length === 0) {
      setMessage('画布是空的，先画点什么')
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      // 只把真正用到的色位写进 palette，避免属性面板出现一堆没用的改色入口
      const usedSlots = new Set<string>()
      for (const el of elements) {
        if ('fill' in el && el.fill) usedSlots.add(el.fill)
        if ('stroke' in el && el.stroke) usedSlots.add(el.stroke)
      }

      const palette: Record<string, string> = {}
      for (const slot of usedSlots) {
        // 固定颜色（hex）不需要映射，原样存着即可
        if (slotBinding[slot]) palette[slot] = slotBinding[slot]
      }

      const decoration: Decoration = {
        id: uid('dc'),
        name: name.trim() || `我的装饰 ${new Date().toLocaleDateString('zh-CN')}`,
        category,
        elements,
        palette,
        builtin: false,
        createdAt: Date.now(),
      }

      await store.putDecoration(decoration)
      // 同步进渲染缓存，不用重新加载页面就能在编辑器里用
      cacheCustomDecoration(decoration)

      setMessage(`已保存「${decoration.name}」，去编辑器的装饰面板就能用了`)
      onSaved?.(decoration)

      // 存完清空，方便接着画下一个。保留撤销栈，万一想改还能退回去
      setCanvas((s) => withChange(s, []))
      setName('')
      setImportedAssets([])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const usedSlotList = useMemo(() => {
    const used = new Set<string>()
    for (const el of elements) {
      if ('fill' in el && el.fill) used.add(el.fill)
      if ('stroke' in el && el.stroke) used.add(el.stroke)
    }
    return COLOR_SLOTS.filter((s) => used.has(s))
  }, [elements])

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* ---------------- 左侧：工具 ---------------- */}
      <div className="panel" style={{ width: 232, flexShrink: 0 }}>
        <div className="section">
          <div className="panel-title">工具</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {TOOLS.map((t) => (
              <button
                key={t}
                className="btn btn-sm"
                title={TOOL_HINTS[t]}
                onClick={() => {
                  setTool(t)
                  if (t !== 'select') setSelectedIndex(null)
                }}
                style={
                  tool === t ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined
                }
              >
                {TOOL_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="faint" style={{ marginTop: 8 }}>
            {TOOL_HINTS[tool]}
          </div>
        </div>

        <div className="section">
          <div className="panel-title">颜色</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {COLOR_SLOTS.map((s) => (
              <button
                key={s}
                className="btn btn-sm"
                style={{
                  flex: 1,
                  ...(brush.slot === s
                    ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                    : {}),
                }}
                title={`用${SLOT_LABELS[s]}，插进海报后跟着配色变`}
                onClick={() => setBrush({ ...brush, slot: s })}
              >
                {s}
              </button>
            ))}
            <button
              className="btn btn-sm"
              style={{
                flex: 1.4,
                ...(brush.slot === null
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : {}),
              }}
              title="固定颜色，插进海报后不会跟着配色变"
              onClick={() => setBrush({ ...brush, slot: null })}
            >
              固定
            </button>
          </div>

          {brush.slot === null ? (
            <div className="row">
              <label
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  background: brush.fixedColor,
                  border: '1px solid var(--border-strong)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <input
                  type="color"
                  value={brush.fixedColor}
                  onChange={(e) => setBrush({ ...brush, fixedColor: e.target.value })}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%' }}
                />
              </label>
              <code className="faint">{brush.fixedColor}</code>
            </div>
          ) : (
            <Field label={`${SLOT_LABELS[brush.slot]} 绑定到`}>
              <select
                className="select"
                value={slotBinding[brush.slot]}
                onChange={(e) =>
                  setSlotBinding({ ...slotBinding, [brush.slot as ColorSlot]: e.target.value })
                }
              >
                {TOKEN_CHOICES.map((t) => (
                  <option key={t.ref} value={t.ref}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="section">
          <div className="panel-title">笔刷</div>
          <Slider
            label="粗细"
            value={brush.width}
            min={0.3}
            max={16}
            step={0.1}
            onChange={(v) => setBrush({ ...brush, width: v })}
            format={(v) => v.toFixed(1)}
          />
          <Slider
            label="不透明度"
            value={brush.opacity}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(v) => setBrush({ ...brush, opacity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Field label="形状工具">
            <SegmentedControl
              value={brush.filled ? 'fill' : 'stroke'}
              options={[
                { value: 'stroke', label: '描边' },
                { value: 'fill', label: '填充' },
              ]}
              onChange={(v) => setBrush({ ...brush, filled: v === 'fill' })}
            />
          </Field>
          <Field label="网格吸附">
            <SegmentedControl
              value={String(gridSnap)}
              options={[
                { value: '0', label: '关' },
                { value: '5', label: '5' },
                { value: '10', label: '10' },
              ]}
              onChange={(v) => setGridSnap(Number(v))}
            />
          </Field>
        </div>
      </div>

      {/* ---------------- 中间：画布 ---------------- */}
      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn btn-sm" onClick={undo} disabled={canvas.past.length === 0}>
            ↶ 撤销
          </button>
          <button className="btn btn-sm" onClick={redo} disabled={canvas.future.length === 0}>
            ↷ 重做
          </button>
          <label className="btn btn-sm" style={{ margin: 0 }}>
            导入图片
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importImage(f)
                e.target.value = ''
              }}
            />
          </label>
          <div className="spacer" />
          <span className="faint">{elements.length} 个笔画</span>
          <button
            className="btn btn-sm btn-danger"
            onClick={clearAll}
            disabled={elements.length === 0}
          >
            清空
          </button>
        </div>

        <DrawCanvas
          elements={elements}
          slotBinding={slotBinding}
          palette={EMPTY_PALETTE}
          tool={tool}
          brush={brush}
          size={CANVAS_SIZE}
          images={images}
          selectedIndex={selectedIndex}
          onCommit={commit}
          onErase={erase}
          onSelect={setSelectedIndex}
          gridSnap={gridSnap}
        />

        <div className="faint" style={{ marginTop: 8, width: CANVAS_SIZE }}>
          画布是正方形的 100×100 设计空间。插进海报时会按你拖出的框缩放，
          所以不用担心现在画多大。
        </div>
      </div>

      {/* ---------------- 右侧：保存 ---------------- */}
      <div className="panel" style={{ width: 240, flexShrink: 0 }}>
        <div className="section">
          <div className="panel-title">保存为装饰</div>

          <Field label="名称">
            <input
              className="input"
              value={name}
              placeholder="例如：手绘星星"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="分类">
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value as DecorCategory)}
            >
              {(Object.keys(DECOR_CATEGORY_LABELS) as DecorCategory[]).map((c) => (
                <option key={c} value={c}>
                  {DECOR_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          {usedSlotList.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="field-label" style={{ marginBottom: 5 }}>
                用到的色位
              </div>
              {usedSlotList.map((s) => (
                <div key={s} className="row" style={{ marginBottom: 4 }}>
                  <code style={{ fontSize: 11, width: 22 }}>{s}</code>
                  <span className="faint" style={{ flex: 1 }}>
                    {TOKEN_CHOICES.find((t) => t.ref === slotBinding[s])?.label ?? slotBinding[s]}
                  </span>
                </div>
              ))}
              <div className="faint" style={{ marginTop: 4 }}>
                这些色位插进海报后会跟着配色变。
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={save}
            disabled={saving || elements.length === 0}
          >
            {saving ? '保存中…' : '保存装饰'}
          </button>

          {message && (
            <div className="faint" style={{ marginTop: 10 }}>
              {message}
            </div>
          )}
        </div>

        <div className="section">
          <div className="panel-title">提示</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              lineHeight: 1.9,
              fontSize: 12,
              color: 'var(--text-dim)',
            }}
          >
            <li>用「色位」而不是固定颜色，装饰才能跟着海报配色变</li>
            <li>橡皮是整条删除笔画，不是擦局部像素 —— 装饰是矢量的</li>
            <li>Ctrl/Cmd+Z 撤销，Shift 加上就是重做</li>
            <li>多边形：连点顶点，双击或回车闭合</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
