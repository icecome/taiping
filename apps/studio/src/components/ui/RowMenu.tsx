import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface RowMenuItem {
  key: string
  label: string
  danger?: boolean
  onClick: () => void
}

export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 键盘：Esc 关闭并归还焦点；上下键在菜单项间移动；Enter/Space 触发
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => {
          const next = e.key === 'ArrowDown' ? prev + 1 : prev - 1
          if (next < 0) return items.length - 1
          if (next >= items.length) return 0
          return next
        })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, items.length])

  // 焦点跟随高亮项
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const btns = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    btns?.[activeIndex]?.focus()
  }, [open, activeIndex])

  return (
    <div ref={wrapRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            setOpen(true)
            setActiveIndex(-1)
          }
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-11 z-30 min-w-[144px] border border-border bg-card rounded-sm py-1.5 shadow-floating"
        >
          {items.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`row-menu-item block w-full text-left transition-colors hover:bg-secondary focus:bg-secondary outline-none ${
                item.danger ? 'text-destructive' : 'text-foreground'
              }`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
                item.onClick()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(false)
                  triggerRef.current?.focus()
                  item.onClick()
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function RowMenuWrap({ children }: { children: ReactNode }) {
  return <div className="flex justify-end">{children}</div>
}
