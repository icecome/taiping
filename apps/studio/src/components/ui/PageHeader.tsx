import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ icon, title, description, actions }: Props) {
  return (
    <header className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? <div className="mt-0.5 text-foreground shrink-0">{icon}</div> : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground leading-tight truncate">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1 admin-desc-truncate">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
