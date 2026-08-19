/**
 * 通用小控件。
 */

import type { ReactNode } from 'react'

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** 值的显示格式，默认保留两位小数。 */
  format?: (v: number) => string
}) {
  return (
    <div className="field">
      <div className="row">
        <span className="field-label" style={{ flex: 1 }}>
          {label}
        </span>
        <span className="faint">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

/**
 * 颜色选择器。同时支持选具体颜色和绑定配色变量。
 *
 * 绑定变量是核心功能 —— 绑了变量的元素在换配色方案时会自动跟着变，
 * 这是「一键换配色」能生效的前提。
 */
export function ColorField({
  label,
  value,
  resolved,
  onChange,
  tokens,
}: {
  label: string
  /** 当前值，可能是 "@primary" 或 "#RRGGBB"。 */
  value: string
  /** 解析后的实际颜色，用于显示色块。 */
  resolved: string
  onChange: (ref: string) => void
  /** 可绑定的配色变量。 */
  tokens: Array<{ ref: string; label: string; hex: string }>
}) {
  const isToken = value.startsWith('@')

  return (
    <div className="field">
      <span className="field-label">{label}</span>

      <div className="row">
        <label
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: resolved,
            border: '1px solid var(--border-strong)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
          title="选一个固定颜色"
        >
          <input
            type="color"
            value={resolved}
            onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%' }}
          />
        </label>

        <select
          className="select"
          value={isToken ? value : '__fixed'}
          onChange={(e) => {
            if (e.target.value === '__fixed') onChange(resolved)
            else onChange(e.target.value)
          }}
        >
          <option value="__fixed">固定颜色</option>
          {tokens.map((t) => (
            <option key={t.ref} value={t.ref}>
              跟随「{t.label}」
            </option>
          ))}
        </select>
      </div>

      {isToken && (
        <div className="faint">换配色方案时这里会自动变色</div>
      )}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {options.map((o) => (
        <button
          key={o.value}
          className="btn btn-sm"
          title={o.title}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '5px 4px',
            ...(value === o.value
              ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
              : {}),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
