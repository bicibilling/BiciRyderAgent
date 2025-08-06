import React from 'react'
import { motion } from 'framer-motion'
import { 
  PhoneIcon,
  DevicePhoneMobileIcon,
  UserIcon,
  CpuChipIcon,
  WifiIcon,
  ExclamationTriangleIcon,
  SignalIcon
} from '@heroicons/react/24/outline'
import Badge from '@/components/ui/Badge'
import { ConnectionStatus, CurrentMode } from '@/types/conversation'

interface StatusIndicatorProps {
  status: ConnectionStatus
  mode: CurrentMode
  isCallActive: boolean
  isUnderHumanControl: boolean
  humanControlAgent?: string | null
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  mode,
  isCallActive,
  isUnderHumanControl,
  humanControlAgent
}) => {
  const getConnectionBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="success" size="sm" className="flex items-center space-x-1">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <SignalIcon className="w-3 h-3" />
            </motion.div>
            <span>Live</span>
          </Badge>
        )
      case 'connecting':
        return (
          <Badge variant="warning" size="sm" className="flex items-center space-x-1">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <WifiIcon className="w-3 h-3" />
            </motion.div>
            <span>Connecting</span>
          </Badge>
        )
      case 'disconnected':
        return (
          <Badge variant="neutral" size="sm" className="flex items-center space-x-1">
            <WifiIcon className="w-3 h-3 opacity-50" />
            <span>Offline</span>
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="danger" size="sm" className="flex items-center space-x-1">
            <ExclamationTriangleIcon className="w-3 h-3" />
            <span>Error</span>
          </Badge>
        )
      default:
        return null
    }
  }

  const getModeBadge = () => {
    if (isCallActive) {
      return (
        <Badge variant="primary" size="sm" className="flex items-center space-x-1">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <PhoneIcon className="w-3 h-3" />
          </motion.div>
          <span>On Call</span>
        </Badge>
      )
    }

    if (mode === 'sms') {
      return (
        <Badge variant="secondary" size="sm" className="flex items-center space-x-1">
          <DevicePhoneMobileIcon className="w-3 h-3" />
          <span>SMS Mode</span>
        </Badge>
      )
    }

    return null
  }

  const getControlBadge = () => {
    if (isUnderHumanControl) {
      return (
        <Badge variant="warning" size="sm" className="flex items-center space-x-1">
          <UserIcon className="w-3 h-3" />
          <span>Human Control</span>
          {humanControlAgent && (
            <span className="text-xs font-normal">
              ({humanControlAgent})
            </span>
          )}
        </Badge>
      )
    } else if (status === 'connected') {
      return (
        <Badge variant="success" size="sm" className="flex items-center space-x-1">
          <CpuChipIcon className="w-3 h-3" />
          <span>AI Active</span>
        </Badge>
      )
    }

    return null
  }

  const badges = [getConnectionBadge(), getModeBadge(), getControlBadge()].filter(Boolean)

  if (badges.length === 0) {
    return null
  }

  return (
    <div className="flex items-center space-x-2">
      {badges.map((badge, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: index * 0.1 }}
        >
          {badge}
        </motion.div>
      ))}
    </div>
  )
}

export default StatusIndicator