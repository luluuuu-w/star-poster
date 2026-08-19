/**
 * 设计排版模板 —— 创作工作室的 B 模式。
 *
 * 在画布上摆「槽位」而不是具体内容：照片槽、标题槽、装饰槽……存成模板后，
 * 任何一张新照片都能套进来。槽位几何用相对值，所以模板能适配任意画布尺寸。
 *
 * 模板还要填一份匹配元数据（期望宽高比、主体锚点等），这样自建模板也能参与
 * 首页的自动版型推荐打分，和内置模板平等竞争。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Group, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useRef } from 'react'
import type { Frame } from '../../core/model/types'
import { uid } from '../../core/model/doc'
import { store } from '../../core/store/LocalStore'
import type {
  LayoutTemplate,
  SubjectAnchor,
  TemplateSlot,
} from '../../core/layout/types'
import { Field, SegmentedControl, Slider } from '../../ui/controls'
import { SIZE_PRESETS } from '../../core/render/export'
import { allDecorations } from '../../assets/decorations'

const CANVAS_H = 520

type SlotRole = TemplateSlot['role']

const ROLE_LABELS: Record<SlotRole, string> = {
  photo: '照片',
  title: '主标题',
  subtitle: '副标题',
  caption: '说明文字',
  decor: '装饰',
  shape: '色块',
}

const ROLE_COLORS: Record<SlotRole, string> = {
  photo: '#4d9fff',
  title: '#ffc043',
  subtitle: '#3ddc84',
  caption: '#9a9aab',
  decor: '#c77dff',
  shape: '#ff8a5b',
}

/** 新槽位的默认几何，按角色给不同的合理起点。 */
const ROLE_DEFAULTS: Record<SlotRole, Frame> = {
  photo: { x: 0.08, y: 0.06, w: 0.84, h: 0.62 },
  title: { x: 0.08, y: 0.72, w: 0.84, h: 0.1 },
  subtitle: { x: 0.08, y: 0.83, w: 0.84, h: 0.05 },
  caption: { x: 0.08, y: 0.9, w: 0.84, h: 0.04 },
  decor: { x: 0.6, y: 0.05, w: 0.3, h: 0.3 },
  shape: { x: 0.08, y: 0.7, w: 0.2, h: 0.01 },
}

const ANCHOR_LABELS: Record<SubjectAnchor, string> = {
  center: '居中',
  top: '偏上',
  bottom: '偏下',
  left: '偏左',
  right: '偏右',
  full: '满版',
}

/**
 * 槽位状态 + 撤销栈。
 *
 * 和 DecorDrawer 同理：必须放在同一个 state 里原子更新。在 setState 的
 * updater 里调另一个 setState 会被 React 严格模式双调用，撤销栈会错乱。
 */
interface SlotState {
  slots: TemplateSlot[]
  past: TemplateSlot[][]
}

const HISTORY_LIMIT = 50

function initialSlots(): SlotState {
  return {
    slots: [
      { id: uid('slot'), role: 'photo', frame: ROLE_DEFAULTS.photo, rotation: 0, mask: 'none' },
      { id: uid('slot'), role: 'title', frame: ROLE_DEFAULTS.title, rotation: 0 },
    ],
    past: [],
  }
}

export function TemplateDesigner({ onSaved }: { onSaved?: (t: LayoutTemplate) => void }) {
  const [state, setState] = useState<SlotState>(initialSlots)
  const { slots } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [sizeId, setSizeId] = useState('xhs')
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')

  // 匹配元数据
  const [anchor, setAnchor] = useState<SubjectAnchor>('center')
  const [tone, setTone] = useState<'dark' | 'light' | 'any'>('any')
  const [tolerance, setTolerance] = useState(0.35)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const transformerRef = useRef<Konva.Transformer>(null)
  const nodesRef = useRef(new Map<string, Konva.Group>())

  const preset = SIZE_PRESETS.find((p) => p.id === sizeId) ?? SIZE_PRESETS[0]
  const aspect = preset.width / preset.height
  const canvasW = CANVAS_H * aspect

  const decorations = useMemo(() => allDecorations(), [])

  const mutate = useCallback((fn: (prev: TemplateSlot[]) => TemplateSlot[]) => {
    setState((s) => ({
      slots: fn(s.slots),
      past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.slots],
    }))
  }, [])

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s
      return { slots: s.past[s.past.length - 1], past: s.past.slice(0, -1) }
    })
    setSelectedId(null)
  }, [])

  const addSlot = (role: SlotRole) => {
    const slot: TemplateSlot = {
      id: uid('slot'),
      role,
      frame: { ...ROLE_DEFAULTS[role] },
      rotation: 0,
      ...(role === 'photo' ? { mask: 'none' as const } : {}),
      ...(role === 'decor' ? { decorId: decorations[0]?.id } : {}),
      ...(role === 'shape'
        ? { shape: { kind: 'rect' as const, fill: '@accent', radius: 0 } }
        : {}),
      ...(role === 'title' || role === 'subtitle' || role === 'caption'
        ? {
            text: {
              fontId: role === 'title' ? 'serif' : 'sans',
              fontSize: role === 'title' ? 0.08 : role === 'subtitle' ? 0.03 : 0.02,
              fontWeight: role === 'title' ? 700 : 400,
              color: '@textOnBg',
              align: 'left' as const,
              letterSpacing: 0,
              vertical: false,
            },
          }
        : {}),
    }
    mutate((prev) => [...prev, slot])
    setSelectedId(slot.id)
  }

  const removeSlot = useCallback(
    (id: string) => {
      mutate((prev) => prev.filter((s) => s.id !== id))
      setSelectedId(null)
    },
    [mutate],
  )

  const updateSlot = (id: string, fn: (s: TemplateSlot) => TemplateSlot) => {
    mutate((prev) => prev.map((s) => (s.id === id ? fn(s) : s)))
  }

  // Transformer 挂到选中的槽位
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    const node = selectedId ? nodesRef.current.get(selectedId) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, slots])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeSlot(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, removeSlot, selectedId])

  const save = async () => {
    if (!slots.some((s) => s.role === 'photo')) {
      setMessage('模板至少要有一个照片槽，否则套用时照片没地方放')
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const template: LayoutTemplate = {
        id: uid('tpl'),
        name: name.trim() || `我的版型 ${new Date().toLocaleDateString('zh-CN')}`,
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        builtin: false,
        createdAt: Date.now(),
        slots,
        meta: {
          idealAspect: aspect,
          aspectTolerance: tolerance,
          subjectAnchor: anchor,
          // 文字槽的位置就是这个模板对留白的要求，直接拿来当 textZones
          textZones: slots
            .filter((s) => s.role === 'title' || s.role === 'subtitle' || s.role === 'caption')
            .map((s) => s.frame),
          tonePreference: tone,
        },
      }

      await store.putTemplate(template)
      setMessage(`已保存「${template.name}」，在编辑器的版型面板里可以套用`)
      onSaved?.(template)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const selected = slots.find((s) => s.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* ---------------- 左：槽位列表 ---------------- */}
      <div className="panel" style={{ width: 224, flexShrink: 0 }}>
        <div className="section">
          <div className="panel-title">添加槽位</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(Object.keys(ROLE_LABELS) as SlotRole[]).map((r) => (
              <button key={r} className="btn btn-sm" onClick={() => addSlot(r)}>
                + {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="panel-title">槽位 ({slots.length})</div>
          {slots.length === 0 && <div className="faint">还没有槽位</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {slots.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="row"
                style={{
                  padding: '5px 7px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background:
                    selectedId === s.id ? 'rgba(108, 124, 255, 0.16)' : 'transparent',
                  border: `1px solid ${selectedId === s.id ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: ROLE_COLORS[s.role],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, flex: 1 }}>{ROLE_LABELS[s.role]}</span>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  style={{ padding: '0 5px' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSlot(s.id)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- 中：画布 ---------------- */}
      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          <select
            className="select"
            style={{ width: 200 }}
            value={sizeId}
            onChange={(e) => setSizeId(e.target.value)}
          >
            {SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.width}×{p.height}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={undo} disabled={state.past.length === 0}>
            ↶ 撤销
          </button>
          <div className="spacer" />
          <span className="faint">拖拽移动，拖角缩放</span>
        </div>

        <Stage
          width={canvasW}
          height={CANVAS_H}
          style={{
            background: '#1a1a22',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) setSelectedId(null)
          }}
        >
          <Layer>
            {/* 三分线，帮助构图 */}
            {[1, 2].map((i) => (
              <Group key={i} listening={false}>
                <Rect
                  x={(canvasW * i) / 3}
                  y={0}
                  width={0.5}
                  height={CANVAS_H}
                  fill="#ffffff"
                  opacity={0.12}
                />
                <Rect
                  x={0}
                  y={(CANVAS_H * i) / 3}
                  width={canvasW}
                  height={0.5}
                  fill="#ffffff"
                  opacity={0.12}
                />
              </Group>
            ))}

            {slots.map((slot) => (
              <SlotNode
                key={slot.id}
                slot={slot}
                canvasW={canvasW}
                canvasH={CANVAS_H}
                selected={selectedId === slot.id}
                onRef={(node) => {
                  if (node) nodesRef.current.set(slot.id, node)
                  else nodesRef.current.delete(slot.id)
                }}
                onSelect={() => setSelectedId(slot.id)}
                onChange={(frame, rotation) =>
                  updateSlot(slot.id, (s) => ({ ...s, frame, rotation }))
                }
              />
            ))}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              anchorSize={8}
              anchorStroke="#4d9fff"
              anchorFill="#ffffff"
              borderStroke="#4d9fff"
              boundBoxFunc={(_o, next) => ({
                ...next,
                width: Math.max(10, next.width),
                height: Math.max(10, next.height),
              })}
            />
          </Layer>
        </Stage>

        <div className="faint" style={{ marginTop: 8, maxWidth: canvasW }}>
          槽位是「内容的占位」，不是内容本身。套用模板时照片会填进照片槽，
          标题文字会填进标题槽。所以这里只需要摆位置和大小。
        </div>
      </div>

      {/* ---------------- 右：属性 + 保存 ---------------- */}
      <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {selected && (
          <div className="panel">
            <div className="section">
              <div className="panel-title">{ROLE_LABELS[selected.role]}槽位</div>

              <Slider
                label="旋转"
                value={selected.rotation}
                min={-45}
                max={45}
                step={1}
                onChange={(v) => updateSlot(selected.id, (s) => ({ ...s, rotation: v }))}
                format={(v) => `${Math.round(v)}°`}
              />

              {selected.role === 'photo' && (
                <Field label="照片形状">
                  <SegmentedControl
                    value={selected.mask ?? 'none'}
                    options={[
                      { value: 'none', label: '方' },
                      { value: 'rounded', label: '圆角' },
                      { value: 'circle', label: '圆' },
                      { value: 'arch', label: '拱' },
                    ]}
                    onChange={(v) => updateSlot(selected.id, (s) => ({ ...s, mask: v }))}
                  />
                </Field>
              )}

              {selected.text && (
                <>
                  <Slider
                    label="字号"
                    value={selected.text.fontSize}
                    min={0.01}
                    max={0.3}
                    step={0.002}
                    onChange={(v) =>
                      updateSlot(selected.id, (s) => ({
                        ...s,
                        text: { ...s.text!, fontSize: v },
                      }))
                    }
                    format={(v) => (v * 100).toFixed(1)}
                  />
                  <Field label="对齐">
                    <SegmentedControl
                      value={selected.text.align}
                      options={[
                        { value: 'left', label: '左' },
                        { value: 'center', label: '中' },
                        { value: 'right', label: '右' },
                      ]}
                      onChange={(v) =>
                        updateSlot(selected.id, (s) => ({ ...s, text: { ...s.text!, align: v } }))
                      }
                    />
                  </Field>
                  <label className="row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected.text.vertical}
                      onChange={(e) =>
                        updateSlot(selected.id, (s) => ({
                          ...s,
                          text: { ...s.text!, vertical: e.target.checked },
                        }))
                      }
                    />
                    <span style={{ fontSize: 13 }}>竖排</span>
                  </label>
                </>
              )}

              {selected.role === 'decor' && (
                <Field label="用哪个装饰">
                  <select
                    className="select"
                    value={selected.decorId ?? ''}
                    onChange={(e) =>
                      updateSlot(selected.id, (s) => ({ ...s, decorId: e.target.value }))
                    }
                  >
                    {decorations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {selected.shape && (
                <>
                  <Field label="形状">
                    <SegmentedControl
                      value={selected.shape.kind}
                      options={[
                        { value: 'rect', label: '矩形' },
                        { value: 'ellipse', label: '椭圆' },
                      ]}
                      onChange={(v) =>
                        updateSlot(selected.id, (s) => ({ ...s, shape: { ...s.shape!, kind: v } }))
                      }
                    />
                  </Field>
                  <Slider
                    label="圆角"
                    value={selected.shape.radius}
                    min={0}
                    max={0.5}
                    step={0.01}
                    onChange={(v) =>
                      updateSlot(selected.id, (s) => ({ ...s, shape: { ...s.shape!, radius: v } }))
                    }
                  />
                </>
              )}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="section">
            <div className="panel-title">自动匹配设置</div>
            <div className="faint" style={{ marginBottom: 10 }}>
              这些设置决定首页上传照片时，你的模板什么情况下会被推荐。
            </div>

            <Field label="期望主体位置">
              <select
                className="select"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value as SubjectAnchor)}
              >
                {(Object.keys(ANCHOR_LABELS) as SubjectAnchor[]).map((a) => (
                  <option key={a} value={a}>
                    {ANCHOR_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="适合的照片色调">
              <SegmentedControl
                value={tone}
                options={[
                  { value: 'any', label: '都行' },
                  { value: 'dark', label: '暗调' },
                  { value: 'light', label: '亮调' },
                ]}
                onChange={(v) => setTone(v)}
              />
            </Field>

            <Slider
              label="宽高比宽容度"
              value={tolerance}
              min={0.15}
              max={0.8}
              step={0.05}
              onChange={setTolerance}
              format={(v) => (v < 0.3 ? '严格' : v < 0.55 ? '适中' : '宽松')}
            />
          </div>
        </div>

        <div className="panel">
          <div className="section">
            <div className="panel-title">保存为模板</div>

            <Field label="名称">
              <input
                className="input"
                value={name}
                placeholder="例如：对角线构图"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="标签">
              <input
                className="input"
                value={tags}
                placeholder="逗号分隔，例如：文艺, 留白"
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={save}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存模板'}
            </button>

            {message && (
              <div className="faint" style={{ marginTop: 10 }}>
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 单个槽位的可视化 + 拖拽缩放。 */
function SlotNode({
  slot,
  canvasW,
  canvasH,
  selected,
  onRef,
  onSelect,
  onChange,
}: {
  slot: TemplateSlot
  canvasW: number
  canvasH: number
  selected: boolean
  onRef: (node: Konva.Group | null) => void
  onSelect: () => void
  onChange: (frame: Frame, rotation: number) => void
}) {
  const w = slot.frame.w * canvasW
  const h = slot.frame.h * canvasH
  const color = ROLE_COLORS[slot.role]

  /** 从 Konva 节点读回相对几何。和 Stage.tsx 里的写回逻辑同理。 */
  const readBack = (node: Konva.Group) => {
    const sx = Math.abs(node.scaleX())
    const sy = Math.abs(node.scaleY())
    const newW = Math.max(0.01, slot.frame.w * sx)
    const newH = Math.max(0.01, slot.frame.h * sy)

    onChange(
      {
        x: (node.x() - (newW * canvasW) / 2) / canvasW,
        y: (node.y() - (newH * canvasH) / 2) / canvasH,
        w: newW,
        h: newH,
      },
      node.rotation(),
    )

    // 必须重置，否则下次渲染会在新尺寸上再乘一次
    node.scaleX(1)
    node.scaleY(1)
  }

  return (
    <Group
      ref={onRef}
      x={slot.frame.x * canvasW + w / 2}
      y={slot.frame.y * canvasH + h / 2}
      offsetX={w / 2}
      offsetY={h / 2}
      width={w}
      height={h}
      rotation={slot.rotation}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDragEnd={(e) => readBack(e.target as Konva.Group)}
      onTransformEnd={(e) => readBack(e.target as Konva.Group)}
    >
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={color}
        opacity={selected ? 0.28 : 0.16}
        stroke={color}
        strokeWidth={selected ? 2 : 1}
        dash={slot.role === 'photo' ? undefined : [5, 4]}
        cornerRadius={
          slot.role === 'photo' && slot.mask === 'circle' ? Math.min(w, h) / 2 : 3
        }
      />
      <Text
        x={6}
        y={5}
        text={ROLE_LABELS[slot.role]}
        fontSize={11}
        fill={color}
        fontStyle="600"
        listening={false}
      />
      {/* 文字槽额外画一条基线示意，方便判断字会落在哪 */}
      {slot.text && (
        <Rect
          x={0}
          y={h - 1}
          width={w}
          height={1}
          fill={color}
          opacity={0.6}
          listening={false}
        />
      )}
    </Group>
  )
}
