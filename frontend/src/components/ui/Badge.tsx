import React from 'react'
import { clsx } from 'clsx'

interface BadgeProps {
  children?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  dot?: boolean
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className,
  dot = false
}) => {
  const baseClasses = 'inline-flex items-center font-medium rounded-full'
  
  const variantClasses = {
    primary: 'bg-primary-100 text-primary-700 border border-primary-200',
    secondary: 'bg-secondary-100 text-secondary-700 border border-secondary-200',
    success: 'bg-accent-100 text-accent-700 border border-accent-200',
    warning: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    danger: 'bg-red-100 text-red-700 border border-red-200',
    neutral: 'bg-neutral-100 text-neutral-700 border border-neutral-200'
  }
  
  const sizeClasses = {
    sm: dot ? 'w-2 h-2' : 'px-2 py-0.5 text-xs',
    md: dot ? 'w-2.5 h-2.5' : 'px-2.5 py-0.5 text-sm',
    lg: dot ? 'w-3 h-3' : 'px-3 py-1 text-sm'
  }
  
  const dotVariantClasses = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    success: 'bg-accent-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
    neutral: 'bg-neutral-500'
  }

  if (dot) {
    return (
      <span
        className={clsx(
          'rounded-full',
          dotVariantClasses[variant],
          sizeClasses[size],
          className
        )}
      />
    )
  }

  return (
    <span
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  )
}

export default Badge