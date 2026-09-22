import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

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
