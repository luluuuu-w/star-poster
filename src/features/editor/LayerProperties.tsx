/**
 * 选中图层的属性编辑。按图层类型显示不同的控件组。
 */

import {
  DECOR_CATEGORY_LABELS,
  PALETTE_ROLES,
  ROLE_LABELS,
  solid,
  type DecorLayer,
  type Palette,
  type PhotoLayer,
  type ShapeLayer,
  type StrokeLayer,
  type TextLayer,
} from '../../core/model/types'
import { resolveColor } from '../../core/color/palette'
import { FONTS, FONT_CATEGORY_LABELS } from '../../core/fonts/registry'
import { getDecoration } from '../../assets/decorations'
import { ColorField, Field, SegmentedControl, Slider } from '../../ui/controls'
import { DecorThumb } from './DecorPanel'
import { useEditor } from './store'

export function LayerProperties() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selectedLayers = useEditor((s) => s.selectedLayers)
  const updateLayer = useEditor((s) => s.updateLayer)

  if (!doc) return null

  const layers = selectedLayers()

  if (layers.length === 0) {
    return (
      <div className="section">
        <div className="faint">
          在画布或图层列表里选中一个元素来编辑它的属性。
        </div>
      </div>
    )
  }

  if (layers.length > 1) {
    return (
      <div className="section">
        <div className="panel-title">已选中 {layers.length} 个图层</div>
        <div className="faint" style={{ marginBottom: 12 }}>
          多选时只能改通用属性。
        </div>
        <Slider
          label="不透明度"
          value={layers[0].opacity}
          min={0}
          max={1}
          onChange={(v) => {
            for (const l of layers) {
              updateLayer(l.id, '调整不透明度', (layer) => void (layer.opacity = v))
            }
          }}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
    )
  }

  const layer = layers[0]
  const id = selectedIds[0]

  const tokens = PALETTE_ROLES.map((role) => ({
    ref: `@${role}`,
    label: ROLE_LABELS[role],
    hex: doc.palette.roles[role],
  }))

  return (
    <div>
      {/* --- 通用 */}
      <div className="section">
        <Field label="名称">
          <input
            className="input"
            value={layer.name}
            onChange={(e) =>
              updateLayer(id, '重命名图层', (l) => void (l.name = e.target.value))
            }
          />
        </Field>

        <div className="row" style={{ gap: 8 }}>
          <NumberField
            label="X"
            value={layer.frame.x}
            onChange={(v) => updateLayer(id, '移动', (l) => void (l.frame.x = v))}
          />
          <NumberField
            label="Y"
            value={layer.frame.y}
            onChange={(v) => updateLayer(id, '移动', (l) => void (l.frame.y = v))}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <NumberField
            label="宽"
            value={layer.frame.w}
            onChange={(v) => updateLayer(id, '缩放', (l) => void (l.frame.w = Math.max(0.01, v)))}
          />
          <NumberField
            label="高"
            value={layer.frame.h}
            onChange={(v) => updateLayer(id, '缩放', (l) => void (l.frame.h = Math.max(0.01, v)))}
          />
        </div>

        <Slider
          label="旋转"
          value={layer.rotation}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => updateLayer(id, '旋转', (l) => void (l.rotation = v))}
          format={(v) => `${Math.round(v)}°`}
        />

        <Slider
          label="不透明度"
          value={layer.opacity}
          min={0}
          max={1}
          onChange={(v) => updateLayer(id, '调整不透明度', (l) => void (l.opacity = v))}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>

      {layer.type === 'text' && (
        <TextProperties layer={layer} id={id} palette={doc.palette} tokens={tokens} />
      )}
      {layer.type === 'photo' && <PhotoProperties layer={layer} id={id} />}
      {layer.type === 'shape' && (
        <ShapeProperties layer={layer} id={id} palette={doc.palette} tokens={tokens} />
      )}
      {layer.type === 'stroke' && (
        <StrokeProperties layer={layer} id={id} palette={doc.palette} tokens={tokens} />
      )}
      {layer.type === 'decor' && (
        <DecorProperties layer={layer} id={id} palette={doc.palette} tokens={tokens} />
      )}
    </div>
  )
}

type Tokens = Array<{ ref: string; label: string; hex: string }>

// ---------------------------------------------------------------- 文字

function TextProperties({
  layer,
  id,
  palette,
  tokens,
}: {
  layer: TextLayer
  id: string
  palette: Palette
  tokens: Tokens
}) {
  const updateLayer = useEditor((s) => s.updateLayer)
  const set = (label: string, fn: (l: TextLayer) => void) => updateLayer(id, label, fn)

  const font = FONTS.find((f) => f.id === layer.fontId)
  const hasCJK = /[一-龥]/.test(layer.text)

  return (
    <>
      <div className="section">
        <div className="panel-title">文字</div>

        <Field label="内容">
          <textarea
            className="input textarea"
            value={layer.text}
            onChange={(e) => set('修改文字', (l) => void (l.text = e.target.value))}
          />
        </Field>

        <Field label="字体">
          <select
            className="select"
            value={layer.fontId}
            onChange={(e) => set('切换字体', (l) => void (l.fontId = e.target.value))}
          >
            {Object.entries(
              FONTS.reduce<Record<string, typeof FONTS>>((acc, f) => {
                ;(acc[f.category] ??= []).push(f)
                return acc
              }, {}),
            ).map(([cat, list]) => (
              <optgroup
                key={cat}
                label={FONT_CATEGORY_LABELS[cat as keyof typeof FONT_CATEGORY_LABELS]}
              >
                {list.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {!f.cjk ? '（不含中文）' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {font && !font.cjk && hasCJK && (
            <div className="faint" style={{ color: 'var(--danger)' }}>
              这个字体没有中文字形，中文会用系统字体显示
            </div>
          )}
        </Field>

        <Slider
          label="字号"
          value={layer.fontSize}
          min={0.01}
          max={0.35}
          step={0.002}
          onChange={(v) => set('调整字号', (l) => void (l.fontSize = v))}
          format={(v) => `${(v * 100).toFixed(1)}`}
        />

        <Field label="字重">
          <select
            className="select"
            value={layer.fontWeight}
            onChange={(e) =>
              set('调整字重', (l) => void (l.fontWeight = Number(e.target.value)))
            }
          >
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
                {w === 400 ? ' 常规' : w === 700 ? ' 加粗' : ''}
              </option>
            ))}
          </select>
        </Field>

        <ColorField
          label="颜色"
          value={layer.fill.kind === 'solid' ? layer.fill.color : '#ffffff'}
          resolved={resolveColor(
            layer.fill.kind === 'solid' ? layer.fill.color : '#ffffff',
            palette,
          )}
          onChange={(ref) => set('修改文字颜色', (l) => void (l.fill = solid(ref)))}
          tokens={tokens}
        />

        <Field label="对齐">
          <SegmentedControl
            value={layer.align}
            options={[
              { value: 'left', label: '左' },
              { value: 'center', label: '中' },
              { value: 'right', label: '右' },
            ]}
            onChange={(v) => set('修改对齐', (l) => void (l.align = v))}
          />
        </Field>

        <Slider
          label="字间距"
          value={layer.letterSpacing}
          min={-0.15}
          max={1}
          step={0.01}
          onChange={(v) => set('调整字间距', (l) => void (l.letterSpacing = v))}
        />

        <Slider
          label="行高"
          value={layer.lineHeight}
          min={0.8}
          max={2.5}
          step={0.05}
          onChange={(v) => set('调整行高', (l) => void (l.lineHeight = v))}
        />

        <label className="row" style={{ marginTop: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={layer.vertical}
            onChange={(e) => set('切换竖排', (l) => void (l.vertical = e.target.checked))}
          />
          <span style={{ fontSize: 13 }}>竖排</span>
        </label>
      </div>

      {/* --- 描边与阴影 */}
      <div className="section">
        <div className="panel-title">效果</div>

        <ToggleSection
          label="描边"
          enabled={layer.stroke !== null}
          onToggle={(on) =>
            set('切换描边', (l) => {
              l.stroke = on ? { color: '@bg', width: 0.004 } : null
            })
          }
        >
          {layer.stroke && (
            <>
              <ColorField
                label="描边颜色"
                value={layer.stroke.color}
                resolved={resolveColor(layer.stroke.color, palette)}
                onChange={(ref) => set('修改描边', (l) => void (l.stroke!.color = ref))}
                tokens={tokens}
              />
              <Slider
                label="粗细"
                value={layer.stroke.width}
                min={0.001}
                max={0.02}
                step={0.001}
                onChange={(v) => set('修改描边', (l) => void (l.stroke!.width = v))}
                format={(v) => (v * 1000).toFixed(0)}
              />
            </>
          )}
        </ToggleSection>

        <ToggleSection
          label="阴影"
          enabled={layer.shadow !== null}
          onToggle={(on) =>
            set('切换阴影', (l) => {
              l.shadow = on ? { color: '@bg', blur: 0.012, dx: 0.004, dy: 0.004 } : null
            })
          }
        >
          {layer.shadow && (
            <>
              <ColorField
                label="阴影颜色"
                value={layer.shadow.color}
                resolved={resolveColor(layer.shadow.color, palette)}
                onChange={(ref) => set('修改阴影', (l) => void (l.shadow!.color = ref))}
                tokens={tokens}
              />
              <Slider
                label="模糊"
                value={layer.shadow.blur}
                min={0}
                max={0.06}
                step={0.002}
                onChange={(v) => set('修改阴影', (l) => void (l.shadow!.blur = v))}
                format={(v) => (v * 1000).toFixed(0)}
              />
            </>
          )}
        </ToggleSection>

        <ToggleSection
          label="底色块"
          enabled={layer.backdrop !== null}
          onToggle={(on) =>
            set('切换底色块', (l) => {
              l.backdrop = on ? { color: '@primary', padding: 0.012, radius: 0.006 } : null
            })
          }
        >
          {layer.backdrop && (
            <>
              <ColorField
                label="底色"
                value={layer.backdrop.color}
                resolved={resolveColor(layer.backdrop.color, palette)}
                onChange={(ref) => set('修改底色块', (l) => void (l.backdrop!.color = ref))}
                tokens={tokens}
              />
              <Slider
                label="内边距"
                value={layer.backdrop.padding}
                min={0}
                max={0.05}
                step={0.002}
                onChange={(v) => set('修改底色块', (l) => void (l.backdrop!.padding = v))}
                format={(v) => (v * 1000).toFixed(0)}
              />
              <Slider
                label="圆角"
                value={layer.backdrop.radius}
                min={0}
                max={0.05}
                step={0.002}
                onChange={(v) => set('修改底色块', (l) => void (l.backdrop!.radius = v))}
                format={(v) => (v * 1000).toFixed(0)}
              />
            </>
          )}
        </ToggleSection>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- 照片

function PhotoProperties({ layer, id }: { layer: PhotoLayer; id: string }) {
  const updateLayer = useEditor((s) => s.updateLayer)
  const set = (label: string, fn: (l: PhotoLayer) => void) => updateLayer(id, label, fn)

  return (
    <div className="section">
      <div className="panel-title">照片</div>

      <Field label="形状">
        <SegmentedControl
          value={layer.mask}
          options={[
            { value: 'none', label: '方' },
            { value: 'rounded', label: '圆角' },
            { value: 'circle', label: '圆' },
            { value: 'arch', label: '拱' },
          ]}
          onChange={(v) => set('修改遮罩', (l) => void (l.mask = v))}
        />
      </Field>

      {layer.mask === 'rounded' && (
        <Slider
          label="圆角"
          value={layer.maskRadius}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => set('修改圆角', (l) => void (l.maskRadius = v))}
        />
      )}

      <div className="panel-title" style={{ marginTop: 12 }}>
        调色
      </div>

      <Slider
        label="亮度"
        value={layer.filters.brightness}
        min={-0.5}
        max={0.5}
        onChange={(v) => set('调整亮度', (l) => void (l.filters.brightness = v))}
      />
      <Slider
        label="对比度"
        value={layer.filters.contrast}
        min={-0.5}
        max={0.5}
        onChange={(v) => set('调整对比度', (l) => void (l.filters.contrast = v))}
      />
      <Slider
        label="饱和度"
        value={layer.filters.saturation}
        min={-1}
        max={1}
        onChange={(v) => set('调整饱和度', (l) => void (l.filters.saturation = v))}
      />
      <Slider
        label="主色调染"
        value={layer.filters.tint}
        min={0}
        max={1}
        onChange={(v) => set('调整色调', (l) => void (l.filters.tint = v))}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      <div className="panel-title" style={{ marginTop: 12 }}>
        裁切
      </div>
      <div className="faint" style={{ marginBottom: 8 }}>
        自动裁切已把识别到的主体放在框中间。下面可以手动微调。
      </div>
      <Slider
        label="水平位置"
        value={layer.crop.x}
        min={0}
        max={Math.max(0, 1 - layer.crop.w)}
        step={0.005}
        onChange={(v) => set('调整裁切', (l) => void (l.crop.x = v))}
      />
      <Slider
        label="垂直位置"
        value={layer.crop.y}
        min={0}
        max={Math.max(0, 1 - layer.crop.h)}
        step={0.005}
        onChange={(v) => set('调整裁切', (l) => void (l.crop.y = v))}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 形状

function ShapeProperties({
  layer,
  id,
  palette,
  tokens,
}: {
  layer: ShapeLayer
  id: string
  palette: Palette
  tokens: Tokens
}) {
  const updateLayer = useEditor((s) => s.updateLayer)
  const set = (label: string, fn: (l: ShapeLayer) => void) => updateLayer(id, label, fn)

  // 渐变填充的编辑在阶段 2 补，这里先只处理纯色
  const isGradient = layer.fill?.kind === 'gradient'

  return (
    <div className="section">
      <div className="panel-title">形状</div>

      {isGradient ? (
        <div className="faint" style={{ marginBottom: 10 }}>
          这是渐变填充（模板生成的渐隐层）。改成纯色会失去渐隐效果。
          <button
            className="btn btn-sm"
            style={{ marginTop: 6, width: '100%' }}
            onClick={() => set('改为纯色', (l) => void (l.fill = solid('@primary')))}
          >
            改为纯色
          </button>
        </div>
      ) : (
        <ColorField
          label="填充"
          value={layer.fill?.kind === 'solid' ? layer.fill.color : '#ffffff'}
          resolved={resolveColor(
            layer.fill?.kind === 'solid' ? layer.fill.color : '#ffffff',
            palette,
          )}
          onChange={(ref) => set('修改填充', (l) => void (l.fill = solid(ref)))}
          tokens={tokens}
        />
      )}

      {(layer.shape === 'rect' || layer.shape === 'polygon') && (
        <Slider
          label="圆角"
          value={layer.radius}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => set('修改圆角', (l) => void (l.radius = v))}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 笔画

function StrokeProperties({
  layer,
  id,
  palette,
  tokens,
}: {
  layer: StrokeLayer
  id: string
  palette: Palette
  tokens: Tokens
}) {
  const updateLayer = useEditor((s) => s.updateLayer)
  const set = (label: string, fn: (l: StrokeLayer) => void) => updateLayer(id, label, fn)

  return (
    <div className="section">
      <div className="panel-title">笔画</div>
      <ColorField
        label="颜色"
        value={layer.color}
        resolved={resolveColor(layer.color, palette)}
        onChange={(ref) => set('修改颜色', (l) => void (l.color = ref))}
        tokens={tokens}
      />
      <Slider
        label="粗细"
        value={layer.width}
        min={0.001}
        max={0.06}
        step={0.001}
        onChange={(v) => set('修改粗细', (l) => void (l.width = v))}
        format={(v) => (v * 1000).toFixed(0)}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 装饰

function DecorProperties({
  layer,
  id,
  palette,
  tokens,
}: {
  layer: DecorLayer
  id: string
  palette: Palette
  tokens: Tokens
}) {
  const updateLayer = useEditor((s) => s.updateLayer)
  const set = (label: string, fn: (l: DecorLayer) => void) => updateLayer(id, label, fn)

  const decoration = getDecoration(layer.decorId)

  if (!decoration) {
    return (
      <div className="section">
        <div className="panel-title">装饰</div>
        <div className="faint" style={{ color: 'var(--danger)' }}>
          找不到这个装饰的定义（id: {layer.decorId}），可能已经在工作室里被删掉了。
          画布上显示为红色虚线框。
        </div>
      </div>
    )
  }

  // 装饰声明了哪些色位，就给哪些色位提供改色入口
  const slots = Object.keys(decoration.palette)

  return (
    <div className="section">
      <div className="panel-title">装饰 · {decoration.name}</div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: palette.roles.bg,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            flexShrink: 0,
          }}
        >
          <DecorThumb decoration={decoration} palette={palette} />
        </div>
        <div className="faint" style={{ flex: 1 }}>
          {DECOR_CATEGORY_LABELS[decoration.category]}
          {!decoration.builtin && ' · 我画的'}
        </div>
      </div>

      {slots.map((slot) => {
        const current = layer.colors[slot] ?? decoration.palette[slot]
        return (
          <ColorField
            key={slot}
            label={`颜色 ${slot}`}
            value={current}
            resolved={resolveColor(current, palette)}
            onChange={(ref) => set('修改装饰颜色', (l) => void (l.colors[slot] = ref))}
            tokens={tokens}
          />
        )
      })}

      <Field label="翻转">
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              ...(layer.flipX ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
            }}
            onClick={() => set('水平翻转', (l) => void (l.flipX = !l.flipX))}
          >
            水平
          </button>
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              ...(layer.flipY ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
            }}
            onClick={() => set('垂直翻转', (l) => void (l.flipY = !l.flipY))}
          >
            垂直
          </button>
        </div>
      </Field>

      {slots.length > 0 && (
        <div className="faint">
          绑定「跟随配色」的色位会在换配色方案时自动变色。
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 小组件

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        // 相对值对用户没意义，显示成 0~100 的百分比
        value={(value * 100).toFixed(1)}
        step={0.5}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onChange(v / 100)
        }}
      />
    </div>
  )
}

function ToggleSection({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string
  enabled: boolean
  onToggle: (on: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="row" style={{ cursor: 'pointer', marginBottom: enabled ? 8 : 0 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span style={{ fontSize: 13 }}>{label}</span>
      </label>
      {enabled && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  )
}
