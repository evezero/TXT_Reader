import type { Tab } from '../types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabClick: (id: string) => void
  onTabClose: (id: string) => void
  onOpenFile: () => void
  onSaveFile: () => void
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onOpenFile, onSaveFile }: TabBarProps) {
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

          <span className="tab-name">{tab.fileName}{tab.isDirty ? ' *' : ''}</span>

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

      <button
        className="tab-add"
        style={{ marginLeft: 8 }}
        onClick={onSaveFile}
        title="保存修改 (Ctrl+S)"
        aria-label="保存当前文件"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
      </button>

      <button
        className="tab-add"
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => {
          import('@tauri-apps/plugin-dialog').then(({ message }) => {
            message('TXT Reader\n当前版本: 1.2', { title: '版本信息', kind: 'info' })
          }).catch(() => {
            alert('TXT Reader\n当前版本: 1.2')
          })
        }}
        title="关于 / 版本信息"
        aria-label="关于 / 版本信息"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M8 11V7M8 5h.01"/>
        </svg>
      </button>
    </div>
  )
}
