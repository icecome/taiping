import type { SelectHTMLAttributes, ReactNode } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  children?: ReactNode
}

export function Select({ className = '', children, ...rest }: Props) {
  return (
    <select className={`select-base ${className}`} {...rest}>
      {children}
    </select>
  )
}
