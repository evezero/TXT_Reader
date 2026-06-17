// ─── 章节结构 ──────────────────────────────────────────────────────────────
export interface Chapter {
  index: number
  title: string
  startLine: number  // 在原始行数组中的起始行
  paragraphStart: number  // 章节内起始段落索引（全局）
}

// ─── 书签 ──────────────────────────────────────────────────────────────────
export interface Bookmark {
  id: string
  chapterIndex: number
  paragraphIndex: number
  label: string
  createdAt: number
}

// ─── 阅读进度 ──────────────────────────────────────────────────────────────
export interface ReadingProgress {
  chapterIndex: number
  paragraphIndex: number
  scrollRatio: number
}

// ─── 文件元数据（持久化到 .txtreader-meta.json）────────────────────────────
export interface FileMeta {
  version: number
  filePath: string
  progress: ReadingProgress
  bookmarks: Bookmark[]
  manualHeadings: number[]  // 手工标记的行号
  customSeparator?: string
  lastOpenedAt: number
}

// ─── Tab 页 ────────────────────────────────────────────────────────────────
export type TabStatus = 'loading' | 'ready' | 'error' | 'missing'

export interface Tab {
  id: string
  filePath: string
  fileName: string
  status: TabStatus
  content?: string      // 全文内容
  chapters?: Chapter[]  // 章节列表
  paragraphs?: string[] // 段落列表
  meta?: FileMeta
  errorMessage?: string
}

// ─── 主题 ──────────────────────────────────────────────────────────────────
export type ThemeId = 'standard' | 'eye-care' | 'night'
export type DarkModePreference = 'system' | 'light' | 'dark'

export interface Theme {
  id: ThemeId
  name: string
  background: string
  text: string
  isDark: boolean
}

export const THEMES: Theme[] = [
  { id: 'standard', name: '标准', background: '#ffffff', text: '#1a1a1a', isDark: false },
  { id: 'eye-care', name: '护眼黄底', background: '#f5ecd6', text: '#3d2f1f', isDark: false },
  { id: 'night', name: '夜间暗灰', background: '#1a1a1a', text: '#e0e0e0', isDark: true },
]

// ─── 阅读器样式设置 ────────────────────────────────────────────────────────
export interface ReaderStyle {
  themeId: ThemeId
  darkMode: DarkModePreference
  fontSize: number      // 12-32px
  lineHeight: number    // 1.4-2.0
  maxWidth: number      // 600-1200px
  paragraphSpacing: number  // 0-2em
  indent: 0 | 1 | 2    // 段首缩进字符数
  fontFamily: string
}

export const DEFAULT_READER_STYLE: ReaderStyle = {
  themeId: 'standard',
  darkMode: 'system',
  fontSize: 18,
  lineHeight: 1.8,
  maxWidth: 800,
  paragraphSpacing: 0.8,
  indent: 2,
  fontFamily: '微软雅黑',
}

// ─── Tauri IPC 返回类型 ───────────────────────────────────────────────────
export interface FileReadResult {
  success: boolean
  content?: string
  size?: number
  error?: string
}

export interface MetaReadResult {
  success: boolean
  data: FileMeta | null
}

export interface WriteResult {
  success: boolean
  error?: string
}
