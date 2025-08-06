import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  DevicePhoneMobileIcon,
  UserIcon,
  CpuChipIcon,
  ExclamationCircleIcon,
  CheckIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ConversationMessage, Lead } from '@/types/conversation'

interface ConversationDisplayProps {
  messages: ConversationMessage[]
  isLoading: boolean
  selectedLead: Lead
}

interface MessageBubbleProps {
  message: ConversationMessage
  isOwn: boolean
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isOwn }) => {
  const getSenderInfo = () => {
    switch (message.sentBy) {
      case 'user':
        return { 
          name: 'Customer', 
          icon: UserIcon, 
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 border-blue-200'
        }
      case 'agent':
        return { 
          name: 'AI Agent', 
          icon: CpuChipIcon, 
          color: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200'
        }
      case 'human_agent':
        return { 
          name: 'Human Agent', 
          icon: UserIcon, 
          color: 'text-purple-600',
          bgColor: 'bg-purple-50 border-purple-200'
        }
      case 'system':
        return { 
          name: 'System', 
          icon: ExclamationCircleIcon, 
          color: 'text-neutral-600',
          bgColor: 'bg-neutral-50 border-neutral-200'
        }
      default:
        return { 
          name: 'Unknown', 
          icon: ChatBubbleLeftRightIcon, 
          color: 'text-neutral-600',
          bgColor: 'bg-neutral-50 border-neutral-200'
        }
    }
  }

  const getMessageTypeIcon = () => {
    switch (message.type) {
      case 'voice':
        return PhoneIcon
      case 'text':
        return DevicePhoneMobileIcon
      case 'system':
        return ExclamationCircleIcon
      default:
        return ChatBubbleLeftRightIcon
    }
  }

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sent':
        return CheckIcon
      case 'delivered':
        return CheckIcon
      case 'failed':
        return ExclamationCircleIcon
      case 'sending':
        return ClockIcon
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (message.status) {
      case 'sent':
        return 'text-green-500'
      case 'delivered':
        return 'text-green-600'
      case 'failed':
        return 'text-red-500'
      case 'sending':
        return 'text-yellow-500'
      default:
        return 'text-neutral-400'
    }
  }

  const senderInfo = getSenderInfo()
  const MessageTypeIcon = getMessageTypeIcon()
  const StatusIcon = getStatusIcon()
  const SenderIcon = senderInfo.icon

  // System messages are centered
  if (message.sentBy === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex justify-center my-4"
      >
        <div className="flex items-center space-x-2 px-3 py-2 bg-neutral-100 rounded-full">
          <SenderIcon className="w-4 h-4 text-neutral-500" />
          <span className="text-sm text-neutral-600">{message.content}</span>
          <span className="text-xs text-neutral-400">
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3 max-w-xs lg:max-w-md`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full ${senderInfo.bgColor} border flex items-center justify-center`}>
          <SenderIcon className={`w-4 h-4 ${senderInfo.color}`} />
        </div>
        
        {/* Message Content */}
        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {/* Sender Name & Type */}
          <div className={`flex items-center space-x-2 mb-1 ${isOwn ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
            <span className="text-xs font-medium text-neutral-700">
              {senderInfo.name}
            </span>
            <div className="flex items-center space-x-1">
              <MessageTypeIcon className="w-3 h-3 text-neutral-400" />
              {message.type === 'voice' && message.duration && (
                <span className="text-xs text-neutral-400">
                  {Math.floor(message.duration)}s
                </span>
              )}
            </div>
          </div>
          
          {/* Message Bubble */}
          <div
            className={`
              relative px-4 py-2 rounded-lg shadow-sm border
              ${isOwn 
                ? 'bg-primary-500 text-white border-primary-600' 
                : `${senderInfo.bgColor} ${senderInfo.color} border-opacity-50`
              }
            `}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            
            {/* Confidence Score for Voice Messages */}
            {message.type === 'voice' && message.confidence && (
              <div className="mt-2 pt-2 border-t border-opacity-20 border-current">
                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-75">
                    Confidence: {Math.round(message.confidence * 100)}%
                  </span>
                </div>
              </div>
            )}
            
            {/* Message Tail */}
            <div
              className={`
                absolute top-2 w-0 h-0 border-solid
                ${isOwn 
                  ? 'right-0 transform translate-x-full border-l-8 border-r-0 border-t-8 border-b-0 border-l-primary-500 border-t-transparent' 
                  : 'left-0 transform -translate-x-full border-r-8 border-l-0 border-t-8 border-b-0 border-r-current border-t-transparent'
                }
              `}
            />
          </div>
          
          {/* Timestamp and Status */}
          <div className={`flex items-center space-x-2 mt-1 ${isOwn ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
            <span className="text-xs text-neutral-400">
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
            
            {/* Status Icon (only for outgoing messages) */}
            {isOwn && StatusIcon && (
              <StatusIcon className={`w-3 h-3 ${getStatusColor()}`} />
            )}
            
            {/* Message Type Badge */}
            {message.type === 'voice' && (
              <Badge variant="neutral" size="sm" className="text-xs">
                Voice
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const ConversationDisplay: React.FC<ConversationDisplayProps> = ({
  messages,
  isLoading,
  selectedLead
}) => {
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-sm text-neutral-600 mt-4">
            Loading conversation history...
          </p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <ChatBubbleLeftRightIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            Start a Conversation
          </h3>
          <p className="text-neutral-600 mb-4">
            No messages yet with {selectedLead.customerName}
          </p>
          <div className="space-y-2 text-sm text-neutral-500">
            <p>• Click "Start Call" to initiate a voice conversation</p>
            <p>• Click "SMS" to send a text message</p>
            <p>• Toggle to "Manual" to take control from AI</p>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.sentBy === 'human_agent'}
          />
        ))}
      </AnimatePresence>
      
      {/* Loading indicator for new messages */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center py-2"
        >
          <div className="flex items-center space-x-2 text-sm text-neutral-500">
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default ConversationDisplay