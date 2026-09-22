import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

const variantStyles: Record<Variant, string> = {
  primary: 'btn-primary border-0',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger border-0',
  link: 'btn-link',
}

const sizeStyles: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconOnly?: boolean
}

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  iconOnly = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: Props) {
  const iconOnlyClass = iconOnly ? 'btn-icon' : ''
  return (
    <button
      type={type}
      className={`${variantStyles[variant]} ${sizeStyles[size]} ${iconOnlyClass} whitespace-nowrap ${className}`}
      {...rest}
    >
      {icon ? <span className={children ? 'mr-1.5' : ''}>{icon}</span> : null}
      {iconOnly ? null : children}
    </button>
  )
}
