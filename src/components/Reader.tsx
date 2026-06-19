import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const currentParaRef = useRef(tab.meta?.progress?.paragraphIndex ?? 0)

  const paragraphs = tab.paragraphs ?? []
  const chapters: Chapter[] = tab.chapters ?? []
  
  // Update paragraph refs array size when paragraphs change
  useEffect(() => {
    paragraphRefs.current = paragraphRefs.current.slice(0, paragraphs.length)
  }, [paragraphs.length])

  // Scroll handler to detect current paragraph
  const handleScroll = useCallback(() => {
    if (!containerRef.current || paragraphs.length === 0) return
    const container = containerRef.current
    const { scrollTop, clientHeight } = container
    
    // Find the first paragraph that is visible in the viewport
    let currentIdx = currentParaRef.current
    
    // Simple heuristic: just check around the current index first
    const checkVisible = (idx: number) => {
      const el = paragraphRefs.current[idx]
      if (!el) return false
      const top = el.offsetTop - container.offsetTop
      const bottom = top + el.offsetHeight
      return bottom > scrollTop
    }

    if (checkVisible(currentIdx)) {
      // It might be an earlier paragraph
      while (currentIdx > 0 && checkVisible(currentIdx - 1)) {
        currentIdx--
      }
    } else {
      // It might be a later paragraph
      while (currentIdx < paragraphs.length - 1 && !checkVisible(currentIdx)) {
        currentIdx++
      }
    }

    if (currentIdx !== currentParaRef.current && currentIdx >= 0 && currentIdx < paragraphs.length) {
      currentParaRef.current = currentIdx
      const currentChapter = findChapterByParagraph(chapters, currentIdx)
      if (currentChapter) {
        onChapterChange(currentChapter.index)
      }
      onProgressChange(currentChapter?.index ?? 0, currentIdx)

      if (tab.meta && tab.filePath) {
        const chapterIndex = currentChapter?.index ?? 0
        const updatedMeta = updateProgress(tab.meta, {
          chapterIndex,
          paragraphIndex: currentIdx,
          scrollRatio: 0,
        })
        debouncedSaveMeta(tab.filePath, updatedMeta)
      }
    }
  }, [paragraphs.length, chapters, onChapterChange, onProgressChange, tab.meta, tab.filePath])

  // Initialize scroll position on load
  useEffect(() => {
    const initIdx = tab.meta?.progress?.paragraphIndex ?? 0
    if (initIdx > 0 && initIdx < paragraphs.length && containerRef.current) {
      // use setTimeout to allow DOM to render
      setTimeout(() => {
        const el = paragraphRefs.current[initIdx]
        if (el && containerRef.current) {
          containerRef.current.scrollTo({
            top: el.offsetTop - containerRef.current.offsetTop,
            behavior: 'auto'
          })
        }
      }, 100)
    }
  }, [tab.id]) // Only run when tab changes

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
      const el = paragraphRefs.current[ch.paragraphStart]
      if (el && containerRef.current) {
        containerRef.current.scrollTo({
          top: el.offsetTop - containerRef.current.offsetTop,
          behavior: 'smooth'
        })
      }
    },
    scrollToParagraph(paragraphIndex: number) {
      const el = paragraphRefs.current[paragraphIndex]
      if (el && containerRef.current) {
        containerRef.current.scrollTo({
          top: el.offsetTop - containerRef.current.offsetTop,
          behavior: 'auto'
        })
      }
    },
    getCurrentParagraphIndex() {
      return currentParaRef.current
    },
  }))


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
        <div
          ref={containerRef}
          style={{ height: '100%', width: '100%', overflowY: 'auto' }}
          onScroll={handleScroll}
          className="reader-scroll-view"
        >
          <div style={{ height: 40 }} data-tauri-drag-region={isBossMode ? true : undefined} />
          {paragraphs.map((para, index) => {
            const isTitle = isChapterTitle(index)
            const isMarked = isManualHeading(index)
            return (
              <p
                key={index}
                ref={(el) => { paragraphRefs.current[index] = el }}
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
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    document.execCommand('insertText', false, '\n')
                    return
                  }
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
                {para === '' ? <br /> : para}
              </p>
            )
          })}
          <div style={{ height: 120 }} data-tauri-drag-region={isBossMode ? true : undefined} />
        </div>
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
