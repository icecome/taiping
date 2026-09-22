import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...rest }: Props) {
  return <input className={`input-base ${className}`} {...rest} />
}
