/**
 * 存储抽象。
 *
 * 当前只有 LocalStore（IndexedDB）一个实现。把接口单独抽出来是为了以后
 * 想接后端时只写一个 RemoteStore，UI 层一行不用改。所有方法都是异步的，
 * 即便本地实现能同步完成 —— 否则以后换远程实现要改遍所有调用点。
 */

import type { Decoration, ImageAsset, PosterDoc } from '../model/types'
import type { LayoutTemplate } from '../layout/types'

/** 列表页用的轻量摘要，不含完整图层数据。 */
export interface DocSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** 缩略图 dataURL。 */
  thumbnail?: string
}

export interface Store {
  // --- 作品
  listDocs(): Promise<DocSummary[]>
  getDoc(id: string): Promise<PosterDoc | undefined>
  putDoc(doc: PosterDoc, thumbnail?: string): Promise<void>
  deleteDoc(id: string): Promise<void>

  // --- 图片素材
  getAsset(id: string): Promise<ImageAsset | undefined>
  putAsset(asset: ImageAsset): Promise<void>
  deleteAsset(id: string): Promise<void>

  // --- 自定义模板
  listTemplates(): Promise<LayoutTemplate[]>
  getTemplate(id: string): Promise<LayoutTemplate | undefined>
  putTemplate(tpl: LayoutTemplate): Promise<void>
  deleteTemplate(id: string): Promise<void>

  // --- 自定义装饰
  listDecorations(): Promise<Decoration[]>
  getDecoration(id: string): Promise<Decoration | undefined>
  putDecoration(d: Decoration): Promise<void>
  deleteDecoration(id: string): Promise<void>

  // --- 备份
  exportAll(): Promise<Backup>
  importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void>

  /** 删除没有任何文档引用的图片素材，回收空间。 */
  pruneAssets(): Promise<number>
}

export interface Backup {
  format: 'star-poster-backup'
  version: number
  exportedAt: number
  docs: PosterDoc[]
  templates: LayoutTemplate[]
  decorations: Decoration[]
  /** 图片以 base64 dataURL 形式内联，保证备份是单个自包含的 JSON 文件。 */
  assets: Array<{ id: string; dataUrl: string; width: number; height: number; createdAt: number }>
}

export const BACKUP_VERSION = 1
