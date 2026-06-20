import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { open, ask } from '@tauri-apps/plugin-dialog'
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
  addIgnoredHeading,
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
  const urlParams = new URLSearchParams(window.location.search)
  const initBossMode = urlParams.get('boss') === 'true'
  const initFile = urlParams.get('file')

  const [isBossMode, setIsBossMode] = useState(initBossMode)
  const hasLoadedInitRef = useRef(false)
  
  const [splitTabId, setSplitTabId] = useState<string | null>(null)
  const [showReplace, setShowReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [bossOpacity, setBossOpacity] = useState(0.95)

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
          ignoredHeadings: finalMeta.ignoredHeadings,
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

  // ─── 批量替换 ──────────────────────────────────────────────────────────
  const handleBatchReplace = useCallback(async () => {
    if (!activeTab || !activeTab.filePath || !activeTab.content || !findText) return
    const newContent = activeTab.content.split(findText).join(replaceText)
    if (newContent === activeTab.content) {
      addToast('未找到可替换的内容', 'info')
      return
    }
    try {
      const res = await invoke<any>('write_file', { path: activeTab.filePath, content: newContent })
      if (!res.success) throw new Error(res.error)
      
      const chapters = parseChapters(newContent, {
        customSeparator: activeTab.meta?.customSeparator,
        manualHeadings: activeTab.meta?.manualHeadings,
        ignoredHeadings: activeTab.meta?.ignoredHeadings,
      })
      const paragraphs = splitParagraphs(newContent)
      
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: newContent, chapters, paragraphs } : t))
      addToast('批量替换成功', 'success')
      setShowReplace(false)
    } catch (err) {
      addToast('替换失败: ' + String(err), 'error')
    }
  }, [activeTab, activeTabId, findText, replaceText, addToast])

  // ─── Tab 管理 ──────────────────────────────────────────────────────────
  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const targetTab = tabs.find((t) => t.id === tabId)
      if (targetTab?.isDirty) {
        try {
          const yes = await ask(`文件已修改，是否保存？\n${targetTab.fileName}`, { title: '未保存的更改', kind: 'warning' })
          if (yes) {
            const res = await invoke<any>('write_file', { path: targetTab.filePath, content: targetTab.content })
            if (!res.success) {
              addToast('保存失败: ' + res.error, 'error')
              return // 放弃关闭
            }
            addToast('文件已保存', 'success')
          }
        } catch (err) {
          console.error(err)
        }
      }

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
    [tabs, activeTabId, addToast]
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

  const handleSaveFile = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty || !activeTab.content) return
    try {
      const res = await invoke<any>('write_file', { path: activeTab.filePath, content: activeTab.content })
      if (!res.success) throw new Error(res.error)
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isDirty: false } : t))
      addToast('文件已保存', 'success')
    } catch (err) {
      addToast('保存失败: ' + String(err), 'error')
    }
  }, [activeTab, activeTabId, addToast])

  // ─── 窗口关闭拦截 ───────────────────────────────────────────────────────
  const tabsRef = useRef(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    let unlisten: () => void
    const setupCloseInterceptor = async () => {
      const appWindow = getCurrentWindow()
      if (appWindow.label !== 'main') return

      unlisten = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault()
        
        // 强制退出前将所有进度刷入磁盘
        const flushPromises = tabsRef.current
          .filter(t => t.filePath && t.meta)
          .map(t => flushSaveMeta(t.filePath!, t.meta!))
        await Promise.all(flushPromises)

        const hasDirty = tabsRef.current.some(t => t.isDirty)
        if (hasDirty) {
          const confirmed = await ask('有修改未保存，确定要关闭吗？', { title: '未保存提示', kind: 'warning' })
          if (confirmed) {
            await invoke('force_exit')
          }
        } else {
          await invoke('force_exit')
        }
      })
    }
    setupCloseInterceptor()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // ─── 键盘快捷键 ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        await handleSaveFile()
        return
      }

      if (e.key === 'Escape' && isBossMode) {
        try {
          const cur = getCurrentWindow()
          
          try {
            const windows = await getAllWebviewWindows()
            const mainWindow = windows.find(w => w.label === 'main')
            if (mainWindow) {
              await mainWindow.show()
            }
          } catch (e) {
            console.error('Failed to show main window:', e)
          }

          try {
            await cur.destroy()
          } catch (e) {
            console.error('Failed to destroy:', e)
            await cur.close()
          }
        } catch (err) {
          console.error('Failed to close boss mode window:', err)
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
          ignoredHeadings: newMeta.ignoredHeadings,
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
  }, [handleOpenFile, activeTab, activeTabId, currentChapterIndex, handleCloseTab, handleSaveFile, addToast, isBossMode])

  useEffect(() => {
    if (initBossMode && initFile && !hasLoadedInitRef.current) {
      hasLoadedInitRef.current = true
      loadFile(initFile)
    }
  }, [initBossMode, initFile, loadFile])

  // ─── 渲染 ─────────────────────────────────────────────────────────────
  const currentChapter = activeTab?.chapters?.[currentChapterIndex]
  const chapterInfo = activeTab?.chapters?.length
    ? `第 ${currentChapterIndex + 1} / ${activeTab.chapters.length} 章 · ${currentChapter?.title ?? ''}`
    : ''

  const effectiveTheme = THEMES.find((t) => t.id === getEffectiveTheme(systemDark))

  const handleParagraphAction = useCallback(async (action: { type: 'edit' | 'split' | 'mergePrev' | 'mergeNext' | 'markDirty', index: number, text?: string, offset?: number }) => {
    if (!activeTab) return
    if (action.type === 'markDirty') {
      if (!activeTab.isDirty) {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isDirty: true } : t))
      }
      return
    }

    if (!activeTab.paragraphs) return
    const newParagraphs = [...activeTab.paragraphs]
    let focusReq: { index: number, offset: number, timestamp: number } | undefined = undefined

    if (action.type === 'edit') {
      newParagraphs[action.index] = action.text ?? ''
    } else if (action.type === 'split') {
      const para = newParagraphs[action.index]
      const offset = action.offset ?? 0
      const p1 = para.slice(0, offset)
      const p2 = para.slice(offset)
      newParagraphs.splice(action.index, 1, p1, p2)
      focusReq = { index: action.index + 1, offset: 0, timestamp: Date.now() }
    } else if (action.type === 'mergePrev') {
      if (action.index === 0) return
      const prev = newParagraphs[action.index - 1]
      const curr = newParagraphs[action.index]
      newParagraphs[action.index - 1] = prev + curr
      newParagraphs.splice(action.index, 1)
      focusReq = { index: action.index - 1, offset: prev.length, timestamp: Date.now() }
    } else if (action.type === 'mergeNext') {
      if (action.index === newParagraphs.length - 1) return
      const curr = newParagraphs[action.index]
      const next = newParagraphs[action.index + 1]
      newParagraphs[action.index] = curr + next
      newParagraphs.splice(action.index + 1, 1)
      focusReq = { index: action.index, offset: curr.length, timestamp: Date.now() }
    }

    const newContent = newParagraphs.join('\n')

    setTabs(prev => prev.map(t => t.id === activeTabId ? { 
      ...t, 
      content: newContent, 
      paragraphs: newParagraphs, 
      isDirty: true,
      focusRequest: focusReq ?? t.focusRequest 
    } : t))
  }, [activeTab, activeTabId])

  const handleChapterIgnore = useCallback((startLine: number) => {
    if (!activeTab?.meta || !activeTab.filePath) return
    const newMeta = addIgnoredHeading(activeTab.meta, startLine)
    const chapters = parseChapters(activeTab.content ?? '', {
      customSeparator: newMeta.customSeparator,
      manualHeadings: newMeta.manualHeadings,
      ignoredHeadings: newMeta.ignoredHeadings,
    })
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, meta: newMeta, chapters } : t
      )
    )
    saveMeta(activeTab.filePath, newMeta)
    addToast('已删除此目录项', 'success')
  }, [activeTab, activeTabId, addToast])

  return (
    <div
      className={`app-root ${transitioning ? 'theme-transition' : ''} ${isBossMode ? 'boss-mode' : ''}`}
      onMouseDown={(e) => {
        if (isBossMode && e.button === 0) {
          getCurrentWindow().startDragging()
        }
      }}
      style={{
        ['--bg' as string]: effectiveTheme?.background,
        ['--text' as string]: effectiveTheme?.text,
        background: isBossMode ? 'transparent' : 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
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
          onOpenFile={() => {
            if (activeTabId) {
              setActiveTabId(null)
            } else {
              handleOpenFile()
            }
          }}
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
            className={`toolbar-btn ${showReplace ? 'active' : ''}`}
            onClick={() => setShowReplace((p) => !p)}
            title="查找与替换"
            aria-label="查找与替换"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 11l3.5 3.5M12.5 6.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0z"/>
            </svg>
          </button>
          <div className="toolbar-separator" />
          <button
            className={`toolbar-btn ${splitTabId ? 'active' : ''}`}
            onClick={() => {
              if (splitTabId) {
                setSplitTabId(null)
              } else {
                const otherTabs = tabs.filter(t => t.id !== activeTabId)
                if (otherTabs.length > 0) {
                  setSplitTabId(otherTabs[0].id)
                } else {
                  addToast('没有其他已打开的标签页可用于分屏对比', 'info')
                }
              }
            }}
            title="双页对比"
            aria-label="双页对比"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="2" width="6" height="12" rx="1" />
              <rect x="9" y="2" width="6" height="12" rx="1" />
            </svg>
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-btn"
            onClick={async () => {
              if (splitTabId) {
                alert('请先关闭分屏模式再进入摸鱼模式')
                return
              }
              if (!activeTab || !activeTab.filePath) {
                alert('请先打开一本书')
                return
              }
              try {
                const bossWindow = new WebviewWindow('boss-' + Date.now(), {
                  url: `/?boss=true&file=${encodeURIComponent(activeTab.filePath)}`,
                  width: 400,
                  height: 120,
                  transparent: true,
                  decorations: false,
                  alwaysOnTop: true,
                  skipTaskbar: true
                })
                
                bossWindow.once('tauri://created', function () {
                  getCurrentWindow().hide()
                })
                bossWindow.once('tauri://error', function (e) {
                  console.error(e)
                  alert('无法创建摸鱼窗口')
                })
              } catch (err) {
                console.error(err)
                alert('摸鱼模式启动失败')
              }
            }}
            title="摸鱼模式 (独立挂件，Esc退出)"
            aria-label="摸鱼模式"
          >
            🐟
          </button>
        </div>
      )}

      {/* 替换面板 */}
      {showReplace && !isBossMode && activeTab && (
        <div style={{ padding: '8px 16px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', zIndex: 10 }}>
          <input 
            type="text" 
            placeholder="查找内容" 
            value={findText} 
            onChange={e => setFindText(e.target.value)} 
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
          />
          <input 
            type="text" 
            placeholder="替换为" 
            value={replaceText} 
            onChange={e => setReplaceText(e.target.value)} 
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
          />
          <button 
            onClick={handleBatchReplace}
            style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}
          >
            全部替换
          </button>
          <button 
            onClick={() => setShowReplace(false)}
            style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
          >
            取消
          </button>
        </div>
      )}
      {/* 摸鱼模式：纯文本，无任何 UI 元素 */}

      {/* 主体 */}
      <div className="main-area" data-tauri-drag-region={isBossMode ? true : undefined} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!isBossMode && tabs.length > 0 && (
          <Sidebar
            tab={activeTab}
            currentChapterIndex={currentChapterIndex}
            onChapterClick={handleChapterClick}
            onBookmarkClick={handleBookmarkClick}
            onBookmarkDelete={handleBookmarkDelete}
            onChapterIgnore={handleChapterIgnore}
            collapsed={sidebarCollapsed}
          />
        )}

        {tabs.length === 0 ? (
          <Bookshelf onOpenBook={loadFile} />
        ) : activeTab ? (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderRight: splitTabId ? '1px solid var(--border)' : 'none', overflow: 'hidden', position: 'relative' }}>
              <Reader
                ref={readerRef}
                tab={activeTab}
                style={readerStyle}
                onProgressChange={handleProgressChange}
                onChapterChange={setCurrentChapterIndex}
                manualHeadings={activeTab.meta?.manualHeadings ?? []}
                onRelocateFile={handleOpenFile}
                onParagraphAction={handleParagraphAction}
                isBossMode={isBossMode}
              />
            </div>
            {splitTabId && tabs.find(t => t.id === splitTabId) && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative', borderLeft: '1px solid var(--border)' }}>
                <Reader
                  tab={tabs.find(t => t.id === splitTabId)!}
                  style={readerStyle}
                  onProgressChange={() => {}}
                  onChapterChange={() => {}}
                  manualHeadings={tabs.find(t => t.id === splitTabId)?.meta?.manualHeadings ?? []}
                  onRelocateFile={handleOpenFile}
                  onParagraphAction={handleParagraphAction}
                />
                {!isBossMode && (
                  <div style={{ position: 'absolute', top: 8, right: 16, zIndex: 10, display: 'flex', gap: 8, background: 'var(--panel-bg)', padding: '4px 8px', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <select 
                      value={splitTabId} 
                      onChange={e => setSplitTabId(e.target.value)}
                      style={{ background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
                    >
                      {tabs.map(t => (
                        <option key={t.id} value={t.id}>{t.fileName}</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => setSplitTabId(null)}
                      style={{ background: 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
          isDirty={activeTab.isDirty}
          onSave={handleSaveFile}
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
