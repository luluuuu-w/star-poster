/**
 * 文档版本迁移。
 *
 * 用户的作品存在自己浏览器里，我们没法像后端那样统一跑一次迁移脚本。
 * 所以每次读文档都过一遍这里，按 version 逐级升上来。
 *
 * 加新版本时：DOC_VERSION +1，往 MIGRATIONS 里加一条 (n) => n+1 的函数。
 */

import { DOC_VERSION, type PosterDoc } from './types'
import { AA_NORMAL, ensureContrast } from '../color/contrast'

type Migration = (doc: any) => any

/** 索引 i 的函数负责把 version i 升到 i+1。 */
const MIGRATIONS: Record<number, Migration> = {
  // 0 -> 1：最早的内部版本没有 version 字段
  0: (doc) => ({
    ...doc,
    version: 1,
    palette: doc.palette ?? { swatches: [], roles: {}, variantId: 'faithful' },
  }),

  /**
   * 1 -> 2：新增 accentText 角色。
   *
   * 原先点缀色既当色块又当小字，色块只需要 2.2:1，当小字就看不清了。
   * 现在派生一个对比度达标的文字变体。老文档没有这个字段，不补的话
   * 引用 @accentText 的元素会解析成黑色。
   */
  1: (doc) => {
    const roles = { ...(doc.palette?.roles ?? {}) }
    const accent = roles.accent ?? '#cccccc'
    const bg = roles.bg ?? '#111111'

    return {
      ...doc,
      version: 2,
      palette: {
        ...doc.palette,
        roles: { ...roles, accentText: ensureContrast(accent, bg, AA_NORMAL) },
      },
    }
  },
}

export function migrateDoc(raw: any): PosterDoc {
  let doc = raw
  let version = typeof doc.version === 'number' ? doc.version : 0

  while (version < DOC_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) {
      console.warn(`[star-poster] 缺少 v${version} -> v${version + 1} 的迁移，跳过`)
      break
    }
    doc = migrate(doc)
    version = doc.version ?? version + 1
  }

  if (version > DOC_VERSION) {
    // 用户在新版本存了作品，又回到旧版本打开。不能保证正确渲染，但也不该崩，
    // 尽量渲染出来比直接报错友好
    console.warn(`[star-poster] 作品来自更新的版本 v${version}，可能显示不完整`)
  }

  return doc as PosterDoc
}
