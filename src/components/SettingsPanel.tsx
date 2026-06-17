import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ReaderStyle, ThemeId, DarkModePreference } from '../types'
import { THEMES } from '../types'

interface SettingsPanelProps {
  style: ReaderStyle
  onStyleChange: (style: ReaderStyle) => void
  onClose: () => void
}

export function SettingsPanel({ style, onStyleChange, onClose }: SettingsPanelProps) {
  const [fonts, setFonts] = useState<string[]>([])

  useEffect(() => {
    invoke<string[]>('get_fonts').then(setFonts)
  }, [])

  const update = <K extends keyof ReaderStyle>(key: K, value: ReaderStyle[K]) => {
    onStyleChange({ ...style, [key]: value })
  }

  return (
    <div
      className="settings-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      id="settings-overlay"
    >
      <div className="settings-panel" role="dialog" aria-labelledby="settings-title">
        <div className="settings-header">
          <h2 className="settings-title" id="settings-title">阅读设置</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭设置">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="0" y1="0" x2="12" y2="12"/>
              <line x1="12" y1="0" x2="0" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* 主题 */}
          <div className="settings-section">
            <div className="settings-section-title">主题</div>
            <div className="theme-buttons">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-btn ${style.themeId === theme.id ? 'active' : ''}`}
                  onClick={() => update('themeId', theme.id as ThemeId)}
                  style={{
                    background: theme.background,
                    color: theme.text,
                  }}
                  id={`theme-btn-${theme.id}`}
                >
                  <div
                    className="theme-swatch"
                    style={{ background: `linear-gradient(135deg, ${theme.background} 50%, ${theme.text} 50%)` }}
                  />
                  <span style={{ fontSize: 11 }}>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 暗色模式 */}
          <div className="settings-section">
            <div className="settings-section-title">暗色模式</div>
            <div className="mode-buttons">
              {([
                { key: 'system', label: '跟随系统' },
                { key: 'light', label: '浅色' },
                { key: 'dark', label: '深色' },
              ] as { key: DarkModePreference; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  className={`mode-btn ${style.darkMode === key ? 'active' : ''}`}
                  onClick={() => update('darkMode', key)}
                  id={`dark-mode-btn-${key}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 字体 */}
          <div className="settings-section">
            <div className="settings-section-title">字体</div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="font-family-select">字体</label>
              <select
                id="font-family-select"
                className="settings-select"
                value={style.fontFamily}
                onChange={(e) => update('fontFamily', e.target.value)}
              >
                {fonts.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 排版 */}
          <div className="settings-section">
            <div className="settings-section-title">排版</div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="font-size-slider">字号</label>
              <input
                id="font-size-slider"
                type="range"
                className="settings-slider"
                min={12}
                max={32}
                step={1}
                value={style.fontSize}
                onChange={(e) => update('fontSize', Number(e.target.value))}
              />
              <span className="settings-value">{style.fontSize}px</span>
            </div>

            <div className="settings-row">
              <label className="settings-label" htmlFor="line-height-slider">行高</label>
              <input
                id="line-height-slider"
                type="range"
                className="settings-slider"
                min={1.4}
                max={2.0}
                step={0.05}
                value={style.lineHeight}
                onChange={(e) => update('lineHeight', Number(e.target.value))}
              />
              <span className="settings-value">{style.lineHeight.toFixed(2)}</span>
            </div>

            <div className="settings-row">
              <label className="settings-label" htmlFor="max-width-slider">页宽</label>
              <input
                id="max-width-slider"
                type="range"
                className="settings-slider"
                min={600}
                max={1200}
                step={50}
                value={style.maxWidth}
                onChange={(e) => update('maxWidth', Number(e.target.value))}
              />
              <span className="settings-value">{style.maxWidth}px</span>
            </div>

            <div className="settings-row">
              <label className="settings-label" htmlFor="para-spacing-slider">段间距</label>
              <input
                id="para-spacing-slider"
                type="range"
                className="settings-slider"
                min={0}
                max={2}
                step={0.1}
                value={style.paragraphSpacing}
                onChange={(e) => update('paragraphSpacing', Number(e.target.value))}
              />
              <span className="settings-value">{style.paragraphSpacing.toFixed(1)}em</span>
            </div>

            <div className="settings-row">
              <label className="settings-label">缩进</label>
              <div className="indent-buttons">
                {([0, 1, 2] as (0 | 1 | 2)[]).map((n) => (
                  <button
                    key={n}
                    className={`indent-btn ${style.indent === n ? 'active' : ''}`}
                    onClick={() => update('indent', n)}
                    id={`indent-btn-${n}`}
                  >
                    {n === 0 ? '无' : `${n}字`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
