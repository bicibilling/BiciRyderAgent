import React from 'react'
import { clsx } from 'clsx'

interface AvatarProps {
  src?: string
  alt?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  initials?: string
  className?: string
  status?: 'online' | 'offline' | 'busy' | 'away'
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'md',
  initials,
  className,
  status
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-20 h-20 text-2xl'
  }
  
  const statusClasses = {
    online: 'bg-accent-500',
    offline: 'bg-neutral-400',
    busy: 'bg-secondary-500',
    away: 'bg-yellow-500'
  }
  
  const statusSizeClasses = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
    '2xl': 'w-5 h-5'
  }

  return (
    <div className={clsx('relative inline-block', className)}>
      <div
        className={clsx(
          'inline-flex items-center justify-center rounded-full overflow-hidden',
          sizeClasses[size],
          !src && 'bg-neutral-100 text-neutral-600 font-medium'
        )}
      >
        {src ? (
          <img
            src={src}
            alt={alt || 'Avatar'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="select-none">
            {initials || '?'}
          </span>
        )}
      </div>
      
      {status && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-white',
            statusClasses[status],
            statusSizeClasses[size]
          )}
        />
      )}
    </div>
  )
}

export default Avatar