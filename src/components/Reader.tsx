import React, { forwardRef, useEffect, useImperativeHandle, useRef, useCallback, useState } from 'react'
import { MemoizedParagraph } from './MemoizedParagraph'
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
  onParagraphAction?: (action: { type: 'edit' | 'split' | 'mergePrev' | 'mergeNext' | 'markDirty', index: number, text?: string, offset?: number }) => void
  isBossMode?: boolean
}

export const Reader = forwardRef<ReaderHandle, ReaderProps>(function Reader(
  { tab, style, onProgressChange, onChapterChange, manualHeadings, onRelocateFile, onParagraphAction, isBossMode },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const currentParaRef = useRef(tab.meta?.progress?.paragraphIndex ?? 0)
  const ignoreScrollRef = useRef<number>(0)

  const paragraphs = tab.paragraphs ?? []
  const chapters: Chapter[] = tab.chapters ?? []
  
  // Update paragraph refs array size when paragraphs change
  useEffect(() => {
    paragraphRefs.current = paragraphRefs.current.slice(0, paragraphs.length)
  }, [paragraphs.length])

    const updateCurrentPara = useCallback((idx: number, fromUserAction = false) => {
    if (fromUserAction) {
      ignoreScrollRef.current = Date.now()
    }
    if (idx !== currentParaRef.current && idx >= 0 && idx < paragraphs.length) {
      currentParaRef.current = idx
      const currentChapter = findChapterByParagraph(chapters, idx)
      if (currentChapter) {
        onChapterChange(currentChapter.index)
      }
      onProgressChange(currentChapter?.index ?? 0, idx)

      if (tab.meta && tab.filePath) {
        const chapterIndex = currentChapter?.index ?? 0
        const updatedMeta = updateProgress(tab.meta, {
          chapterIndex,
          paragraphIndex: idx,
          scrollRatio: 0,
        })
        debouncedSaveMeta(tab.filePath, updatedMeta)
      }
    }
  }, [chapters, onChapterChange, onProgressChange, paragraphs.length, tab.filePath, tab.meta])

  const initialScrollDoneRef = useRef(false)

  // Scroll handler to detect current paragraph
  const handleScroll = useCallback(() => {
    if (!containerRef.current || paragraphs.length === 0) return
    if (!initialScrollDoneRef.current && (tab.meta?.progress?.paragraphIndex ?? 0) > 0) return // 在恢复阅读进度之前，忽略所有滚动事件
    if (Date.now() - ignoreScrollRef.current < 200) return // 忽略由键盘光标移动引起的自动滚动

    const container = containerRef.current
    const { scrollTop } = container
    
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

    updateCurrentPara(currentIdx)
  }, [paragraphs.length, updateCurrentPara])

  // Initialize scroll position on load
  useEffect(() => {
    const initIdx = tab.meta?.progress?.paragraphIndex ?? 0
    if (initIdx > 0 && initIdx < paragraphs.length && containerRef.current) {
      initialScrollDoneRef.current = false
      let attempts = 0
      
      const tryScroll = () => {
        const el = paragraphRefs.current[initIdx]
        if (el && containerRef.current) {
          ignoreScrollRef.current = Date.now() + 500 // 忽略刚跳转时引发的连续 scroll 事件
          containerRef.current.scrollTo({
            top: el.offsetTop - containerRef.current.offsetTop,
            behavior: 'auto'
          })
          currentParaRef.current = initIdx
          initialScrollDoneRef.current = true
        } else if (attempts < 50) { // 最多尝试 5 秒 (50 * 100ms)
          attempts++
          setTimeout(tryScroll, 100)
        } else {
          // 放弃
          initialScrollDoneRef.current = true
        }
      }
      tryScroll()
    } else {
      initialScrollDoneRef.current = true
    }
  }, [tab.id, paragraphs.length]) // Only run when tab or total paragraphs changes

  // Handle focus request from App.tsx
  useEffect(() => {
    if (tab.focusRequest) {
      const { index, offset, timestamp } = tab.focusRequest
      // Check if this request is new
      if (timestamp && Date.now() - timestamp < 1000) {
        // give React a moment to render the new DOM structure
        setTimeout(() => {
          const el = paragraphRefs.current[index]
          if (el) {
            el.focus()
            const sel = window.getSelection()
            if (sel) {
              const newRange = document.createRange()
              // Try to find the text node to set cursor
              if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
                newRange.setStart(el.firstChild, Math.min(offset, el.firstChild.textContent?.length || 0))
              } else {
                // If it's an empty paragraph or has <br>, just focus it
                newRange.selectNodeContents(el)
                newRange.collapse(true)
              }
              sel.removeAllRanges()
              sel.addRange(newRange)
            }
          }
        }, 50)
      }
    }
  }, [tab.focusRequest])

  // Stable callbacks for MemoizedParagraph
  const onParagraphActionRef = useRef(onParagraphAction)
  useEffect(() => {
    onParagraphActionRef.current = onParagraphAction
  }, [onParagraphAction])

  const updateCurrentParaRef = useRef(updateCurrentPara)
  useEffect(() => {
    updateCurrentParaRef.current = updateCurrentPara
  }, [updateCurrentPara])

  const handleParaFocus = useCallback((index: number) => {
    if (updateCurrentParaRef.current) updateCurrentParaRef.current(index, true)
  }, [])

  const handleParaBlur = useCallback((index: number, textContent: string) => {
    if (onParagraphActionRef.current) {
      onParagraphActionRef.current({ type: 'edit', index, text: textContent })
    }
  }, [])

  const handleParaDirty = useCallback(() => {
    if (onParagraphActionRef.current) {
      onParagraphActionRef.current({ type: 'markDirty', index: 0 })
    }
  }, [])

  const handleParaKeyDownAction = useCallback((action: { type: 'split' | 'mergePrev' | 'mergeNext', index: number, offset?: number }) => {
    if (onParagraphActionRef.current) {
      onParagraphActionRef.current(action)
    }
  }, [])

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
        >
          <div style={{ height: 40 }} />
          {paragraphs.map((para, index) => {
            return (
              <MemoizedParagraph
                key={index}
                para={para}
                index={index}
                isTitle={isChapterTitle(index)}
                isMarked={isManualHeading(index)}
                isBossMode={!!isBossMode}
                totalParagraphs={paragraphs.length}
                onFocus={handleParaFocus}
                onBlur={handleParaBlur}
                onDirty={handleParaDirty}
                onKeyDownAction={handleParaKeyDownAction}
                setRef={(el) => { paragraphRefs.current[index] = el }}
              />
            )
          })}
          <div style={{ height: 120 }} />
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
