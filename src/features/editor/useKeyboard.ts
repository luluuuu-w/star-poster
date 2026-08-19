/**
 * 编辑器快捷键。
 *
 * 在输入框里打字时必须放行 —— 否则用户输入标题时按 Delete 会把图层删掉。
 */

import { useEffect } from 'react'
import { useEditor } from './store'

/** 方向键微调的步长（相对画布）。按住 Shift 走大步。 */
const NUDGE = 0.002
const NUDGE_BIG = 0.02

export function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey

      // --- 撤销 / 重做
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }

      // --- 复制
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (s.selectedIds.length === 1) s.duplicateLayer(s.selectedIds[0])
        return
      }

      // --- 删除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedIds.length > 0) {
          e.preventDefault()
          s.removeLayers(s.selectedIds)
        }
        return
      }

      // --- 取消选中
      if (e.key === 'Escape') {
        s.select(null, false)
        return
      }

      // --- 全选
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        if (s.doc) s.selectMany(s.doc.layers.map((l) => l.id))
        return
      }

      // --- 方向键微调
      const step = e.shiftKey ? NUDGE_BIG : NUDGE
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const d = delta[e.key]
      if (d && s.selectedIds.length > 0) {
        e.preventDefault()
        const ids = s.selectedIds
        s.update('移动图层', (draft) => {
          for (const layer of draft.layers) {
            if (!ids.includes(layer.id) || layer.locked) continue
            layer.frame.x += d[0]
            layer.frame.y += d[1]
          }
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
