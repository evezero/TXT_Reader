import type { Tab } from '../types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabClick: (id: string) => void
  onTabClose: (id: string) => void
  onOpenFile: () => void
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onOpenFile }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          style={tab.status === 'missing' ? { opacity: 0.6 } : undefined}
          onClick={() => onTabClick(tab.id)}
          title={tab.filePath}
        >
          {tab.status === 'loading' && (
            <span style={{ fontSize: 10, color: 'var(--accent)' }}>⟳</span>
          )}
          {tab.status === 'missing' && (
            <span style={{ fontSize: 10, color: '#f59e0b' }}>⚠</span>
          )}
          {tab.status === 'error' && (
            <span style={{ fontSize: 10, color: '#ef4444' }}>✕</span>
          )}

          <span className="tab-name">{tab.fileName}</span>

          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              onTabClose(tab.id)
            }}
            title="关闭"
            role="button"
            aria-label={`关闭 ${tab.fileName}`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="0" y1="0" x2="8" y2="8"/>
              <line x1="8" y1="0" x2="0" y2="8"/>
            </svg>
          </span>
        </button>
      ))}

      <button
        className="tab-add"
        onClick={onOpenFile}
        title="打开文件 (Ctrl+O)"
        aria-label="打开新文件"
      >
        +
      </button>
    </div>
  )
}
