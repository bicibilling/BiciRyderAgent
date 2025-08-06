import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Cog6ToothIcon,
  UserIcon,
  BellIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  PhoneIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  ClockIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import axios from 'axios'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  timezone: z.string().optional()
})

const notificationSchema = z.object({
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  callAlerts: z.boolean(),
  dailyReports: z.boolean(),
  weeklyReports: z.boolean()
})

const aiSettingsSchema = z.object({
  voiceId: z.string(),
  voiceSpeed: z.number().min(0.5).max(2.0),
  voiceStability: z.number().min(0.0).max(1.0),
  language: z.string(),
  escalationThreshold: z.number().min(1).max(10),
  maxCallDuration: z.number().min(300).max(3600)
})

type ProfileFormData = z.infer<typeof profileSchema>
type NotificationFormData = z.infer<typeof notificationSchema>
type AISettingsFormData = z.infer<typeof aiSettingsSchema>

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const SettingsPage: React.FC = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<any>(null)

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: '',
      timezone: 'America/Toronto'
    }
  })

  const notificationForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      emailNotifications: true,
      pushNotifications: true,
      smsNotifications: false,
      callAlerts: true,
      dailyReports: true,
      weeklyReports: true
    }
  })

  const aiSettingsForm = useForm<AISettingsFormData>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: {
      voiceId: 'default',
      voiceSpeed: 1.0,
      voiceStability: 0.75,
      language: 'en',
      escalationThreshold: 3,
      maxCallDuration: 1800
    }
  })

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'ai', name: 'AI Settings', icon: MicrophoneIcon },
    { id: 'organization', name: 'Organization', icon: BuildingOfficeIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon }
  ]

  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get(`${API_BASE_URL}/api/settings`)
      const data = response.data.data
      setSettings(data)
      
      // Update form defaults
      profileForm.reset({
        name: data.profile?.name || user?.name || '',
        email: data.profile?.email || user?.email || '',
        phone: data.profile?.phone || '',
        timezone: data.profile?.timezone || 'America/Toronto'
      })
      
      notificationForm.reset(data.notifications || {
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        callAlerts: true,
        dailyReports: true,
        weeklyReports: true
      })
      
      aiSettingsForm.reset(data.aiSettings || {
        voiceId: 'default',
        voiceSpeed: 1.0,
        voiceStability: 0.75,
        language: 'en',
        escalationThreshold: 3,
        maxCallDuration: 1800
      })
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const onSaveProfile = async (data: ProfileFormData) => {
    try {
      await axios.put(`${API_BASE_URL}/api/settings/profile`, data)
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
    }
  }

  const onSaveNotifications = async (data: NotificationFormData) => {
    try {
      await axios.put(`${API_BASE_URL}/api/settings/notifications`, data)
      toast.success('Notification settings updated')
    } catch (error) {
      toast.error('Failed to update notification settings')
    }
  }

  const onSaveAISettings = async (data: AISettingsFormData) => {
    try {
      await axios.put(`${API_BASE_URL}/api/settings/ai`, data)
      toast.success('AI settings updated successfully')
    } catch (error) {
      toast.error('Failed to update AI settings')
    }
  }

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-neutral-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-600 mt-1">
          Manage your account, notifications, and system preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card padding="none">
            <div className="p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
                      activeTab === tab.id
                        ? 'bg-primary-50 text-primary-700 border border-primary-200'
                        : 'text-neutral-700 hover:bg-neutral-50'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium">{tab.name}</span>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Profile Settings */}
            {activeTab === 'profile' && (
              <Card>
                <Card.Header>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Profile Information
                  </h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Update your personal information and preferences
                  </p>
                </Card.Header>
                <Card.Body>
                  <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        {...profileForm.register('name')}
                        label="Full Name"
                        placeholder="Enter your full name"
                        error={profileForm.formState.errors.name?.message}
                      />
                      <Input
                        {...profileForm.register('email')}
                        type="email"
                        label="Email Address"
                        placeholder="Enter your email"
                        error={profileForm.formState.errors.email?.message}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        {...profileForm.register('phone')}
                        type="tel"
                        label="Phone Number"
                        placeholder="Enter your phone number"
                        error={profileForm.formState.errors.phone?.message}
                      />
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Timezone
                        </label>
                        <select
                          {...profileForm.register('timezone')}
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        >
                          <option value="America/Toronto">Eastern Time (Toronto)</option>
                          <option value="America/Vancouver">Pacific Time (Vancouver)</option>
                          <option value="America/Denver">Mountain Time (Denver)</option>
                          <option value="America/Chicago">Central Time (Chicago)</option>
                          <option value="Europe/London">GMT (London)</option>
                          <option value="Europe/Paris">CET (Paris)</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={profileForm.formState.isSubmitting}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </Card.Body>
              </Card>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <Card>
                <Card.Header>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Notification Preferences
                  </h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Choose how you want to be notified about important events
                  </p>
                </Card.Header>
                <Card.Body>
                  <form onSubmit={notificationForm.handleSubmit(onSaveNotifications)} className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-md font-medium text-neutral-900">
                        Communication Channels
                      </h3>
                      
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('emailNotifications')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">Email notifications</span>
                        </label>
                        
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('pushNotifications')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">Push notifications</span>
                        </label>
                        
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('smsNotifications')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">SMS notifications</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-md font-medium text-neutral-900">
                        Alert Types
                      </h3>
                      
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('callAlerts')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">Incoming call alerts</span>
                        </label>
                        
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('dailyReports')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">Daily summary reports</span>
                        </label>
                        
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            {...notificationForm.register('weeklyReports')}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-neutral-700">Weekly analytics reports</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={notificationForm.formState.isSubmitting}
                      >
                        Save Preferences
                      </Button>
                    </div>
                  </form>
                </Card.Body>
              </Card>
            )}

            {/* AI Settings */}
            {activeTab === 'ai' && (
              <Card>
                <Card.Header>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    AI Voice Agent Settings
                  </h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Configure AI voice characteristics and behavior
                  </p>
                </Card.Header>
                <Card.Body>
                  <form onSubmit={aiSettingsForm.handleSubmit(onSaveAISettings)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Voice Model
                        </label>
                        <select
                          {...aiSettingsForm.register('voiceId')}
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        >
                          <option value="default">Default (Professional)</option>
                          <option value="friendly">Friendly</option>
                          <option value="authoritative">Authoritative</option>
                          <option value="casual">Casual</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Language
                        </label>
                        <select
                          {...aiSettingsForm.register('language')}
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        >
                          <option value="en">English</option>
                          <option value="fr">French</option>
                          <option value="es">Spanish</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-3">
                          Voice Speed: {aiSettingsForm.watch('voiceSpeed').toFixed(1)}x
                        </label>
                        <input
                          type="range"
                          {...aiSettingsForm.register('voiceSpeed', { valueAsNumber: true })}
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <div className="flex justify-between text-xs text-neutral-500 mt-1">
                          <span>Slow</span>
                          <span>Normal</span>
                          <span>Fast</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-3">
                          Voice Stability: {(aiSettingsForm.watch('voiceStability') * 100).toFixed(0)}%
                        </label>
                        <input
                          type="range"
                          {...aiSettingsForm.register('voiceStability', { valueAsNumber: true })}
                          min="0"
                          max="1"
                          step="0.05"
                          className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <div className="flex justify-between text-xs text-neutral-500 mt-1">
                          <span>Variable</span>
                          <span>Balanced</span>
                          <span>Stable</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Escalation Threshold (1-10)
                        </label>
                        <input
                          type="number"
                          {...aiSettingsForm.register('escalationThreshold', { valueAsNumber: true })}
                          min="1"
                          max="10"
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Lower values = more likely to escalate to human
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Max Call Duration (seconds)
                        </label>
                        <input
                          type="number"
                          {...aiSettingsForm.register('maxCallDuration', { valueAsNumber: true })}
                          min="300"
                          max="3600"
                          step="60"
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Maximum duration before automatic escalation
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={aiSettingsForm.formState.isSubmitting}
                      >
                        Save AI Settings
                      </Button>
                    </div>
                  </form>
                </Card.Body>
              </Card>
            )}

            {/* Organization Settings */}
            {activeTab === 'organization' && (
              <Card>
                <Card.Header>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Organization Information
                  </h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    View and manage organization details
                  </p>
                </Card.Header>
                <Card.Body>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Organization ID
                      </label>
                      <Input
                        value={user?.organizationId || 'N/A'}
                        disabled
                        helperText="This is your unique organization identifier"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Role
                      </label>
                      <div className="flex items-center space-x-2">
                        <Badge variant="primary" size="md">
                          {user?.role || 'User'}
                        </Badge>
                        <span className="text-sm text-neutral-600">
                          Your current role in the organization
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Permissions
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {user?.permissions?.map((permission) => (
                          <Badge key={permission} variant="secondary" size="sm">
                            {permission}
                          </Badge>
                        )) || (
                          <span className="text-sm text-neutral-500">No specific permissions</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}

            {/* Security Settings */}
            {activeTab === 'security' && (
              <Card>
                <Card.Header>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Security & Privacy
                  </h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Manage your account security settings
                  </p>
                </Card.Header>
                <Card.Body>
                  <div className="space-y-6">
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <h3 className="text-md font-medium text-neutral-900 mb-2">
                        Password Security
                      </h3>
                      <p className="text-sm text-neutral-600 mb-3">
                        Change your password to keep your account secure
                      </p>
                      <Button variant="secondary" size="sm">
                        Change Password
                      </Button>
                    </div>
                    
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <h3 className="text-md font-medium text-neutral-900 mb-2">
                        Two-Factor Authentication
                      </h3>
                      <p className="text-sm text-neutral-600 mb-3">
                        Add an extra layer of security to your account
                      </p>
                      <Button variant="secondary" size="sm">
                        Enable 2FA
                      </Button>
                    </div>
                    
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <h3 className="text-md font-medium text-neutral-900 mb-2">
                        Session Management
                      </h3>
                      <p className="text-sm text-neutral-600 mb-3">
                        View and manage your active sessions
                      </p>
                      <Button variant="secondary" size="sm">
                        View Sessions
                      </Button>
                    </div>
                    
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="text-md font-medium text-red-900 mb-2">
                        Danger Zone
                      </h3>
                      <p className="text-sm text-red-700 mb-3">
                        Permanently delete your account and all associated data
                      </p>
                      <Button variant="danger" size="sm">
                        Delete Account
                      </Button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage