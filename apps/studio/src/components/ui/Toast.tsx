import { useToastStore } from '../../lib/toast'

export function ToastHost() {
  const items = useToastStore((s) => s.items)
  const remove = useToastStore((s) => s.remove)
  if (!items.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => remove(t.id)}
          className="px-4 py-2 text-sm rounded-sm border border-border bg-card text-foreground shadow-none text-left"
          style={{
            borderLeft:
              t.type === 'error'
                ? '3px solid var(--color-error)'
                : '3px solid var(--primary)',
          }}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
