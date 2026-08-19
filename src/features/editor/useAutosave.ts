/**
 * 自动保存。
 *
 * 防抖 800ms —— 拖动图层时每帧都会改文档，不防抖会疯狂写 IndexedDB。
 * 另外在页面卸载前同步存一次，避免用户改完就关标签页丢数据。
 */

import { useEffect, useRef } from 'react'
import { store } from '../../core/store/LocalStore'
import { useEditor } from './store'

const DEBOUNCE_MS = 800

export function useAutosave(captureThumbnail: () => string | undefined) {
  const timerRef = useRef<number | null>(null)
  // 用 ref 存最新的回调，避免它变化时重建整个 effect
  const captureRef = useRef(captureThumbnail)
  captureRef.current = captureThumbnail

  useEffect(() => {
    // 订阅 dirty 的变化。用 subscribe 而不是 useEditor(s => s.dirty) 是为了
    // 不让自动保存逻辑触发组件重渲染
    const unsub = useEditor.subscribe((state, prev) => {
      if (!state.dirty || state.doc === prev.doc) return

      if (timerRef.current !== null) window.clearTimeout(timerRef.current)

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        const { doc, dirty } = useEditor.getState()
        if (!doc || !dirty) return

        void store
          .putDoc(doc, captureRef.current())
          .then(() => useEditor.getState().markSaved())
          .catch((err) => console.error('[star-poster] 自动保存失败', err))
      }, DEBOUNCE_MS)
    })

    return () => {
      unsub()
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  // 页面卸载前抢救一次。这里不能等 Promise，浏览器不会给时间
  useEffect(() => {
    const onHide = () => {
      const { doc, dirty } = useEditor.getState()
      if (!doc || !dirty) return
      // 不带缩略图 —— toDataURL 在卸载路径上太慢
      void store.putDoc(doc)
    }

    // pagehide 比 beforeunload 可靠（移动端 Safari 不一定触发 beforeunload）
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide()
    })

    return () => window.removeEventListener('pagehide', onHide)
  }, [])
}
