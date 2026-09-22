import type { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}

export function EmptyState({
  title = '暂无数据',
  description = '可以尝试刷新或者修改筛选条件',
  actionLabel,
  onAction,
  children,
}: Props) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 mb-4 border border-border bg-secondary rounded-sm flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M5 7l1.5 12h11L19 7M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">{description}</p>
      {actionLabel && onAction ? (
        <Button onClick={onAction}>{actionLabel}</Button>
      ) : null}
      {children}
    </div>
  )
}
