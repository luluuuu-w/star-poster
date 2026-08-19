/**
 * 字体加载。
 *
 * 关键点：Konva 测量文本宽度靠的是 Canvas measureText，而 measureText 用的
 * 是当时**已加载**的字体。如果字体还没到位就渲染/导出，会用回退字体测量，
 * 导出图里的文字宽度和换行位置全是错的。所以 ensureFontsLoaded() 必须在
 * 导出前 await，画布首次渲染后也要重绘一次。
 */

import { FONTS, getFont } from './registry'

/** 已加载（或已在加载）的字体 id -> Promise，避免重复请求。 */
const loading = new Map<string, Promise<void>>()

/** 加载单个字体的全部字重。系统字体直接 resolve。 */
export function loadFont(id: string): Promise<void> {
  const cached = loading.get(id)
  if (cached) return cached

  const font = getFont(id)
  if (font.files.length === 0) {
    const done = Promise.resolve()
    loading.set(id, done)
    return done
  }

  const task = Promise.all(
    font.files.map(async (file) => {
      const face = new FontFace(font.family, `url(${file.url})`, {
        weight: String(file.weight),
        display: 'swap',
      })
      await face.load()
      document.fonts.add(face)
    }),
  ).then(
    () => undefined,
    (err) => {
      // 单个字体加载失败不该让整个应用停摆，回退字体照样能画
      console.warn(`[star-poster] 字体「${font.name}」加载失败，将使用回退字体`, err)
      loading.delete(id) // 允许下次重试
    },
  )

  loading.set(id, task)
  return task
}

/**
 * 确保给定的字体都可用。
 * @param ids 用到的 fontId。不传则加载全部。
 */
export async function ensureFontsLoaded(ids?: string[]): Promise<void> {
  const targets = ids ?? FONTS.map((f) => f.id)
  await Promise.all([...new Set(targets)].map(loadFont))
  // document.fonts.ready 等的是「所有字体加载动作结束」，包含 CSS 里声明的。
  // 系统字体不产生加载动作，这一步基本立即返回。
  await document.fonts.ready
}
