import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { open } from '@tauri-apps/plugin-dialog'
import { TitleBar } from './components/TitleBar'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { Reader, type ReaderHandle } from './components/Reader'
import { Bookshelf } from './components/Bookshelf'
import { SettingsPanel } from './components/SettingsPanel'
import { StatusBar } from './components/StatusBar'
import { ToastContainer } from './components/ToastContainer'
import { useToast } from './hooks/useToast'
import { parseChapters, splitParagraphs } from './utils/structureParser'
import {
  loadMeta,
  createDefaultMeta,
  addBookmark,
  removeBookmark,
  addManualHeading,
  flushSaveMeta,
  saveMeta,
} from './utils/progressStore'
import type { Tab, ReaderStyle, FileMeta, FileReadResult } from './types'
import { THEMES, DEFAULT_READER_STYLE } from './types'

// ─── 本地存储键名 ──────────────────────────────────────────────────────────
const STYLE_KEY = 'txtreader-style'
const TABS_KEY = 'txtreader-tabs'

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function getFileName(filePath: string): string {
  return filePath.split('\\').pop()?.split('/').pop() ?? filePath
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function loadStyle(): ReaderStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY)
    if (raw) return { ...DEFAULT_READER_STYLE, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_READER_STYLE
}

function saveStyle(style: ReaderStyle) {
  localStorage.setItem(STYLE_KEY, JSON.stringify(style))
}

function loadSavedTabs(): string[] {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveTabPaths(filePaths: string[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(filePaths))
}

const HISTORY_KEY = 'txtreader-history'

function loadHistory(): { filePath: string; fileName: string; lastOpenedAt: number }[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveHistory(history: any[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [readerStyle, setReaderStyle] = useState<ReaderStyle>(loadStyle)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0)
  const [readingProgress, setReadingProgress] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [isBossMode, setIsBossMode] = useState(false)

  const readerRef = useRef<ReaderHandle>(null)
  const originalSizeRef = useRef<any>(null)
  const { toasts, addToast, removeToast } = useToast()

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // ─── 主题计算 ──────────────────────────────────────────────────────────
  const getEffectiveTheme = useCallback(
    (systemDark: boolean) => {
      if (readerStyle.darkMode === 'dark') return 'night'
      if (readerStyle.darkMode === 'light') {
        return readerStyle.themeId === 'night' ? 'standard' : readerStyle.themeId
      }
      return systemDark ? 'night' : readerStyle.themeId
    },
    [readerStyle.darkMode, readerStyle.themeId]
  )

  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    appWindow.theme().then((t) => setSystemDark(t === 'dark'))
    const unlisten = appWindow.onThemeChanged(({ payload }) => {
      setSystemDark(payload === 'dark')
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // 应用主题到 document
  useEffect(() => {
    const effectiveThemeId = getEffectiveTheme(systemDark)
    const prev = document.documentElement.getAttribute('data-theme')
    if (prev !== effectiveThemeId) {
      setTransitioning(true)
      document.documentElement.setAttribute('data-theme', effectiveThemeId)
      setTimeout(() => setTransitioning(false), 220)
    }
  }, [getEffectiveTheme, systemDark])

  // ─── 文件加载 ──────────────────────────────────────────────────────────
  const loadFile = useCallback(
    async (filePath: string) => {
      const existing = tabs.find((t) => t.filePath === filePath)
      if (existing) {
        setActiveTabId(existing.id)
        return
      }

      const tabId = generateTabId()
      const fileName = getFileName(filePath)



      const loadingTab: Tab = {
        id: tabId,
        filePath,
        fileName,
        status: 'loading',
      }
      setTabs((prev) => [...prev, loadingTab])
      setActiveTabId(tabId)

      try {
        const exists = await invoke<boolean>('file_exists', { path: filePath })
        if (!exists) {
          const meta = await loadMeta(filePath)
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? { ...t, status: 'missing', meta: meta ?? createDefaultMeta(filePath) }
                : t
            )
          )
          return
        }

        const result = await invoke<FileReadResult>('read_file', { path: filePath })
        if (!result.success || !result.content) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? { ...t, status: 'error', errorMessage: result.error ?? '读取失败' }
                : t
            )
          )
          addToast(result.error ?? '文件读取失败', 'error')
          return
        }

        const content = result.content
        const meta = await loadMeta(filePath)
        const finalMeta: FileMeta = meta ?? createDefaultMeta(filePath)

        const chapters = parseChapters(content, {
          customSeparator: finalMeta.customSeparator,
          manualHeadings: finalMeta.manualHeadings,
        })
        const paragraphs = splitParagraphs(content)

        const readyTab: Tab = {
          id: tabId,
          filePath,
          fileName,
          status: 'ready',
          content,
          chapters,
          paragraphs,
          meta: { ...finalMeta, lastOpenedAt: Date.now() },
        }

        setTabs((prev) => prev.map((t) => (t.id === tabId ? readyTab : t)))

        if (chapters.length > 0) {
          addToast(`已识别 ${chapters.length} 个章节`, 'success')
        }

        await saveMeta(filePath, readyTab.meta!)
      } catch (err) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, status: 'error', errorMessage: String(err) }
              : t
          )
        )
      }
    },
    [tabs, addToast]
  )

  // ─── 打开文件对话框（Tauri 插件）────────────────────────────────────────
  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      if (!selected) return
      const filePaths = Array.isArray(selected) ? selected : [selected]
      for (const fp of filePaths) {
        await loadFile(fp)
      }
    } catch (err) {
      addToast(`打开文件失败: ${String(err)}`, 'error')
    }
  }, [loadFile, addToast])

  // ─── Tab 管理 ──────────────────────────────────────────────────────────
  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId)
        const newTabs = prev.filter((t) => t.id !== tabId)
        if (activeTabId === tabId) {
          const nextTab = newTabs[Math.max(0, idx - 1)]
          setActiveTabId(nextTab?.id ?? null)
        }
        return newTabs
      })
    },
    [activeTabId]
  )

  // ─── 持久化 Tab 列表 ───────────────────────────────────────────────────
  useEffect(() => {
    saveTabPaths(tabs.map((t) => t.filePath))
  }, [tabs])



  useEffect(() => {
    saveStyle(readerStyle)
  }, [readerStyle])

  // 恢复上次 Tab
  useEffect(() => {
    const saved = loadSavedTabs()
    if (saved.length > 0) {
      ;(async () => {
        for (const fp of saved) {
          await loadFile(fp)
        }
      })()
    }
  }, [])

  // 窗口关闭时保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const tab of tabs) {
        if (tab.meta && tab.filePath) {
          flushSaveMeta(tab.filePath, tab.meta)
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [tabs])

  // ─── 章节跳转 ─────────────────────────────────────────────────────────
  const handleChapterClick = useCallback(
    (chapterIndex: number) => {
      readerRef.current?.scrollToChapter(chapterIndex)
      setCurrentChapterIndex(chapterIndex)
    },
    []
  )

  const handleBookmarkClick = useCallback(
    (_chapterIndex: number, paragraphIndex: number) => {
      readerRef.current?.scrollToParagraph(paragraphIndex)
    },
    []
  )

  const handleBookmarkDelete = useCallback(
    (bookmarkId: string) => {
      if (!activeTab?.meta || !activeTab.filePath) return
      const newMeta = removeBookmark(activeTab.meta, bookmarkId)
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, meta: newMeta } : t
        )
      )
      saveMeta(activeTab.filePath, newMeta)
      addToast('书签已删除', 'info')
    },
    [activeTab, activeTabId, addToast]
  )

  // ─── 进度变化 ─────────────────────────────────────────────────────────
  const handleProgressChange = useCallback(
    (chapterIndex: number, paragraphIndex: number) => {
      setCurrentChapterIndex(chapterIndex)
      setCurrentParagraphIndex(paragraphIndex)

      const paragraphs = activeTab?.paragraphs
      if (paragraphs && paragraphs.length > 0) {
        setReadingProgress((paragraphIndex / (paragraphs.length - 1)) * 100)
      }

      if (activeTab?.meta) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id === activeTabId && t.meta) {
              return {
                ...t,
                meta: {
                  ...t.meta,
                  progress: { chapterIndex, paragraphIndex, scrollRatio: 0 },
                },
              }
            }
            return t
          })
        )
      }
    },
    [activeTab, activeTabId]
  )

  // ─── 键盘快捷键 ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBossMode) {
        setIsBossMode(false)
        const appWindow = getCurrentWindow()
        await appWindow.setAlwaysOnTop(false)
        if (originalSizeRef.current) {
          await appWindow.setSize(originalSizeRef.current)
        }
      }

      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        handleOpenFile()
        return
      }

      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setReaderStyle((prev) => ({ ...prev, fontSize: Math.min(32, prev.fontSize + 1) }))
        return
      }

      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        setReaderStyle((prev) => ({ ...prev, fontSize: Math.max(12, prev.fontSize - 1) }))
        return
      }

      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        setReaderStyle((prev) => ({ ...prev, fontSize: DEFAULT_READER_STYLE.fontSize }))
        addToast('字号已重置', 'info')
        return
      }

      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        if (!activeTab?.meta || !activeTab.filePath) return
        const paraIndex = readerRef.current?.getCurrentParagraphIndex() ?? 0
        const para = activeTab.paragraphs?.[paraIndex] ?? ''
        const label = para.slice(0, 30) + (para.length > 30 ? '…' : '')
        const chapterIndex = currentChapterIndex

        const newMeta = addBookmark(activeTab.meta, {
          chapterIndex,
          paragraphIndex: paraIndex,
          label: label || `第 ${paraIndex + 1} 段`,
        })

        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, meta: newMeta } : t))
        )
        saveMeta(activeTab.filePath, newMeta)
        addToast('书签已添加', 'success')
        return
      }

      if (e.altKey && e.key === 'h') {
        e.preventDefault()
        if (!activeTab?.meta || !activeTab.filePath) return
        const paraIndex = readerRef.current?.getCurrentParagraphIndex() ?? 0
        const newMeta = addManualHeading(activeTab.meta, paraIndex)
        const chapters = parseChapters(activeTab.content ?? '', {
          customSeparator: newMeta.customSeparator,
          manualHeadings: newMeta.manualHeadings,
        })
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId ? { ...t, meta: newMeta, chapters } : t
          )
        )
        saveMeta(activeTab.filePath, newMeta)
        addToast('已标记为章节标题', 'success')
        return
      }

      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setShowSettings((prev) => !prev)
        return
      }

      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) handleCloseTab(activeTabId)
        return
      }

      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        setSidebarCollapsed((prev) => !prev)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleOpenFile, activeTab, activeTabId, currentChapterIndex, handleCloseTab, addToast])

  // ─── 渲染 ─────────────────────────────────────────────────────────────
  const currentChapter = activeTab?.chapters?.[currentChapterIndex]
  const chapterInfo = activeTab?.chapters?.length
    ? `第 ${currentChapterIndex + 1} / ${activeTab.chapters.length} 章 · ${currentChapter?.title ?? ''}`
    : ''

  const effectiveTheme = THEMES.find((t) => t.id === getEffectiveTheme(systemDark))

  const handleEditParagraph = useCallback(async (paraIndex: number, newText: string) => {
    if (!activeTab || !activeTab.filePath || !activeTab.paragraphs) return
    const newParagraphs = [...activeTab.paragraphs]
    newParagraphs[paraIndex] = newText
    const newContent = newParagraphs.join('\n\n')

    try {
      const res = await invoke<any>('write_file', { path: activeTab.filePath, content: newContent })
      if (!res.success) throw new Error(res.error)
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: newContent, paragraphs: newParagraphs } : t))
      addToast('已保存修改', 'success')
    } catch (err) {
      addToast('保存失败: ' + String(err), 'error')
    }
  }, [activeTab, activeTabId, addToast])

  return (
    <div
      className={`app-root ${transitioning ? 'theme-transition' : ''} ${isBossMode ? 'boss-mode' : ''}`}
      style={{
        ['--bg' as string]: effectiveTheme?.background,
        ['--text' as string]: effectiveTheme?.text,
      }}
    >
      {/* 顶部进度条 */}
      {!isBossMode && (
        <div
          className="reading-progress-bar"
          style={{ width: `${readingProgress}%` }}
          role="progressbar"
          aria-valuenow={readingProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}

      {/* 自定义标题栏 */}
      {!isBossMode && (
        <TitleBar
          title={activeTab?.fileName ? `${activeTab.fileName} — TXT Reader` : 'TXT Reader'}
        />
      )}

      {/* Tab 栏 */}
      {!isBossMode && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={setActiveTabId}
          onTabClose={handleCloseTab}
          onOpenFile={handleOpenFile}
        />
      )}

      {/* 工具栏 */}
      {!isBossMode && tabs.length > 0 && (
        <div className="toolbar">
          <button
            className={`toolbar-btn ${sidebarCollapsed ? '' : 'active'}`}
            onClick={() => setSidebarCollapsed((p) => !p)}
            title="切换侧边栏 (Ctrl+\\)"
            aria-label="切换侧边栏"
            id="toolbar-toggle-sidebar"
          >
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="14" height="12" rx="1.5"/>
              <line x1="5" y1="1" x2="5" y2="13"/>
            </svg>
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-btn"
            onClick={handleOpenFile}
            title="打开文件 (Ctrl+O)"
            aria-label="打开文件"
            id="toolbar-open-file"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3l1.5 2H14A1.5 1.5 0 0 1 15 5v7.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5z"/>
            </svg>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              if (!activeTab?.meta || !activeTab.filePath) return
              const paraIndex = readerRef.current?.getCurrentParagraphIndex() ?? 0
              const para = activeTab.paragraphs?.[paraIndex] ?? ''
              const label = para.slice(0, 30) + (para.length > 30 ? '…' : '')
              const newMeta = addBookmark(activeTab.meta, {
                chapterIndex: currentChapterIndex,
                paragraphIndex: paraIndex,
                label: label || `第 ${paraIndex + 1} 段`,
              })
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTabId ? { ...t, meta: newMeta } : t))
              )
              saveMeta(activeTab.filePath, newMeta)
              addToast('书签已添加', 'success')
            }}
            title="添加书签 (Ctrl+B)"
            aria-label="添加书签"
            id="toolbar-add-bookmark"
          >
            🔖
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-btn"
            onClick={() => setShowSettings(true)}
            title="阅读设置 (Ctrl+,)"
            aria-label="阅读设置"
            id="toolbar-settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.41 1.41M11.37 11.37l1.41 1.41M3.22 12.78l1.41-1.41M11.37 4.63l1.41-1.41"/>
            </svg>
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-btn"
            onClick={async () => {
              const appWindow = getCurrentWindow()
              originalSizeRef.current = await appWindow.innerSize()
              await appWindow.setSize(new LogicalSize(400, 120))
              await appWindow.setAlwaysOnTop(true)
              setIsBossMode(true)
            }}
            title="摸鱼模式 (Esc 退出)"
            aria-label="摸鱼模式"
          >
            🐟
          </button>
        </div>
      )}

      {/* 主体 */}
      <div className="main-area" data-tauri-drag-region={isBossMode}>
        {!isBossMode && tabs.length > 0 && (
          <Sidebar
            tab={activeTab}
            currentChapterIndex={currentChapterIndex}
            onChapterClick={handleChapterClick}
            onBookmarkClick={handleBookmarkClick}
            onBookmarkDelete={handleBookmarkDelete}
            collapsed={sidebarCollapsed}
          />
        )}

        {tabs.length === 0 ? (
          <Bookshelf onOpenBook={loadFile} />
        ) : activeTab ? (
          <Reader
            ref={readerRef}
            tab={activeTab}
            style={readerStyle}
            onProgressChange={handleProgressChange}
            onChapterChange={setCurrentChapterIndex}
            manualHeadings={activeTab.meta?.manualHeadings ?? []}
            onRelocateFile={handleOpenFile}
            onEditParagraph={handleEditParagraph}
          />
        ) : (
          <Bookshelf onOpenBook={loadFile} />
        )}
      </div>

      {/* 状态栏 */}
      {!isBossMode && activeTab && activeTab.status === 'ready' && (
        <StatusBar
          filePath={activeTab.filePath}
          chapterInfo={chapterInfo}
          totalChapters={activeTab.chapters?.length ?? 0}
          totalParagraphs={activeTab.paragraphs?.length ?? 0}
          currentParagraph={currentParagraphIndex}
          readingProgress={readingProgress}
        />
      )}

      {/* 设置面板 */}
      {showSettings && (
        <SettingsPanel
          style={readerStyle}
          onStyleChange={(newStyle) => {
            setReaderStyle(newStyle)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
