/**
 * IndexedDB schema 与连接。
 *
 * 缩略图单独放一张表，不塞进 docs —— 列表页只需要摘要 + 缩略图，
 * 把 dataURL 存在 docs 里会让每次读文档都多拖几百 KB。
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Decoration, ImageAsset, PosterDoc } from '../model/types'
import type { LayoutTemplate } from '../layout/types'

export interface StarPosterDB extends DBSchema {
  docs: {
    key: string
    value: PosterDoc
    indexes: { updatedAt: number }
  }
  thumbnails: {
    key: string
    value: { id: string; dataUrl: string }
  }
  assets: {
    key: string
    value: ImageAsset
  }
  templates: {
    key: string
    value: LayoutTemplate
  }
  decorations: {
    key: string
    value: Decoration
  }
}

const DB_NAME = 'star-poster'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<StarPosterDB>> | null = null

export function getDB(): Promise<IDBPDatabase<StarPosterDB>> {
  if (dbPromise) return dbPromise

  dbPromise = openDB<StarPosterDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // 逐版本升级，不用 else if —— 从 v1 直接跳到 v3 时要依次执行
      if (oldVersion < 1) {
        const docs = db.createObjectStore('docs', { keyPath: 'id' })
        docs.createIndex('updatedAt', 'updatedAt')

        db.createObjectStore('thumbnails', { keyPath: 'id' })
        db.createObjectStore('assets', { keyPath: 'id' })
        db.createObjectStore('templates', { keyPath: 'id' })
        db.createObjectStore('decorations', { keyPath: 'id' })
      }
    },
    blocked() {
      console.warn('[star-poster] 另一个标签页正占用旧版数据库，升级被阻塞')
    },
    blocking() {
      // 别的标签页要升级数据库，主动让路，否则那边会一直卡住
      console.warn('[star-poster] 数据库需要升级，正在关闭当前连接')
      dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  })

  return dbPromise
}
