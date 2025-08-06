import React, { forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  icon,
  iconPosition = 'left',
  fullWidth = true,
  className,
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
  
  const inputClasses = clsx(
    'block rounded-lg border shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 sm:text-sm',
    {
      'border-neutral-300 focus:border-primary-500 focus:ring-primary-500': !error,
      'border-secondary-300 text-secondary-900 placeholder-secondary-300 focus:border-secondary-500 focus:ring-secondary-500': error,
      'pl-10': icon && iconPosition === 'left',
      'pr-10': icon && iconPosition === 'right',
      'px-3 py-2': !icon,
      'w-full': fullWidth
    },
    className
  )

  return (
    <div className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          {label}
        </label>
      )}
      
      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className={clsx('w-5 h-5', error ? 'text-secondary-400' : 'text-neutral-400')}>
              {icon}
            </span>
          </div>
        )}
        
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          {...props}
        />
        
        {icon && iconPosition === 'right' && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className={clsx('w-5 h-5', error ? 'text-secondary-400' : 'text-neutral-400')}>
              {icon}
            </span>
          </div>
        )}
      </div>
      
      {(error || helperText) && (
        <p className={clsx('mt-1 text-sm', error ? 'text-secondary-600' : 'text-neutral-500')}>
          {error || helperText}
        </p>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export default Input