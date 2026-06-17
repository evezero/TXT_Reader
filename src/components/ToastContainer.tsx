import type { ToastItem } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const icons: Record<ToastItem['type'], string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  }

  return (
    <div className="toast-container" aria-live="polite" id="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`} role="alert">
          <span style={{ fontWeight: 600, opacity: 0.7 }}>{icons[toast.type]}</span>
          <span>{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--tab-text)',
              fontSize: 12,
              padding: '0 2px',
            }}
            aria-label="关闭通知"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
