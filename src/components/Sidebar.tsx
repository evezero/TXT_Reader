import { useState } from 'react'
import type { Chapter, Bookmark, Tab } from '../types'

interface SidebarProps {
  tab: Tab | null
  currentChapterIndex: number
  onChapterClick: (chapterIndex: number) => void
  onBookmarkClick: (chapterIndex: number, paragraphIndex: number) => void
  onBookmarkDelete: (bookmarkId: string) => void
  collapsed: boolean
}

type SidebarTab = 'toc' | 'bookmarks'

export function Sidebar({
  tab,
  currentChapterIndex,
  onChapterClick,
  onBookmarkClick,
  onBookmarkDelete,
  collapsed,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('toc')

  const chapters: Chapter[] = tab?.chapters ?? []
  const bookmarks: Bookmark[] = tab?.meta?.bookmarks ?? []

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-hidden={collapsed}>
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab-btn ${activeTab === 'toc' ? 'active' : ''}`}
          onClick={() => setActiveTab('toc')}
          id="sidebar-toc-btn"
        >
          目录
          {chapters.length > 0 && (
            <span className="badge" style={{ marginLeft: 4 }}>{chapters.length}</span>
          )}
        </button>
        <button
          className={`sidebar-tab-btn ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
          id="sidebar-bookmarks-btn"
        >
          书签
          {bookmarks.length > 0 && (
            <span className="badge" style={{ marginLeft: 4 }}>{bookmarks.length}</span>
          )}
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'toc' && (
          <>
            {chapters.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 12, color: 'var(--tab-text)' }}>
                  {tab ? '未识别到章节结构' : '请打开一个文件'}
                </div>
              </div>
            ) : (
              <ul role="list" style={{ listStyle: 'none', padding: 0 }}>
                {chapters.map((ch) => (
                  <li key={ch.index}>
                    <button
                      className={`chapter-item ${ch.index === currentChapterIndex ? 'active' : ''}`}
                      onClick={() => onChapterClick(ch.index)}
                      title={ch.title}
                      style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <span style={{ opacity: 0.4, fontSize: 11, marginRight: 6 }}>
                        {(ch.index + 1).toString().padStart(2, '0')}
                      </span>
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {activeTab === 'bookmarks' && (
          <>
            {bookmarks.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔖</div>
                <div style={{ fontSize: 12, color: 'var(--tab-text)' }}>
                  按 Ctrl+B 添加书签
                </div>
              </div>
            ) : (
              <ul role="list" style={{ listStyle: 'none', padding: 0 }}>
                {bookmarks.map((bm) => (
                  <li key={bm.id} className="bookmark-item">
                    <button
                      style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      onClick={() => onBookmarkClick(bm.chapterIndex, bm.paragraphIndex)}
                    >
                      <div className="bookmark-label">🔖 {bm.label}</div>
                      <div className="bookmark-meta">
                        {new Date(bm.createdAt).toLocaleDateString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                    <button
                      className="bookmark-delete"
                      onClick={() => onBookmarkDelete(bm.id)}
                      title="删除书签"
                      aria-label="删除书签"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="0" y1="0" x2="10" y2="10"/>
                        <line x1="10" y1="0" x2="0" y2="10"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
