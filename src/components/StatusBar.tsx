interface StatusBarProps {
  filePath: string
  chapterInfo: string
  totalChapters: number
  totalParagraphs: number
  currentParagraph: number
  readingProgress: number  // 0-100
  isDirty?: boolean
  onSave?: () => void
}

export function StatusBar({
  filePath,
  chapterInfo,
  totalChapters,
  totalParagraphs,
  currentParagraph,
  readingProgress,
  isDirty,
  onSave,
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
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {isDirty && onSave && (
          <button
            onClick={onSave}
            title="保存修改 (Ctrl+S)"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--active-bg)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            保存
          </button>
        )}
        <span className="statusbar-item">
          {readingProgress.toFixed(0)}%
        </span>
      </span>
    </div>
  )
}
