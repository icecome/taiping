import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ children, padding = 'md', className = '', ...rest }: Props) {
  const paddingClass =
    padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4'
  return (
    <div className={`card ${paddingClass} ${className}`} {...rest}>
      {children}
    </div>
  )
}
