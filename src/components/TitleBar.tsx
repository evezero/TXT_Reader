import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface TitleBarProps {
  title: string
}

export function TitleBar({ title }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const appWindow = getCurrentWindow()

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized)
    const unlisten = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized())
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-content">
        <img src="/app-icon.png" className="titlebar-logo" alt="Logo" />
        <span className="titlebar-title" data-tauri-drag-region>{title}</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="window-btn"
          onClick={() => appWindow.minimize()}
          title="最小化"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1"/>
          </svg>
        </button>
        <button
          className="window-btn"
          onClick={async () => {
            await appWindow.toggleMaximize()
            setIsMaximized(await appWindow.isMaximized())
          }}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8"/>
              <rect x="0" y="2" width="8" height="8" fill="var(--titlebar-bg)"/>
              <rect x="0" y="2" width="8" height="8"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0" y="0" width="10" height="10"/>
            </svg>
          )}
        </button>
        <button
          className="window-btn close"
          onClick={() => appWindow.close()}
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10"/>
            <line x1="10" y1="0" x2="0" y2="10"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
