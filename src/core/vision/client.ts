/**
 * 主线程侧的 worker 客户端。单例 worker + 请求 id 配对，避免每次分析都
 * 新建 worker（创建开销比分析本身还大）。
 */

import type { ImageAnalysis, Palette } from '../model/types'
import type { AnalyzeRequest, AnalyzeResponse } from './vision.worker'

let worker: Worker | null = null
let nextId = 1

const pending = new Map<
  number,
  { resolve: (v: { palette: Palette; analysis: ImageAnalysis }) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./vision.worker.ts', import.meta.url), {
    type: 'module',
  })

  worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
    const { id, palette, analysis, error } = e.data
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)

    if (error || !palette || !analysis) {
      entry.reject(new Error(error ?? '分析失败'))
    } else {
      entry.resolve({ palette, analysis })
    }
  }

  worker.onerror = (e) => {
    // worker 整体挂了，所有在途请求都不会有结果了
    const err = new Error(`分析线程出错：${e.message}`)
    for (const [, entry] of pending) entry.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
  }

  return worker
}

/**
 * 分析一张图，返回配色方案与构图信息。
 * bitmap 会被转移给 worker 并在那边关闭，调用方不要再使用。
 */
export function analyzeImage(
  bitmap: ImageBitmap,
): Promise<{ palette: Palette; analysis: ImageAnalysis }> {
  const w = getWorker()
  const id = nextId++

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: AnalyzeRequest = { id, bitmap }
    // 转移 bitmap 而不是结构化克隆，大图能省掉一次完整拷贝
    w.postMessage(req, [bitmap])
  })
}

/** 从 Blob 解出 ImageBitmap，交给 analyzeImage。 */
export async function analyzeBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  return analyzeImage(bitmap)
}
