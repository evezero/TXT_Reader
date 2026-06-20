import React from 'react'

export interface MemoizedParagraphProps {
  para: string
  index: number
  isTitle: boolean
  isMarked: boolean
  isBossMode: boolean
  totalParagraphs: number
  onFocus: (index: number) => void
  onBlur: (index: number, textContent: string) => void
  onDirty: () => void
  onKeyDownAction: (action: { type: 'split' | 'mergePrev' | 'mergeNext', index: number, offset?: number }) => void
  setRef: (el: HTMLParagraphElement | null) => void
}

export const MemoizedParagraph = React.memo(({
  para, index, isTitle, isMarked, isBossMode, totalParagraphs,
  onFocus, onBlur, onDirty, onKeyDownAction, setRef
}: MemoizedParagraphProps) => {
  return (
    <p
      ref={setRef}
      className={`reader-paragraph ${isTitle ? 'chapter-title' : ''} ${isMarked ? 'marked-heading' : ''}`}
      data-para-index={index}
      contentEditable={!isBossMode}
      suppressContentEditableWarning
      onFocus={() => onFocus(index)}
      onBlur={(e) => {
        const newText = e.currentTarget.textContent || ''
        if (newText !== para) {
          onBlur(index, newText)
        }
      }}
      onInput={(e) => {
        const newText = e.currentTarget.textContent || ''
        if (newText !== para) {
          onDirty()
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
          try {
            const preRange = document.createRange()
            preRange.selectNodeContents(el)
            preRange.setEnd(range.startContainer, range.startOffset)
            return preRange.toString().length
          } catch {
            return 0
          }
        }

        const offset = getOffset()
        const totalLen = textContent.length

        if (e.key === 'Enter') {
          e.preventDefault()
          onKeyDownAction({ type: 'split', index, offset })
          return
        }

        if (e.key === 'Backspace' && offset === 0 && index > 0) {
          e.preventDefault()
          onKeyDownAction({ type: 'mergePrev', index })
          return
        }

        if (e.key === 'Delete' && offset === totalLen && index < totalParagraphs - 1) {
          e.preventDefault()
          onKeyDownAction({ type: 'mergeNext', index })
          return
        }

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
          const lineH = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5
          if (totalLen === 0 || caretRect.top === 0 || caretRect.top - elRect.top < lineH * 0.8 || offset === 0) {
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
          if (totalLen === 0 || caretRect.bottom === 0 || elRect.bottom - caretRect.bottom < lineH * 0.8 || offset >= totalLen) {
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
}, (prevProps, nextProps) => {
  return (
    prevProps.para === nextProps.para &&
    prevProps.isTitle === nextProps.isTitle &&
    prevProps.isMarked === nextProps.isMarked &&
    prevProps.isBossMode === nextProps.isBossMode &&
    prevProps.totalParagraphs === nextProps.totalParagraphs
  )
})
