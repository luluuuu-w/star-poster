/**
 * assetId -> HTMLImageElement 的加载。
 *
 * 渲染层需要同步拿到已解码的图片，所以这里负责「从 IndexedDB 取 Blob ->
 * 建 objectURL -> 解码 -> 存进 Map」，完成后触发一次重渲染。
 *
 * objectURL 必须在组件卸载时 revoke，否则 Blob 会一直留在内存里。用户来回
 * 切换几十张大图就能吃掉几百 MB。
 */

import { useEffect, useState } from 'react'
import { store } from '../store/LocalStore'

export function useImages(assetIds: string[]): Map<string, HTMLImageElement> {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())

  // 用排序后的 join 做依赖，避免每次渲染新建数组导致的无限循环
  const key = [...assetIds].sort().join(',')

  useEffect(() => {
    if (!key) {
      setImages(new Map())
      return
    }

    let cancelled = false
    const urls: string[] = []

    const ids = key.split(',')

    void (async () => {
      const loaded = new Map<string, HTMLImageElement>()

      await Promise.all(
        ids.map(async (id) => {
          try {
            const asset = await store.getAsset(id)
            if (!asset || cancelled) return

            const url = URL.createObjectURL(asset.blob)
            urls.push(url)

            const img = new Image()
            img.src = url
            // decode() 比 onload 更可靠：onload 只保证下载完，decode 保证
            // 可以立刻画上画布而不会阻塞第一帧
            await img.decode()

            if (!cancelled) loaded.set(id, img)
          } catch (err) {
            console.warn(`[star-poster] 图片 ${id} 加载失败`, err)
          }
        }),
      )

      if (!cancelled) setImages(loaded)
    })()

    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [key])

  return images
}
