import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { useFocusTrap } from '../../lib/useFocusTrap'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 破坏性操作用红色确认按钮 + 警示图标 */
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let seq = 0
const listeners = new Set<(s: ConfirmState | null) => void>()
let current: ConfirmState | null = null

function emit(next: ConfirmState | null) {
  current = next
  listeners.forEach((fn) => fn(next))
}

/**
 * 命令式确认弹窗，替代 window.confirm。
 * 用法：`if (await confirmDialog({ title: '确认删除？', danger: true })) { ... }`
 * 详见 docs/design-optimization/B端设计优化方案.md §4.2
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // 若已有弹窗未决，先取消它，避免堆叠
  if (current) {
    current.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    emit({ ...options, resolve })
  })
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const listener = (s: ConfirmState | null) => setState(s)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const open = Boolean(state)
  useFocusTrap(panelRef, open)

  const settle = useCallback((ok: boolean) => {
    setState((prev) => {
      prev?.resolve(ok)
      return null
    })
    current = null
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, settle])

  if (!state) return null

  const dialogId = `confirm-${++seq}`

  return (
    <>
      <div
        className="drawer-backdrop"
        style={{ zIndex: 70 }}
        onClick={() => settle(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={state.description ? `${dialogId}-desc` : undefined}
        className="fixed z-[71] bg-card border border-border shadow-floating"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(420px, calc(100vw - 32px))',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {state.danger ? (
              <div
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-sm"
                style={{
                  color: 'var(--color-error)',
                  background: 'var(--color-error-bg)',
                }}
              >
                <AlertTriangle size={18} />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2
                id={`${dialogId}-title`}
                className="text-sm font-medium text-foreground"
              >
                {state.title}
              </h2>
              {state.description ? (
                <p
                  id={`${dialogId}-desc`}
                  className="text-xs text-muted-foreground mt-1.5"
                >
                  {state.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => settle(false)}>
            {state.cancelLabel ?? '取消'}
          </Button>
          <Button
            variant={state.danger ? 'danger' : 'primary'}
            size="sm"
            onClick={() => settle(true)}
          >
            {state.confirmLabel ?? '确定'}
          </Button>
        </div>
      </div>
    </>
  )
}
