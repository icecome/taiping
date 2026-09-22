import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../lib/useFocusTrap'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 底部抽屉（移动端）或居中弹层（默认） */
  variant?: 'center' | 'sheet'
}

/** 共享 Esc / body lock / focus trap 的弹层基元 */
export function Modal({ open, title, onClose, children, footer, variant = 'center' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 bg-black/30 z-50"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          variant === 'sheet'
            ? `fixed left-0 right-0 bottom-0 bg-card border-t border-border z-50 overflow-y-auto flex flex-col ${open ? 'open' : ''}`
            : `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg z-50 overflow-y-auto flex flex-col shadow-lg ${open ? 'open' : ''}`
        }
        style={{
          display: open ? 'flex' : 'none',
          maxHeight: variant === 'sheet' ? '70vh' : '80vh',
          width: variant === 'sheet' ? '100%' : 'min(560px, 92vw)',
          borderRadius: variant === 'sheet' ? 'var(--radius-lg) var(--radius-lg) 0 0' : undefined,
          boxShadow: 'var(--shadow-floating)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex-1 min-h-0">{children}</div>
        {footer ? (
          <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2 justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  )
}
