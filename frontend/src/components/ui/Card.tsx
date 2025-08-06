import React from 'react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

interface CardBodyProps {
  children: React.ReactNode
  className?: string
}

interface CardFooterProps {
  children: React.ReactNode
  className?: string
}

const Card: React.FC<CardProps> & {
  Header: React.FC<CardHeaderProps>
  Body: React.FC<CardBodyProps>
  Footer: React.FC<CardFooterProps>
} = ({ children, className, hover = false, padding = 'md' }) => {
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={hover ? { y: -2, shadow: '0 10px 40px -15px rgba(0, 0, 0, 0.3)' } : undefined}
      className={clsx(
        'bg-white rounded-xl shadow-soft border border-neutral-200',
        padding !== 'none' && paddingClasses[padding],
        hover && 'transition-all duration-200 cursor-pointer',
        className
      )}
    >
      {children}
    </motion.div>
  )
}

const CardHeader: React.FC<CardHeaderProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4 border-b border-neutral-200', className)}>
    {children}
  </div>
)

const CardBody: React.FC<CardBodyProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4', className)}>
    {children}
  </div>
)

const CardFooter: React.FC<CardFooterProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4 border-t border-neutral-200', className)}>
    {children}
  </div>
)

Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter

export default Card