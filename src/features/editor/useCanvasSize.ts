/**
 * 画布显示尺寸计算。
 *
 * 画布要在容器里「完整可见」（contain），并且不放大超过 100%（小海报放大
 * 会糊）。用 ResizeObserver 而不是 window resize —— 侧边栏折叠时窗口尺寸
 * 没变，但画布容器变了。
 */

import { useEffect, useRef, useState } from 'react'
import type { PosterDoc } from '../../core/model/types'

/** 容器内边距，和 Editor.tsx 里的 padding 对应。 */
const PADDING = 56

export function useCanvasSize(doc: PosterDoc | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayWidth, setDisplayWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !doc) return

    const compute = () => {
      const availW = el.clientWidth - PADDING
      const availH = el.clientHeight - PADDING
      if (availW <= 0 || availH <= 0) return

      const docAspect = doc.canvas.width / doc.canvas.height
      // 先按宽度铺满，高度超了再按高度反算
      let w = availW
      if (w / docAspect > availH) {
        w = availH * docAspect
      }

      setDisplayWidth(Math.min(w, doc.canvas.width))
    }

    compute()

    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  return { containerRef, displayWidth }
}
