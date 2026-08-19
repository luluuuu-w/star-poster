/**
 * 拖拽 / 点选上传。
 */

import { useCallback, useRef, useState } from 'react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
/** 超过这个大小的图解码会明显卡顿，先提醒一下。 */
const SIZE_WARN = 20 * 1024 * 1024

export function Dropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const [reject, setReject] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!ACCEPTED.includes(file.type)) {
        setReject('只支持 JPG / PNG / WebP / AVIF 格式')
        return
      }
      if (file.size > SIZE_WARN) {
        setReject('图片超过 20MB，处理会比较慢，建议先压缩')
        // 只是提醒，不拦
      } else {
        setReject(null)
      }
      onFile(file)
    },
    [onFile],
  )

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (disabled) return
          accept(e.dataTransfer.files[0])
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          minHeight: 280,
          padding: 32,
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius)',
          background: dragging ? 'rgba(108, 124, 255, 0.06)' : 'var(--bg-panel)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color 0.15s, background 0.15s',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, lineHeight: 1 }}>🖼</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
          {dragging ? '松手上传' : '把照片拖到这里，或点击选择'}
        </div>
        <div className="faint">
          支持 JPG / PNG / WebP / AVIF · 建议用人物清晰、构图完整的照片
        </div>
        <div className="faint" style={{ marginTop: 8 }}>
          照片只在你的浏览器里处理，不会上传到任何服务器
        </div>
      </div>

      {reject && (
        <div className="faint" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {reject}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => {
          accept(e.target.files?.[0])
          // 清空 value，否则连续选同一个文件不会触发 change
          e.target.value = ''
        }}
      />
    </div>
  )
}
