/**
 * 存储持久化与配额。
 *
 * 默认情况下浏览器把 IndexedDB 归为「best-effort」，磁盘紧张时可以自动清掉 ——
 * 对我们是致命的，用户的全部作品都在里面。navigator.storage.persist() 能申请
 * 升级成「persistent」，之后浏览器不会自动回收，只有用户手动清除才会消失。
 *
 * 能不能批到取决于浏览器策略（Chrome 系看站点参与度，Firefox 会弹窗询问），
 * 所以申请失败是正常情况，不能当错误处理 —— 顶多提醒用户去导备份。
 */

export interface StorageStatus {
  /** 是否已获得持久化授权。 */
  persisted: boolean
  /** 浏览器是否支持查询。不支持时下面的数字都是 null。 */
  supported: boolean
  /** 已用字节数。 */
  usage: number | null
  /** 配额上限字节数。 */
  quota: number | null
}

/**
 * 申请持久化存储。
 * 应用启动时调一次即可，已经是 persistent 的话不会重复申请。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist || !navigator.storage?.persisted) return false

  try {
    // 已经批过就别再申请，某些浏览器重复申请会弹窗骚扰用户
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch (err) {
    console.warn('[star-poster] 申请持久化存储失败', err)
    return false
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage?.estimate) {
    return { persisted: false, supported: false, usage: null, quota: null }
  }

  try {
    const [persisted, estimate] = await Promise.all([
      navigator.storage.persisted?.() ?? Promise.resolve(false),
      navigator.storage.estimate(),
    ])

    return {
      persisted,
      supported: true,
      usage: estimate.usage ?? null,
      quota: estimate.quota ?? null,
    }
  } catch {
    return { persisted: false, supported: false, usage: null, quota: null }
  }
}

/** 字节数转人话。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
