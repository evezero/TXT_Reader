interface StatusBarProps {
  filePath: string
  chapterInfo: string
  totalChapters: number
  totalParagraphs: number
  currentParagraph: number
  readingProgress: number  // 0-100
}

export function StatusBar({
  filePath,
  chapterInfo,
  totalChapters,
  totalParagraphs,
  currentParagraph,
  readingProgress,
}: StatusBarProps) {
  const fileName = filePath ? filePath.split('\\').pop() ?? filePath : ''

  return (
    <div className="statusbar" id="status-bar">
      <span className="statusbar-item" title={filePath}>{fileName}</span>
      {totalChapters > 0 && (
        <>
          <span style={{ opacity: 0.3 }}>|</span>
          <span className="statusbar-item">{chapterInfo}</span>
        </>
      )}
      <span style={{ opacity: 0.3 }}>|</span>
      <span className="statusbar-item">
        第 {currentParagraph + 1} / {totalParagraphs} 段
      </span>
      <span style={{ marginLeft: 'auto' }} className="statusbar-item">
        {readingProgress.toFixed(0)}%
      </span>
    </div>
  )
}
