import type { Chapter } from '../types'

/**
 * 结构识别引擎
 * 优先级：C(缩进启发式) > B(英文Chapter) > A(中文网文) > D(自定义分隔符) > E(手工标记)
 */

// ─── 策略 A：中文网文正则 ─────────────────────────────────────────────────
const CHINESE_CHAPTER_RE = /^(第\s*[\u4e00-\u9fa5\d〇零一二三四五六七八九十百千万]+\s*[章回节集卷篇]|第\s*\d+\s*[章回节集卷篇])/

// ─── 策略 B：英文 Chapter ─────────────────────────────────────────────────
const ROMAN_NUMERALS = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i
const ENGLISH_CHAPTER_RE = /^(Chapter\s+\d+|CHAPTER\s+\d+|Part\s+\d+|PART\s+\d+|Book\s+\d+|BOOK\s+\d+)/i

function isRomanNumeral(s: string): boolean {
  const trimmed = s.trim()
  return trimmed.length > 0 && ROMAN_NUMERALS.test(trimmed)
}

// ─── 策略 C：缩进启发式 ───────────────────────────────────────────────────
const ENDING_PUNCTUATION = /[，。！？、；：""''【】「」…—～,.!?;:]$/

function isHeuristicTitle(lines: string[], idx: number): boolean {
  const line = lines[idx].trim()
  if (!line) return false
  if (line.length > 30) return false
  if (ENDING_PUNCTUATION.test(line)) return false

  const prevEmpty = idx === 0 || lines[idx - 1].trim() === ''
  const nextEmpty = idx === lines.length - 1 || lines[idx + 1].trim() === ''
  return prevEmpty && nextEmpty
}

// ─── 策略 D：自定义分隔符 ─────────────────────────────────────────────────
function isCustomSeparator(line: string, separator?: string): boolean {
  if (!separator) return false
  const trimmed = line.trim()
  return trimmed === separator || trimmed.startsWith(separator)
}

// ─── 主解析函数 ───────────────────────────────────────────────────────────

export interface ParseOptions {
  customSeparator?: string
  manualHeadings?: number[]
}

export function parseChapters(content: string, options: ParseOptions = {}): Chapter[] {
  const lines = content.split('\n')
  const chapters: Chapter[] = []
  let chapterIndex = 0
  let globalParagraphIndex = 0

  // 先统计每行开始的段落索引（段落 = 非空行块）
  const lineToParagraph: number[] = new Array(lines.length).fill(-1)
  let inParagraph = false
  let paraIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      if (!inParagraph) {
        inParagraph = true
        paraIdx++
      }
      lineToParagraph[i] = paraIdx - 1
    } else {
      inParagraph = false
    }
  }

  // 检测候选标题行
  const titleLines: Array<{ lineIdx: number; title: string; strategy: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // E. 手工标记（最高优先）
    if (options.manualHeadings?.includes(i)) {
      titleLines.push({ lineIdx: i, title: line, strategy: 'E' })
      continue
    }

    // C. 缩进启发式
    if (isHeuristicTitle(lines, i)) {
      titleLines.push({ lineIdx: i, title: line, strategy: 'C' })
      continue
    }

    // B. 英文 Chapter
    if (ENGLISH_CHAPTER_RE.test(line) || isRomanNumeral(line)) {
      titleLines.push({ lineIdx: i, title: line, strategy: 'B' })
      continue
    }

    // A. 中文网文
    if (CHINESE_CHAPTER_RE.test(line)) {
      titleLines.push({ lineIdx: i, title: line, strategy: 'A' })
      continue
    }

    // D. 自定义分隔符
    if (isCustomSeparator(line, options.customSeparator)) {
      titleLines.push({ lineIdx: i, title: line, strategy: 'D' })
      continue
    }
  }

  // 去重：如果同一策略连续出现，保留第一个
  const dedupedTitles = titleLines.filter((t, idx) => {
    if (idx === 0) return true
    const prev = titleLines[idx - 1]
    if (t.strategy === prev.strategy && t.lineIdx - prev.lineIdx < 10) {
      return false
    }
    return true
  })

  // 如果找到的章节太少（<2），说明识别失败，返回空
  if (dedupedTitles.length < 2) {
    return []
  }

  // 构建章节列表
  for (const { lineIdx, title } of dedupedTitles) {
    const paraStart = lineToParagraph[lineIdx]
    chapters.push({
      index: chapterIndex++,
      title,
      startLine: lineIdx,
      paragraphStart: paraStart >= 0 ? paraStart : globalParagraphIndex,
    })
    globalParagraphIndex++
  }

  return chapters
}

/**
 * 将文本内容分割为段落数组
 */
export function splitParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return paragraphs
}

/**
 * 根据段落索引找到所属章节
 */
export function findChapterByParagraph(chapters: Chapter[], paragraphIndex: number): Chapter | null {
  if (chapters.length === 0) return null
  let result = chapters[0]
  for (const ch of chapters) {
    if (ch.paragraphStart <= paragraphIndex) {
      result = ch
    } else {
      break
    }
  }
  return result
}

/**
 * 获取某章节的段落范围 [start, end)
 */
export function getChapterParagraphRange(
  chapters: Chapter[],
  chapterIndex: number,
  totalParagraphs: number
): [number, number] {
  const ch = chapters[chapterIndex]
  if (!ch) return [0, totalParagraphs]
  const nextCh = chapters[chapterIndex + 1]
  const end = nextCh ? nextCh.paragraphStart : totalParagraphs
  return [ch.paragraphStart, end]
}
