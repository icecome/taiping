import type { ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'

interface TabItem {
  key: string
  label: ReactNode
  count?: number
}

interface Props {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ items, activeKey, onChange, className = '' }: Props) {
  return (
    <div className={`tabs-row ${className}`}>
      {items.map((item) => {
        const active = item.key === activeKey
        return (
          <button
            key={item.key}
            type="button"
            className={`tab-item ${active ? 'tab-item-active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="text-xs text-muted-foreground ml-1">{item.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* 面包屑 */
export function Breadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight size={12} className="opacity-50" /> : null}
          {item.onClick ? (
            <button type="button" className="hover:text-foreground transition-colors">
              {item.label}
            </button>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* 抽屉头部 */
export function DrawerHeader({
  title,
  onClose,
  subtitle,
}: {
  title: string
  onClose: () => void
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium text-foreground truncate">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        className="w-9 h-9 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  )
}
