import React from 'react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  className,
  disabled,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  const variantClasses = {
    primary: 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white focus:ring-primary-500 shadow-sm hover:shadow-md',
    secondary: 'bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 border border-neutral-300 focus:ring-primary-500 shadow-sm hover:shadow-md',
    danger: 'bg-secondary-500 hover:bg-secondary-600 active:bg-secondary-700 text-white focus:ring-secondary-500 shadow-sm hover:shadow-md',
    ghost: 'hover:bg-neutral-100 active:bg-neutral-200 text-neutral-700 focus:ring-primary-500',
    outline: 'border-2 border-primary-500 text-primary-600 hover:bg-primary-50 active:bg-primary-100 focus:ring-primary-500'
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg'
  }
  
  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-5 h-5',
    xl: 'w-6 h-6'
  }

  const LoadingSpinner = () => (
    <svg className={clsx('animate-spin', iconSizeClasses[size])} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner />
          {children && <span className="ml-2">{children}</span>}
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <span className={clsx('flex-shrink-0', children && 'mr-2', iconSizeClasses[size])}>
              {icon}
            </span>
          )}
          {children}
          {icon && iconPosition === 'right' && (
            <span className={clsx('flex-shrink-0', children && 'ml-2', iconSizeClasses[size])}>
              {icon}
            </span>
          )}
        </>
      )}
    </motion.button>
  )
}

export default Button