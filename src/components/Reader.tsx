import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Tab, ReaderStyle, Chapter } from '../types'
import { findChapterByParagraph } from '../utils/structureParser'
import { debouncedSaveMeta, updateProgress } from '../utils/progressStore'

export interface ReaderHandle {
  scrollToChapter: (chapterIndex: number) => void
  scrollToParagraph: (paragraphIndex: number) => void
  getCurrentParagraphIndex: () => number
}

interface ReaderProps {
  tab: Tab
  style: ReaderStyle
  onProgressChange: (chapterIndex: number, paragraphIndex: number) => void
  onChapterChange: (chapterIndex: number) => void
  manualHeadings: number[]
  onRelocateFile?: () => void
  onEditParagraph?: (index: number, newText: string) => void
  isBossMode?: boolean
}

export const Reader = forwardRef<ReaderHandle, ReaderProps>(function Reader(
  { tab, style, onProgressChange, onChapterChange, manualHeadings, onRelocateFile, onEditParagraph, isBossMode },
  ref
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const currentParaRef = useRef(tab.meta?.progress?.paragraphIndex ?? 0)

  const paragraphs = tab.paragraphs ?? []
  const chapters: Chapter[] = tab.chapters ?? []
  
  // ... rest of the file stays same until itemContent
  const isChapterTitle = useCallback(
    (paraIndex: number): boolean => {
      return chapters.some((ch) => ch.paragraphStart === paraIndex)
    },
    [chapters]
  )

  const isManualHeading = useCallback(
    (paraIndex: number): boolean => {
      return manualHeadings.includes(paraIndex)
    },
    [manualHeadings]
  )

  useImperativeHandle(ref, () => ({
    scrollToChapter(chapterIndex: number) {
      const ch = chapters[chapterIndex]
      if (!ch) return
      virtuosoRef.current?.scrollToIndex({
        index: ch.paragraphStart,
        align: 'start',
        behavior: 'smooth'
      })
    },
    scrollToParagraph(paragraphIndex: number) {
      virtuosoRef.current?.scrollToIndex({
        index: paragraphIndex,
        align: 'start',
        behavior: 'auto'
      })
    },
    getCurrentParagraphIndex() {
      return currentParaRef.current
    },
  }))

  const handleRangeChanged = useCallback(({ startIndex }: { startIndex: number }) => {
    if (startIndex !== currentParaRef.current) {
      currentParaRef.current = startIndex

      const currentChapter = findChapterByParagraph(chapters, startIndex)
      if (currentChapter) {
        onChapterChange(currentChapter.index)
      }

      onProgressChange(currentChapter?.index ?? 0, startIndex)

      if (tab.meta && tab.filePath) {
        const chapterIndex = currentChapter?.index ?? 0
        const updatedMeta = updateProgress(tab.meta, {
          chapterIndex,
          paragraphIndex: startIndex,
          scrollRatio: 0,
        })
        debouncedSaveMeta(tab.filePath, updatedMeta)
      }
    }
  }, [chapters, onChapterChange, onProgressChange, tab.meta, tab.filePath])

  if (tab.status === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div className="loading-spinner" />
        <span style={{ fontSize: 14, color: 'var(--tab-text)' }}>正在加载文件…</span>
      </div>
    )
  }

  if (tab.status === 'missing') {
    return (
      <div className="missing-file-state">
        <div className="missing-icon">⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>文件不存在</h2>
        <p style={{ fontSize: 14, color: 'var(--tab-text)', textAlign: 'center', lineHeight: 1.6 }}>
          文件 <code style={{ background: 'var(--input-bg)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{tab.filePath}</code><br />
          已移动或删除，阅读进度已保留。
        </p>
        <button
          className="empty-btn"
          onClick={onRelocateFile}
          id="missing-relocate-btn"
        >
          重新定位文件
        </button>
      </div>
    )
  }

  if (tab.status === 'error') {
    return (
      <div className="missing-file-state">
        <div className="missing-icon">❌</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>加载失败</h2>
        <p style={{ fontSize: 14, color: 'var(--tab-text)' }}>{tab.errorMessage ?? '未知错误'}</p>
      </div>
    )
  }

  return (
    <div
      className="reader-container"
      id="reader-scroll-container"
      style={{
        ['--reader-font-size' as string]: `${style.fontSize}px`,
        ['--reader-line-height' as string]: String(style.lineHeight),
        ['--reader-max-width' as string]: `${style.maxWidth}px`,
        ['--reader-para-spacing' as string]: `${style.paragraphSpacing}em`,
        ['--reader-indent' as string]: style.indent > 0 ? `${style.indent}em` : '0',
        fontFamily: style.fontFamily,
      }}
    >
      {paragraphs.length > 0 ? (
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={paragraphs}
          initialTopMostItemIndex={tab.meta?.progress?.paragraphIndex ?? 0}
          rangeChanged={handleRangeChanged}
          components={{
            Header: () => <div style={{ height: 40 }} data-tauri-drag-region={isBossMode ? true : undefined} />,
            Footer: () => <div style={{ height: 120 }} data-tauri-drag-region={isBossMode ? true : undefined} />
          }}
          itemContent={(index, para) => {
            const isTitle = isChapterTitle(index)
            const isMarked = isManualHeading(index)
            return (
              <p
                className={`reader-paragraph ${isTitle ? 'chapter-title' : ''} ${isMarked ? 'marked-heading' : ''}`}
                data-para-index={index}
                data-tauri-drag-region={isBossMode ? true : undefined}
                contentEditable={!isBossMode}
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newText = e.currentTarget.innerText
                  if (newText !== para && onEditParagraph) {
                    onEditParagraph(index, newText)
                  }
                }}
                onKeyDown={(e) => {
                  const el = e.currentTarget
                  const sel = window.getSelection()
                  if (!sel || sel.rangeCount === 0) return
                  const range = sel.getRangeAt(0)
                  if (!range.collapsed) return // don't interfere with text selection

                  const textContent = el.textContent || ''
                  
                  // Helper: get a flat text offset within the element
                  const getOffset = (): number => {
                    const preRange = document.createRange()
                    preRange.selectNodeContents(el)
                    preRange.setEnd(range.startContainer, range.startOffset)
                    return preRange.toString().length
                  }

                  const offset = getOffset()
                  const totalLen = textContent.length

                  if (e.key === 'ArrowLeft') {
                    if (offset === 0) {
                      e.preventDefault()
                      const prevEl = document.querySelector(`[data-para-index="${index - 1}"]`) as HTMLElement
                      if (prevEl) {
                        prevEl.focus()
                        const newRange = document.createRange()
                        newRange.selectNodeContents(prevEl)
                        newRange.collapse(false) // end
                        sel.removeAllRanges()
                        sel.addRange(newRange)
                      }
                    }
                  } else if (e.key === 'ArrowRight') {
                    if (offset >= totalLen) {
                      e.preventDefault()
                      const nextEl = document.querySelector(`[data-para-index="${index + 1}"]`) as HTMLElement
                      if (nextEl) {
                        nextEl.focus()
                        const newRange = document.createRange()
                        newRange.selectNodeContents(nextEl)
                        newRange.collapse(true) // start
                        sel.removeAllRanges()
                        sel.addRange(newRange)
                      }
                    }
                  } else if (e.key === 'ArrowUp') {
                    // Check if cursor is on the first visual line
                    const caretRect = range.getBoundingClientRect()
                    const elRect = el.getBoundingClientRect()
                    // If cursor top is near element top (within one line height), we're on first line
                    const lineH = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5
                    if (caretRect.top - elRect.top < lineH * 0.8 || offset === 0) {
                      e.preventDefault()
                      const prevEl = document.querySelector(`[data-para-index="${index - 1}"]`) as HTMLElement
                      if (prevEl) {
                        prevEl.focus()
                        const newRange = document.createRange()
                        newRange.selectNodeContents(prevEl)
                        newRange.collapse(false) // go to end of prev paragraph
                        sel.removeAllRanges()
                        sel.addRange(newRange)
                      }
                    }
                  } else if (e.key === 'ArrowDown') {
                    // Check if cursor is on the last visual line
                    const caretRect = range.getBoundingClientRect()
                    const elRect = el.getBoundingClientRect()
                    const lineH = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5
                    if (elRect.bottom - caretRect.bottom < lineH * 0.8 || offset >= totalLen) {
                      e.preventDefault()
                      const nextEl = document.querySelector(`[data-para-index="${index + 1}"]`) as HTMLElement
                      if (nextEl) {
                        nextEl.focus()
                        const newRange = document.createRange()
                        newRange.selectNodeContents(nextEl)
                        newRange.collapse(true) // go to start of next paragraph
                        sel.removeAllRanges()
                        sel.addRange(newRange)
                      }
                    }
                  }
                }}
                style={{
                  margin: `0 auto var(--reader-para-spacing)`,
                  fontSize: 'var(--reader-font-size)',
                  lineHeight: 'var(--reader-line-height)',
                  maxWidth: 'var(--reader-max-width)',
                  textIndent: 'var(--reader-indent)',
                  padding: '2px 48px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              >
                {para}
              </p>
            )
          }}
        />
      ) : (
        <div className="reader-inner">
          <p style={{ textAlign: 'center', opacity: 0.4, marginTop: '20vh' }}>
            （空文件）
          </p>
        </div>
      )}
    </div>
  )
})
