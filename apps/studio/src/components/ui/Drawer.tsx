import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../lib/useFocusTrap'

interface DrawerProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Drawer({ open, title, subtitle, onClose, children, footer }: DrawerProps) {
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
        <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      ) : null}
      <div
        ref={panelRef}
        className={`drawer-panel ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ display: open ? 'flex' : 'none' }}
      >
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-foreground truncate">{title}</h3>
            {subtitle ? (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? (
          <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  )
}
