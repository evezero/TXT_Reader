import { invoke } from '@tauri-apps/api/core'
import type { FileMeta, ReadingProgress, Bookmark, MetaReadResult, WriteResult } from '../types'

const META_VERSION = 1

/**
 * 读取文件的阅读元数据
 */
export async function loadMeta(filePath: string): Promise<FileMeta | null> {
  try {
    const result = await invoke<MetaReadResult>('read_meta', { path: filePath })
    if (result.success && result.data) {
      return result.data as FileMeta
    }
    return null
  } catch {
    return null
  }
}

/**
 * 保存阅读元数据
 */
export async function saveMeta(filePath: string, meta: FileMeta): Promise<void> {
  try {
    await invoke<WriteResult>('write_meta', { path: filePath, meta })
  } catch (err) {
    console.error('保存元数据失败:', err)
  }
}

/**
 * 创建默认元数据
 */
export function createDefaultMeta(filePath: string): FileMeta {
  return {
    version: META_VERSION,
    filePath,
    progress: { chapterIndex: 0, paragraphIndex: 0, scrollRatio: 0 },
    bookmarks: [],
    manualHeadings: [],
    lastOpenedAt: Date.now(),
  }
}

/**
 * 更新进度
 */
export function updateProgress(meta: FileMeta, progress: ReadingProgress): FileMeta {
  return {
    ...meta,
    progress,
    lastOpenedAt: Date.now(),
  }
}

/**
 * 添加书签
 */
export function addBookmark(meta: FileMeta, bookmark: Omit<Bookmark, 'id' | 'createdAt'>): FileMeta {
  const newBookmark: Bookmark = {
    ...bookmark,
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  }
  return {
    ...meta,
    bookmarks: [...meta.bookmarks, newBookmark],
  }
}

/**
 * 删除书签
 */
export function removeBookmark(meta: FileMeta, bookmarkId: string): FileMeta {
  return {
    ...meta,
    bookmarks: meta.bookmarks.filter((b) => b.id !== bookmarkId),
  }
}

/**
 * 添加手工标题标记
 */
export function addManualHeading(meta: FileMeta, lineNumber: number): FileMeta {
  if (meta.manualHeadings?.includes(lineNumber)) {
    return meta
  }
  return {
    ...meta,
    manualHeadings: [...(meta.manualHeadings || []), lineNumber].sort((a, b) => a - b),
  }
}

/**
 * 忽略目录项（删除目录）
 */
export function addIgnoredHeading(meta: FileMeta, lineNumber: number): FileMeta {
  if (meta.ignoredHeadings?.includes(lineNumber)) {
    return meta
  }
  return {
    ...meta,
    ignoredHeadings: [...(meta.ignoredHeadings || []), lineNumber].sort((a, b) => a - b),
  }
}

/**
 * 防抖保存（1000ms debounce）
 */
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function debouncedSaveMeta(filePath: string, meta: FileMeta, delay = 1000): void {
  const existing = saveTimers.get(filePath)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    saveMeta(filePath, meta)
    saveTimers.delete(filePath)
  }, delay)

  saveTimers.set(filePath, timer)
}

/**
 * 立即保存（窗口关闭时调用）
 */
export async function flushSaveMeta(filePath: string, meta: FileMeta): Promise<void> {
  const existing = saveTimers.get(filePath)
  if (existing) {
    clearTimeout(existing)
    saveTimers.delete(filePath)
  }
  await saveMeta(filePath, meta)
}
