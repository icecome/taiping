import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function Panel({ title, description, actions, children }: Props) {
  return (
    <section className="border border-border bg-card rounded-sm">
      <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
