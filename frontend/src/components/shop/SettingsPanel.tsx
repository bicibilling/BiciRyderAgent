import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  CogIcon,
  BellIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  ClockIcon,
  UserIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'

interface SettingsPanelProps {
  autoResponse: boolean
  onAutoResponseChange: (value: boolean) => void
  enableVoiceControls: boolean
  showAdvancedFeatures: boolean
  organizationId: string
}

interface SettingItemProps {
  title: string
  description: string
  icon: React.ComponentType<any>
  children: React.ReactNode
  category?: string
}

const SettingItem: React.FC<SettingItemProps> = ({ title, description, icon: Icon, children, category }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center justify-between p-4 bg-white rounded-lg border border-neutral-200 hover:shadow-sm transition-all"
  >
    <div className="flex items-center space-x-4">
      <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary-600" />
      </div>
      <div>
        <div className="flex items-center space-x-2">
          <h5 className="font-medium text-neutral-900">{title}</h5>
          {category && (
            <Badge variant="neutral" size="sm">{category}</Badge>
          )}
        </div>
        <p className="text-sm text-neutral-600">{description}</p>
      </div>
    </div>
    <div className="flex-shrink-0">
      {children}
    </div>
  </motion.div>
)

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoResponse,
  onAutoResponseChange,
  enableVoiceControls,
  showAdvancedFeatures,
  organizationId
}) => {
  // Local settings state
  const [settings, setSettings] = useState({
    notifications: {
      newMessages: true,
      callAlerts: true,
      systemUpdates: false,
      emailDigest: true
    },
    voice: {
      autoMute: false,
      noiseReduction: true,
      echoSuppression: true,
      volume: 80
    },
    conversation: {
      showTimestamps: true,
      showReadReceipts: true,
      saveTranscripts: true,
      autoScroll: true
    },
    privacy: {
      dataRetention: '30',
      anonymizeData: false,
      shareAnalytics: true,
      auditLogs: true
    },
    interface: {
      theme: 'light',
      compactView: false,
      showTooltips: true,
      animations: true
    }
  })

  const [isLoading, setIsLoading] = useState(false)

  const handleSettingChange = (category: keyof typeof settings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }))
  }

  const handleSaveSettings = async () => {
    try {
      setIsLoading(true)
      // In production, this would save to API
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Settings saved successfully')
    } catch (error) {
      toast.error('Failed to save settings')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
      // Reset to defaults
      setSettings({
        notifications: {
          newMessages: true,
          callAlerts: true,
          systemUpdates: false,
          emailDigest: true
        },
        voice: {
          autoMute: false,
          noiseReduction: true,
          echoSuppression: true,
          volume: 80
        },
        conversation: {
          showTimestamps: true,
          showReadReceipts: true,
          saveTranscripts: true,
          autoScroll: true
        },
        privacy: {
          dataRetention: '30',
          anonymizeData: false,
          shareAnalytics: true,
          auditLogs: true
        },
        interface: {
          theme: 'light',
          compactView: false,
          showTooltips: true,
          animations: true
        }
      })
      toast.success('Settings reset to defaults')
    }
  }

  const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? 'bg-primary-500' : 'bg-neutral-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  )

  const Slider = ({ value, onChange, min = 0, max = 100, disabled = false }: { 
    value: number; 
    onChange: (value: number) => void; 
    min?: number; 
    max?: number; 
    disabled?: boolean 
  }) => (
    <div className="flex items-center space-x-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-24 accent-primary-500 disabled:opacity-50"
      />
      <span className="text-sm text-neutral-600 w-8">{value}%</span>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-neutral-900">Conversation Settings</h3>
          <p className="text-neutral-600 mt-1">Customize your telephony interface experience</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetSettings}
            disabled={isLoading}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            loading={isLoading}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Communication Settings */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Communication</h4>
        </Card.Header>
        <Card.Body className="space-y-4">
          <SettingItem
            title="Auto Response Messages"
            description="Send automatic greeting and handoff messages"
            icon={ChatBubbleLeftRightIcon}
            category="Core"
          >
            <Toggle
              checked={autoResponse}
              onChange={onAutoResponseChange}
            />
          </SettingItem>

          <SettingItem
            title="Show Message Timestamps"
            description="Display time for each message in conversation"
            icon={ClockIcon}
          >
            <Toggle
              checked={settings.conversation.showTimestamps}
              onChange={(value) => handleSettingChange('conversation', 'showTimestamps', value)}
            />
          </SettingItem>

          <SettingItem
            title="Auto Scroll to Bottom"
            description="Automatically scroll to new messages"
            icon={ChatBubbleLeftRightIcon}
          >
            <Toggle
              checked={settings.conversation.autoScroll}
              onChange={(value) => handleSettingChange('conversation', 'autoScroll', value)}
            />
          </SettingItem>

          <SettingItem
            title="Save Conversation Transcripts"
            description="Keep records of all conversations for review"
            icon={UserIcon}
          >
            <Toggle
              checked={settings.conversation.saveTranscripts}
              onChange={(value) => handleSettingChange('conversation', 'saveTranscripts', value)}
            />
          </SettingItem>
        </Card.Body>
      </Card>

      {/* Voice & Audio Settings */}
      {enableVoiceControls && (
        <Card>
          <Card.Header>
            <h4 className="text-lg font-semibold text-neutral-900">Voice & Audio</h4>
          </Card.Header>
          <Card.Body className="space-y-4">
            <SettingItem
              title="Auto Mute on Join"
              description="Automatically mute microphone when joining calls"
              icon={MicrophoneIcon}
            >
              <Toggle
                checked={settings.voice.autoMute}
                onChange={(value) => handleSettingChange('voice', 'autoMute', value)}
              />
            </SettingItem>

            <SettingItem
              title="Noise Reduction"
              description="Reduce background noise during calls"
              icon={MicrophoneIcon}
            >
              <Toggle
                checked={settings.voice.noiseReduction}
                onChange={(value) => handleSettingChange('voice', 'noiseReduction', value)}
              />
            </SettingItem>

            <SettingItem
              title="Echo Suppression"
              description="Prevent audio echo and feedback"
              icon={SpeakerWaveIcon}
            >
              <Toggle
                checked={settings.voice.echoSuppression}
                onChange={(value) => handleSettingChange('voice', 'echoSuppression', value)}
              />
            </SettingItem>

            <SettingItem
              title="Default Volume Level"
              description="Set the default speaker volume for calls"
              icon={SpeakerWaveIcon}
            >
              <Slider
                value={settings.voice.volume}
                onChange={(value) => handleSettingChange('voice', 'volume', value)}
              />
            </SettingItem>
          </Card.Body>
        </Card>
      )}

      {/* Notification Settings */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Notifications</h4>
        </Card.Header>
        <Card.Body className="space-y-4">
          <SettingItem
            title="New Message Alerts"
            description="Get notified when new messages arrive"
            icon={BellIcon}
          >
            <Toggle
              checked={settings.notifications.newMessages}
              onChange={(value) => handleSettingChange('notifications', 'newMessages', value)}
            />
          </SettingItem>

          <SettingItem
            title="Incoming Call Alerts"
            description="Audio alerts for incoming voice calls"
            icon={BellIcon}
          >
            <Toggle
              checked={settings.notifications.callAlerts}
              onChange={(value) => handleSettingChange('notifications', 'callAlerts', value)}
            />
          </SettingItem>

          <SettingItem
            title="System Updates"
            description="Notifications about system status changes"
            icon={BellIcon}
          >
            <Toggle
              checked={settings.notifications.systemUpdates}
              onChange={(value) => handleSettingChange('notifications', 'systemUpdates', value)}
            />
          </SettingItem>

          <SettingItem
            title="Daily Email Digest"
            description="Receive daily summary of conversation activity"
            icon={BellIcon}
          >
            <Toggle
              checked={settings.notifications.emailDigest}
              onChange={(value) => handleSettingChange('notifications', 'emailDigest', value)}
            />
          </SettingItem>
        </Card.Body>
      </Card>

      {/* Privacy & Security */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Privacy & Security</h4>
        </Card.Header>
        <Card.Body className="space-y-4">
          <SettingItem
            title="Data Retention"
            description="How long to keep conversation data"
            icon={ShieldCheckIcon}
          >
            <select
              value={settings.privacy.dataRetention}
              onChange={(e) => handleSettingChange('privacy', 'dataRetention', e.target.value)}
              className="rounded-lg border-neutral-300 focus:border-primary-500 focus:ring-primary-500 text-sm"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </SettingItem>

          <SettingItem
            title="Anonymize Customer Data"
            description="Remove personally identifiable information from analytics"
            icon={ShieldCheckIcon}
            category="GDPR"
          >
            <Toggle
              checked={settings.privacy.anonymizeData}
              onChange={(value) => handleSettingChange('privacy', 'anonymizeData', value)}
            />
          </SettingItem>

          <SettingItem
            title="Share Usage Analytics"
            description="Help improve the service by sharing anonymous usage data"
            icon={ShieldCheckIcon}
          >
            <Toggle
              checked={settings.privacy.shareAnalytics}
              onChange={(value) => handleSettingChange('privacy', 'shareAnalytics', value)}
            />
          </SettingItem>

          <SettingItem
            title="Audit Logging"
            description="Keep detailed logs of all system access and changes"
            icon={ShieldCheckIcon}
            category="Security"
          >
            <Toggle
              checked={settings.privacy.auditLogs}
              onChange={(value) => handleSettingChange('privacy', 'auditLogs', value)}
            />
          </SettingItem>
        </Card.Body>
      </Card>

      {/* Interface Settings */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Interface</h4>
        </Card.Header>
        <Card.Body className="space-y-4">
          <SettingItem
            title="Theme"
            description="Choose your preferred color scheme"
            icon={CogIcon}
          >
            <select
              value={settings.interface.theme}
              onChange={(e) => handleSettingChange('interface', 'theme', e.target.value)}
              className="rounded-lg border-neutral-300 focus:border-primary-500 focus:ring-primary-500 text-sm"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </SettingItem>

          <SettingItem
            title="Compact View"
            description="Use a more condensed layout to fit more information"
            icon={CogIcon}
          >
            <Toggle
              checked={settings.interface.compactView}
              onChange={(value) => handleSettingChange('interface', 'compactView', value)}
            />
          </SettingItem>

          <SettingItem
            title="Show Tooltips"
            description="Display helpful tooltips on hover"
            icon={CogIcon}
          >
            <Toggle
              checked={settings.interface.showTooltips}
              onChange={(value) => handleSettingChange('interface', 'showTooltips', value)}
            />
          </SettingItem>

          <SettingItem
            title="Enable Animations"
            description="Use smooth transitions and animations"
            icon={CogIcon}
          >
            <Toggle
              checked={settings.interface.animations}
              onChange={(value) => handleSettingChange('interface', 'animations', value)}
            />
          </SettingItem>
        </Card.Body>
      </Card>

      {/* Advanced Features (if enabled) */}
      {showAdvancedFeatures && (
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-neutral-900">Advanced Features</h4>
              <Badge variant="primary">Pro</Badge>
            </div>
          </Card.Header>
          <Card.Body className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <CheckIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h5 className="font-medium text-primary-900">Advanced Analytics Enabled</h5>
                  <p className="text-sm text-primary-700">Access to detailed conversation insights and AI analysis</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <CheckIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h5 className="font-medium text-green-900">Voice Controls Active</h5>
                  <p className="text-sm text-green-700">Full voice call management and audio controls</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <CheckIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h5 className="font-medium text-purple-900">Enhanced UI Features</h5>
                  <p className="text-sm text-purple-700">Advanced interface customization and professional tools</p>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Organization Info */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Organization</h4>
        </Card.Header>
        <Card.Body>
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-neutral-900">Organization ID</h5>
              <p className="text-sm text-neutral-600 font-mono">{organizationId}</p>
            </div>
            <Badge variant="success" className="flex items-center space-x-1">
              <ShieldCheckIcon className="w-3 h-3" />
              <span>Secured</span>
            </Badge>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

export default SettingsPanel