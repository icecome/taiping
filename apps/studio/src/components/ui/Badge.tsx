import type { ReactNode } from 'react'

type Tone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted'

const toneStyles: Record<Tone, string> = {
  default: '',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  muted: 'badge-muted',
}

interface Props {
  tone?: Tone
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'default', dot = false, children, className = '' }: Props) {
  return (
    <span className={`badge ${toneStyles[tone]} ${className}`}>
      {dot ? <span className={`badge-dot bg-current opacity-70`} /> : null}
      {children}
    </span>
  )
}
