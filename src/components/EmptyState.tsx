import { useState } from 'react'

interface EmptyStateProps {
  onOpenFile: () => Promise<void> | void
  history?: { filePath: string; fileName: string; lastOpenedAt: number }[]
  onOpenHistory?: (filePath: string) => void
}

export function EmptyState({ onOpenFile, history = [], onOpenHistory }: EmptyStateProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      await onOpenFile()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="empty-state">
      <div className="empty-header">
        <div className="empty-icon">📖</div>
        <h1 className="empty-title">TXT Reader</h1>
        <p className="empty-subtitle">
          自动识别章节结构，支持沉浸式阅读
        </p>
        <button
          className={`empty-btn ${loading ? 'empty-btn-loading' : ''}`}
          onClick={handleClick}
          id="empty-open-file-btn"
          disabled={loading}
        >
          {loading ? '正在打开…' : '打开文件'}
        </button>
      </div>

      {history.length > 0 && (
        <div className="bookshelf">
          <h2 className="bookshelf-title">我的书架</h2>
          <div className="bookshelf-grid">
            {history.map((book) => (
              <div
                key={book.filePath}
                className="book-item"
                onClick={() => onOpenHistory && onOpenHistory(book.filePath)}
              >
                <div className="book-cover">
                  <div className="book-cover-text">{book.fileName.slice(0, 4)}</div>
                </div>
                <div className="book-info">
                  <div className="book-name" title={book.fileName}>{book.fileName}</div>
                  <div className="book-time">{new Date(book.lastOpenedAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
