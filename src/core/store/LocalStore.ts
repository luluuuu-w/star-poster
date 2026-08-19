/**
 * IndexedDB 实现的 Store。
 */

import type { Decoration, ImageAsset, PosterDoc } from '../model/types'
import type { LayoutTemplate } from '../layout/types'
import { migrateDoc } from '../model/migrate'
import { collectAssetIds } from '../model/doc'
import { getDB } from './db'
import { BACKUP_VERSION, type Backup, type DocSummary, type Store } from './Store'

export class LocalStore implements Store {
  // ------------------------------------------------------------ 作品

  async listDocs(): Promise<DocSummary[]> {
    const db = await getDB()
    const [docs, thumbs] = await Promise.all([
      db.getAllFromIndex('docs', 'updatedAt'),
      db.getAll('thumbnails'),
    ])

    const thumbMap = new Map(thumbs.map((t) => [t.id, t.dataUrl]))

    return docs
      .map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        thumbnail: thumbMap.get(d.id),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt) // 索引是升序，列表要最近的在前
  }

  async getDoc(id: string): Promise<PosterDoc | undefined> {
    const db = await getDB()
    const doc = await db.get('docs', id)
    return doc ? migrateDoc(doc) : undefined
  }

  async putDoc(doc: PosterDoc, thumbnail?: string): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(['docs', 'thumbnails'], 'readwrite')
    await tx.objectStore('docs').put(doc)
    if (thumbnail) {
      await tx.objectStore('thumbnails').put({ id: doc.id, dataUrl: thumbnail })
    }
    await tx.done
  }

  async deleteDoc(id: string): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(['docs', 'thumbnails'], 'readwrite')
    await tx.objectStore('docs').delete(id)
    await tx.objectStore('thumbnails').delete(id)
    await tx.done
  }

  // ------------------------------------------------------------ 素材

  async getAsset(id: string): Promise<ImageAsset | undefined> {
    return (await getDB()).get('assets', id)
  }

  async putAsset(asset: ImageAsset): Promise<void> {
    await (await getDB()).put('assets', asset)
  }

  async deleteAsset(id: string): Promise<void> {
    await (await getDB()).delete('assets', id)
  }

  // ------------------------------------------------------------ 模板

  async listTemplates(): Promise<LayoutTemplate[]> {
    return (await getDB()).getAll('templates')
  }

  async getTemplate(id: string): Promise<LayoutTemplate | undefined> {
    return (await getDB()).get('templates', id)
  }

  async putTemplate(tpl: LayoutTemplate): Promise<void> {
    await (await getDB()).put('templates', tpl)
  }

  async deleteTemplate(id: string): Promise<void> {
    await (await getDB()).delete('templates', id)
  }

  // ------------------------------------------------------------ 装饰

  async listDecorations(): Promise<Decoration[]> {
    return (await getDB()).getAll('decorations')
  }

  async getDecoration(id: string): Promise<Decoration | undefined> {
    return (await getDB()).get('decorations', id)
  }

  async putDecoration(d: Decoration): Promise<void> {
    await (await getDB()).put('decorations', d)
  }

  async deleteDecoration(id: string): Promise<void> {
    await (await getDB()).delete('decorations', id)
  }

  // ------------------------------------------------------------ 备份

  async exportAll(): Promise<Backup> {
    const db = await getDB()
    const [docs, templates, decorations, assets] = await Promise.all([
      db.getAll('docs'),
      db.getAll('templates'),
      db.getAll('decorations'),
      db.getAll('assets'),
    ])

    const encoded = await Promise.all(
      assets.map(async (a) => ({
        id: a.id,
        dataUrl: await blobToDataUrl(a.blob),
        width: a.width,
        height: a.height,
        createdAt: a.createdAt,
      })),
    )

    return {
      format: 'star-poster-backup',
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      docs,
      templates,
      decorations,
      assets: encoded,
    }
  }

  async importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
    if (backup.format !== 'star-poster-backup') {
      throw new Error('文件格式不对，这不是本站导出的备份')
    }
    if (backup.version > BACKUP_VERSION) {
      throw new Error('备份来自更新版本的应用，请先升级后再导入')
    }

    const db = await getDB()
    const stores = ['docs', 'thumbnails', 'assets', 'templates', 'decorations'] as const

    if (mode === 'replace') {
      const tx = db.transaction(stores, 'readwrite')
      await Promise.all(stores.map((s) => tx.objectStore(s).clear()))
      await tx.done
    }

    // 图片先解码。dataURL -> Blob 是异步的，不能放在事务里做
    // （IndexedDB 事务在没有待处理请求时会自动提交，await 非 IDB 的 Promise 会让事务失效）
    const assets = await Promise.all(
      backup.assets.map(async (a) => ({
        id: a.id,
        blob: await dataUrlToBlob(a.dataUrl),
        width: a.width,
        height: a.height,
        createdAt: a.createdAt,
      })),
    )

    const tx = db.transaction(['docs', 'assets', 'templates', 'decorations'], 'readwrite')
    const docStore = tx.objectStore('docs')
    const assetStore = tx.objectStore('assets')
    const tplStore = tx.objectStore('templates')
    const decStore = tx.objectStore('decorations')

    await Promise.all([
      ...backup.docs.map((d) => docStore.put(migrateDoc(d))),
      ...assets.map((a) => assetStore.put(a)),
      ...backup.templates.map((t) => tplStore.put(t)),
      ...backup.decorations.map((d) => decStore.put(d)),
    ])
    await tx.done
  }

  async pruneAssets(): Promise<number> {
    const db = await getDB()
    const [docs, decorations, assetKeys] = await Promise.all([
      db.getAll('docs'),
      db.getAll('decorations'),
      db.getAllKeys('assets'),
    ])

    const used = new Set<string>()
    for (const d of docs) {
      for (const id of collectAssetIds(d)) used.add(id)
    }
    // 自定义装饰里可能内嵌了导入的位图
    for (const dec of decorations) {
      for (const el of dec.elements) {
        if (el.kind === 'image') used.add(el.assetId)
      }
    }

    const orphans = assetKeys.filter((k) => !used.has(k))
    if (orphans.length === 0) return 0

    const tx = db.transaction('assets', 'readwrite')
    await Promise.all(orphans.map((k) => tx.store.delete(k)))
    await tx.done

    return orphans.length
  }
}

// ---------------------------------------------------------------- 编解码

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** 全局单例。 */
export const store: Store = new LocalStore()
