import React, { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  EnvelopeIcon, 
  LockClosedIcon, 
  BuildingOfficeIcon,
  PhoneIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import toast from 'react-hot-toast'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationId: z.string().optional()
})

type LoginFormData = z.infer<typeof loginSchema>

const LoginPage: React.FC = () => {
  const { isAuthenticated, login, isLoading } = useAuth()
  const location = useLocation()
  const [loginError, setLoginError] = useState<string>('')

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      organizationId: ''
    }
  })

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  const onSubmit = async (data: LoginFormData) => {
    try {
      setLoginError('')
      await login(data.email, data.password, data.organizationId)
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Login failed'
      setLoginError(errorMessage)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center shadow-lg">
              <PhoneIcon className="w-8 h-8 text-white" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-gradient mb-2">
            BICI AI Voice Agent
          </h1>
          <p className="text-neutral-600">
            Sign in to your dashboard to monitor and manage AI voice conversations
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <Card.Body>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <Input
                    {...register('email')}
                    type="email"
                    label="Email Address"
                    placeholder="Enter your email"
                    icon={<EnvelopeIcon />}
                    error={errors.email?.message}
                    autoComplete="email"
                  />
                </div>

                <div>
                  <Input
                    {...register('password')}
                    type="password"
                    label="Password"
                    placeholder="Enter your password"
                    icon={<LockClosedIcon />}
                    error={errors.password?.message}
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <Input
                    {...register('organizationId')}
                    type="text"
                    label="Organization ID (Optional)"
                    placeholder="Enter organization ID"
                    icon={<BuildingOfficeIcon />}
                    error={errors.organizationId?.message}
                    helperText="Leave blank if you're unsure"
                  />
                </div>

                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-secondary-50 border border-secondary-200 rounded-lg p-3 flex items-center space-x-2"
                  >
                    <ExclamationTriangleIcon className="w-5 h-5 text-secondary-500 flex-shrink-0" />
                    <p className="text-sm text-secondary-700">{loginError}</p>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isSubmitting || isLoading}
                >
                  {isSubmitting || isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </Card.Body>
          </Card>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-neutral-600">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full"></div>
              <span>Real-time Monitoring</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
              <span>Human Takeover</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-secondary-500 rounded-full"></div>
              <span>Analytics & Reports</span>
            </div>
          </div>
          
          <p className="text-xs text-neutral-500">
            Secure dashboard for BICI AI Voice Agent system
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default LoginPage