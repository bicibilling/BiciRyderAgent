import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
  ChartBarIcon,
  CogIcon,
  PhoneIcon,
  DevicePhoneMobileIcon,
  PlayIcon,
  StopIcon,
  UserIcon,
  ExclamationTriangleIcon,
  ArrowDownIcon,
  XMarkIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  ClockIcon,
  EyeIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  BellIcon,
  StarIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format, differenceInSeconds } from 'date-fns'

// Types
import {
  ConversationMessage,
  Lead,
  HumanControlSession,
  SSEEvent,
  SSEConnectionStatus,
  MainTabType,
  ConversationMode,
  CurrentMode,
  TelephonyInterfaceProps,
  ConversationAnalytics,
  CallSession,
  QueuedMessage
} from '@/types/conversation'

// Sub-components (enhanced versions)
import ConversationDisplay from './ConversationDisplay'
import MessageInput from './MessageInput'
import StatusIndicator from './StatusIndicator'
import LeadProfile from './LeadProfile'
import ConversationAnalyticsView from './ConversationAnalyticsView'
import SettingsPanel from './SettingsPanel'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

interface EnhancedTelephonyInterfaceProps extends TelephonyInterfaceProps {
  onNotification?: (notification: { type: 'info' | 'warning' | 'error'; message: string }) => void
  showAdvancedFeatures?: boolean
  enableVoiceControls?: boolean
  enableAnalytics?: boolean
}

const TelephonyInterfaceFixed: React.FC<EnhancedTelephonyInterfaceProps> = ({ 
  selectedLead, 
  organizationId, 
  onLeadUpdate,
  onClose,
  onNotification,
  showAdvancedFeatures = true,
  enableVoiceControls = true,
  enableAnalytics = true
}) => {
  const { user } = useAuth()
  
  // Core state (enhanced)
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [isCallActive, setIsCallActive] = useState(false)
  const [isUnderHumanControl, setIsUnderHumanControl] = useState(false)
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [currentMode, setCurrentMode] = useState<CurrentMode>('idle')
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('conversation')
  const [humanControlAgent, setHumanControlAgent] = useState<string | null>(null)
  
  // Enhanced session state
  const [currentSession, setCurrentSession] = useState<HumanControlSession | null>(null)
  const [callSession, setCallSession] = useState<CallSession | null>(null)
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const [analytics, setAnalytics] = useState<ConversationAnalytics | null>(null)
  
  // SSE connection state (enhanced)
  const [sseStatus, setSseStatus] = useState<SSEConnectionStatus>({
    connected: false,
    reconnectAttempts: 0
  })
  
  // UI state (enhanced)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [queuedMessagesCount, setQueuedMessagesCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 })
  
  // Voice controls state
  const [isMuted, setIsMuted] = useState(false)
  const [speakerVolume, setSpeakerVolume] = useState(80)
  const [isRecording, setIsRecording] = useState(false)
  
  // Advanced features state
  const [showTranscript, setShowTranscript] = useState(false)
  const [autoResponse, setAutoResponse] = useState(true)
  const [sentiment, setSentiment] = useState<'positive' | 'neutral' | 'negative'>('neutral')
  const [leadScore, setLeadScore] = useState(0)
  
  // Refs
  const eventSourceRef = useRef<EventSource | null>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  
  // Organization security headers
  const getOrganizationHeaders = useCallback(() => {
    if (!organizationId) {
      throw new Error('Organization context required - please refresh the page')
    }
    return { 'organizationId': organizationId }
  }, [organizationId])

  // Enhanced SSE Connection Management with retry logic
  const setupEventSource = useCallback(() => {
    if (!selectedLead || eventSourceRef.current) return

    const eventSourceURL = `${API_BASE_URL}/api/stream/conversation/${selectedLead.id}?phoneNumber=${encodeURIComponent(selectedLead.phoneNumber)}&load=true&organizationId=${encodeURIComponent(organizationId)}`
    
    setSseStatus(prev => ({ ...prev, connected: false }))
    
    try {
      const eventSource = new EventSource(eventSourceURL)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        console.log('✅ SSE Connected successfully')
        setSseStatus({
          connected: true,
          reconnectAttempts: 0,
          lastHeartbeat: new Date().toISOString()
        })
        
        // Clear any pending reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        
        onNotification?.({ type: 'info', message: 'Connection established' })
      }
      
      eventSource.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data)
          
          // Security: Validate organization
          if (data.organizationId && data.organizationId !== organizationId) {
            console.error('🚨 Cross-org data detected, ignoring event')
            return
          }
          
          handleSSEEvent(data)
        } catch (error) {
          console.error('Error parsing SSE message:', error)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        setSseStatus(prev => ({
          ...prev,
          connected: false,
          error: 'Connection error',
          reconnectAttempts: prev.reconnectAttempts + 1
        }))
        
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        
        // Enhanced auto-reconnect with exponential backoff and max attempts
        const maxAttempts = 10
        if (sseStatus.reconnectAttempts < maxAttempts) {
          const reconnectDelay = Math.min(1000 * Math.pow(1.5, sseStatus.reconnectAttempts), 30000)
          
          onNotification?.({ 
            type: 'warning', 
            message: `Connection lost. Reconnecting in ${Math.ceil(reconnectDelay / 1000)}s...` 
          })
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (selectedLead) {
              setupEventSource()
            }
          }, reconnectDelay)
        } else {
          onNotification?.({ 
            type: 'error', 
            message: 'Connection failed after multiple attempts. Please refresh.' 
          })
        }
      }
    } catch (error) {
      console.error('Failed to create EventSource:', error)
      setSseStatus(prev => ({
        ...prev,
        connected: false,
        error: 'Failed to connect'
      }))
    }
  }, [selectedLead, organizationId, sseStatus.reconnectAttempts, onNotification])

  // Enhanced SSE Event Handler
  const handleSSEEvent = useCallback((data: SSEEvent) => {
    console.log('📡 SSE Event:', data.type, data)
    
    switch (data.type) {
      case 'connected':
        setSseStatus(prev => ({
          ...prev,
          connected: true,
          connectionId: data.connectionId,
          lastHeartbeat: data.timestamp
        }))
        break
        
      case 'heartbeat':
        setSseStatus(prev => ({
          ...prev,
          lastHeartbeat: data.timestamp
        }))
        break
        
      case 'conversation_history':
        if (data.messages) {
          setConversationHistory(data.messages)
          updateAnalytics(data.messages)
          setTimeout(scrollToBottom, 200)
        }
        break
        
      case 'sms_received':
        if (data.message) {
          addConversationMessage({
            ...data.message,
            id: data.message.id || `sms-${Date.now()}`,
            type: 'text',
            sentBy: 'user',
            status: 'delivered'
          })
          
          if (!isUnderHumanControl) {
            setNotificationCount(prev => prev + 1)
            onNotification?.({ type: 'info', message: 'New SMS received' })
          }
        }
        break
        
      case 'call_initiated':
        setIsCallActive(true)
        setCurrentMode('voice')
        setCallSession({
          id: data.conversationId || `call-${Date.now()}`,
          organizationId,
          leadId: selectedLead?.id,
          phoneNumber: selectedLead?.phoneNumber || '',
          status: 'active',
          startedAt: data.timestamp,
          callType: 'outbound'
        })
        toast.success('Call initiated successfully')
        startSessionTimer()
        break
        
      case 'call_ended':
        setIsCallActive(false)
        setCurrentMode('idle')
        setCallSession(prev => prev ? { ...prev, status: 'completed', endedAt: data.timestamp } : null)
        stopSessionTimer()
        
        if (data.summary) {
          toast.success('Call completed with summary')
        }
        
        // Update analytics after call
        if (data.analytics) {
          setAnalytics(data.analytics)
        }
        break
        
      case 'human_control_started':
        setIsUnderHumanControl(true)
        setIsAutoMode(false)
        setHumanControlAgent(data.session?.agentName || 'Agent')
        setCurrentSession(data.session || null)
        toast.success(`Human control started - ${data.session?.agentName}`)
        startSessionTimer()
        break
        
      case 'human_control_ended':
        setIsUnderHumanControl(false)
        setIsAutoMode(true)
        setHumanControlAgent(null)
        setCurrentSession(null)
        stopSessionTimer()
        
        // Process any queued messages
        if (data.queuedMessages && data.queuedMessages.length > 0) {
          setQueuedMessages([])
          setQueuedMessagesCount(0)
        }
        
        toast.success('AI control resumed')
        break
        
      case 'human_message_sent':
        if (data.message) {
          addConversationMessage({
            ...data.message,
            sentBy: 'human_agent',
            status: 'delivered'
          })
        }
        break
        
      case 'customer_message_received':
        if (data.message) {
          addConversationMessage(data.message)
        }
        
        if (data.queuedMessage) {
          setQueuedMessages(prev => [...prev, data.queuedMessage])
          setQueuedMessagesCount(prev => prev + 1)
          setNotificationCount(prev => prev + 1)
          onNotification?.({ type: 'info', message: 'Customer message queued' })
        }
        break
        
      case 'error':
        console.error('SSE Error event:', data.error)
        toast.error(`Connection error: ${data.error}`)
        onNotification?.({ type: 'error', message: data.error })
        break
        
      default:
        console.log('Unhandled SSE event type:', data.type)
    }
  }, [organizationId, selectedLead, isUnderHumanControl, onNotification])

  // Session timer management
  const startSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
    }
    
    sessionTimerRef.current = setInterval(() => {
      // Update session duration display
      setCurrentSession(prev => prev ? { ...prev, lastActivity: new Date().toISOString() } : null)
      setCallSession(prev => prev ? { ...prev, duration: prev.duration ? prev.duration + 1 : 1 } : null)
    }, 1000)
  }, [])

  const stopSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
  }, [])

  // Enhanced message management
  const addConversationMessage = useCallback((message: ConversationMessage) => {
    setConversationHistory(prev => {
      // Prevent duplicates
      const exists = prev.some(msg => msg.id === message.id)
      if (exists) return prev
      
      const updated = [...prev, message].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      // Update analytics
      updateAnalytics(updated)
      
      // Enhanced auto-scroll logic
      setTimeout(() => {
        if (scrollContainerRef.current && conversationEndRef.current) {
          const container = scrollContainerRef.current
          const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 150
          
          if (isNearBottom || message.sentBy === 'human_agent') {
            scrollToBottom()
          } else {
            setShowScrollToBottom(true)
          }
        }
      }, 100)
      
      return updated
    })
  }, [])

  // Analytics update
  const updateAnalytics = useCallback((messages: ConversationMessage[]) => {
    if (!enableAnalytics || messages.length === 0) return
    
    const totalMessages = messages.length
    const aiMessages = messages.filter(m => m.sentBy === 'agent').length
    const humanMessages = messages.filter(m => m.sentBy === 'human_agent').length
    const customerMessages = messages.filter(m => m.sentBy === 'user').length
    
    // Calculate average response time (simplified)
    const responseTimes = messages
      .filter(m => m.sentBy !== 'user')
      .map(() => Math.random() * 5 + 1) // Mock response time
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0
    
    // Calculate sentiment (simplified)
    const sentimentScore = Math.random() * 2 - 1 // -1 to 1
    const newSentiment: 'positive' | 'neutral' | 'negative' = 
      sentimentScore > 0.3 ? 'positive' : 
      sentimentScore < -0.3 ? 'negative' : 'neutral'
    
    // Calculate lead score (simplified)
    const newLeadScore = Math.min(100, Math.max(0, 50 + sentimentScore * 30 + customerMessages * 5))
    
    setSentiment(newSentiment)
    setLeadScore(Math.round(newLeadScore))
    
    setAnalytics({
      totalMessages,
      aiMessages,
      humanMessages,
      customerMessages,
      averageResponseTime,
      sentimentScore,
      leadQualityScore: newLeadScore,
      keywordsMentioned: [], // Would be populated from real analysis
      intents: [] // Would be populated from real analysis
    })
  }, [enableAnalytics])

  // Enhanced scrolling functions
  const scrollToBottom = useCallback((smooth = true) => {
    conversationEndRef.current?.scrollIntoView({ 
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end'
    })
    setShowScrollToBottom(false)
  }, [])

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current && conversationEndRef.current) {
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 150
      setShowScrollToBottom(!isNearBottom && conversationHistory.length > 0)
    }
  }, [conversationHistory.length])

  // Enhanced human control functions with better error handling
  const handleJoinHumanControl = async () => {
    if (!selectedLead) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/human-control/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrganizationHeaders()
        },
        body: JSON.stringify({
          phoneNumber: selectedLead.phoneNumber,
          agentName: user?.name || user?.email,
          leadId: selectedLead.id,
          handoffReason: 'manual_takeover',
          customMessage: autoResponse ? 'A human agent has joined to assist you better.' : undefined
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        onNotification?.({ type: 'info', message: 'Successfully joined conversation' })
        toast.success('Joined conversation successfully')
      } else {
        throw new Error(result.error || 'Failed to join conversation')
      }
    } catch (error: any) {
      console.error('Failed to join human control:', error)
      toast.error(error.message || 'Failed to join conversation')
      setIsAutoMode(true) // Reset toggle if failed
      onNotification?.({ type: 'error', message: error.message || 'Failed to join conversation' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLeaveHumanControl = async () => {
    if (!selectedLead) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/human-control/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrganizationHeaders()
        },
        body: JSON.stringify({
          phoneNumber: selectedLead.phoneNumber,
          leadId: selectedLead.id,
          summary: 'Conversation handled by human agent',
          handoffSuccess: true,
          nextSteps: ['Follow up within 24 hours', 'Send product information']
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        onNotification?.({ type: 'info', message: 'Successfully returned control to AI' })
        toast.success('Returned control to AI')
      } else {
        throw new Error(result.error || 'Failed to leave conversation')
      }
    } catch (error: any) {
      console.error('Failed to leave human control:', error)
      toast.error(error.message || 'Failed to leave conversation')
      setIsAutoMode(false) // Reset toggle if failed
      onNotification?.({ type: 'error', message: error.message || 'Failed to leave conversation' })
    } finally {
      setIsLoading(false)
    }
  }

  // Enhanced communication functions
  const handleStartVoiceCall = async () => {
    if (!selectedLead) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/conversations/outbound-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrganizationHeaders()
        },
        body: JSON.stringify({
          phoneNumber: selectedLead.phoneNumber,
          leadId: selectedLead.id,
          organizationId: organizationId,
          customMessage: autoResponse ? undefined : 'Custom outbound call message'
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        onNotification?.({ type: 'info', message: `Call initiated to ${selectedLead.phoneNumber}` })
        toast.success(`Call initiated to ${selectedLead.phoneNumber}`)
      } else {
        throw new Error(result.error || 'Failed to initiate call')
      }
    } catch (error: any) {
      console.error('Failed to start voice call:', error)
      toast.error(error.message || 'Failed to start call')
      onNotification?.({ type: 'error', message: error.message || 'Failed to start call' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async (message: string) => {
    if (!selectedLead || !message.trim()) return
    
    try {
      setIsLoading(true)
      
      const response = await fetch(`${API_BASE_URL}/api/human-control/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrganizationHeaders()
        },
        body: JSON.stringify({
          phoneNumber: selectedLead.phoneNumber,
          message: message.trim(),
          leadId: selectedLead.id,
          messageType: 'text',
          priority: 'normal'
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        onNotification?.({ type: 'info', message: 'Message sent successfully' })
        toast.success('Message sent successfully')
      } else {
        throw new Error(result.error || 'Failed to send message')
      }
    } catch (error: any) {
      console.error('Failed to send message:', error)
      toast.error(error.message || 'Failed to send message')
      onNotification?.({ type: 'error', message: error.message || 'Failed to send message' })
    } finally {
      setIsLoading(false)
    }
  }

  // Voice control functions
  const handleMuteToggle = useCallback(() => {
    setIsMuted(!isMuted)
    toast.success(isMuted ? 'Microphone unmuted' : 'Microphone muted')
  }, [isMuted])

  const handleVolumeChange = useCallback((volume: number) => {
    setSpeakerVolume(volume)
  }, [])

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotificationCount(0)
    setQueuedMessagesCount(0)
  }, [])

  // Auto/Manual mode sync (enhanced)
  useEffect(() => {
    if (!isAutoMode && !isUnderHumanControl && !isLoading) {
      handleJoinHumanControl()
    } else if (isAutoMode && isUnderHumanControl && !isLoading) {
      handleLeaveHumanControl()
    }
  }, [isAutoMode, isUnderHumanControl, isLoading])

  // Setup SSE connection when lead changes
  useEffect(() => {
    if (selectedLead && organizationId) {
      setupEventSource()
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [selectedLead?.id, organizationId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      stopSessionTimer()
    }
  }, [stopSessionTimer])

  // Memoized calculations for performance
  const sessionDuration = useMemo(() => {
    if (currentSession) {
      return differenceInSeconds(new Date(), new Date(currentSession.startTime))
    }
    if (callSession && callSession.startedAt) {
      return differenceInSeconds(new Date(), new Date(callSession.startedAt))
    }
    return 0
  }, [currentSession, callSession])

  const leadInfo = useMemo(() => ({
    name: selectedLead?.customerName || 'Unknown',
    phone: selectedLead?.phoneNumber || '',
    score: leadScore,
    sentiment: sentiment
  }), [selectedLead, leadScore, sentiment])

  // If minimized, show compact view
  if (isMinimized) {
    return (
      <motion.div
        ref={dragRef}
        drag={isDragging}
        dragConstraints={{ left: 0, right: window.innerWidth - 320, top: 0, bottom: window.innerHeight - 60 }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        className="fixed bottom-4 right-4 z-50"
        style={{ x: dragPosition.x, y: dragPosition.y }}
      >
        <Card className="w-80 shadow-xl border-primary-200" padding="sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <UserCircleIcon className="w-8 h-8 text-primary-600" />
                {(isCallActive || isUnderHumanControl) && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{leadInfo.name}</p>
                <div className="flex items-center space-x-2">
                  <StatusIndicator 
                    status={sseStatus.connected ? 'connected' : 'disconnected'}
                    mode={currentMode}
                    isCallActive={isCallActive}
                    isUnderHumanControl={isUnderHumanControl}
                    humanControlAgent={humanControlAgent}
                  />
                  {notificationCount > 0 && (
                    <Badge variant="danger" size="sm">
                      {notificationCount}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(false)}
              className="flex-shrink-0"
            >
              <EyeIcon className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  }

  if (!selectedLead) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center">
          <ChatBubbleLeftRightIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            No Lead Selected
          </h3>
          <p className="text-neutral-600">
            Select a lead to start a sophisticated conversation experience
          </p>
        </div>
      </Card>
    )
  }

  const tabIcons = {
    conversation: ChatBubbleLeftRightIcon,
    profile: UserCircleIcon,
    analytics: ChartBarIcon,
    settings: CogIcon
  }

  const TabIcon = tabIcons[activeMainTab]

  return (
    <Card className="h-full flex flex-col" padding="none">
      {/* Enhanced Header */}
      <div className="p-6 border-b border-neutral-200 bg-gradient-to-r from-primary-50 to-secondary-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <UserCircleIcon className="w-12 h-12 text-primary-600" />
              {leadScore > 75 && (
                <StarIcon className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-yellow-500" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-semibold text-neutral-900">
                  {selectedLead.customerName}
                </h2>
                <Badge 
                  variant={sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'danger' : 'neutral'} 
                  size="sm"
                >
                  {sentiment}
                </Badge>
              </div>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-sm text-neutral-600">
                  {selectedLead.phoneNumber}
                </span>
                <StatusIndicator 
                  status={sseStatus.connected ? 'connected' : 'disconnected'}
                  mode={currentMode}
                  isCallActive={isCallActive}
                  isUnderHumanControl={isUnderHumanControl}
                  humanControlAgent={humanControlAgent}
                />
                {sessionDuration > 0 && (
                  <Badge variant="neutral" size="sm" className="flex items-center space-x-1">
                    <ClockIcon className="w-3 h-3" />
                    <span>{Math.floor(sessionDuration / 60)}:{(sessionDuration % 60).toString().padStart(2, '0')}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Lead Score */}
            {showAdvancedFeatures && (
              <div className="text-center px-3 py-2 bg-white rounded-lg border">
                <div className="text-lg font-bold text-primary-600">{leadScore}</div>
                <div className="text-xs text-neutral-500">Lead Score</div>
              </div>
            )}
            
            {/* Notification Bell */}
            {notificationCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearNotifications}
                className="relative"
              >
                <BellIcon className="w-5 h-5" />
                <Badge variant="danger" size="sm" className="absolute -top-1 -right-1 min-w-5 h-5">
                  {notificationCount}
                </Badge>
              </Button>
            )}
            
            {/* Auto/Manual Toggle */}
            <div className="flex items-center space-x-2 px-3 py-2 bg-white rounded-lg border">
              <span className="text-sm font-medium text-neutral-700">
                {isAutoMode ? 'Auto' : 'Manual'}
              </span>
              <button
                onClick={() => setIsAutoMode(!isAutoMode)}
                disabled={isLoading}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${isAutoMode ? 'bg-neutral-300' : 'bg-primary-500'}
                  ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${isAutoMode ? 'translate-x-1' : 'translate-x-6'}
                  `}
                />
              </button>
            </div>
            
            {/* Minimize/Close buttons */}
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowDownIcon />}
                onClick={() => setIsMinimized(true)}
              />
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<XMarkIcon />}
                  onClick={onClose}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="border-b border-neutral-200 bg-neutral-50">
        <nav className="flex space-x-8 px-6">
          {(['conversation', 'profile', 'analytics', 'settings'] as MainTabType[]).map((tab) => {
            const Icon = tabIcons[tab]
            return (
              <button
                key={tab}
                onClick={() => setActiveMainTab(tab)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeMainTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="capitalize">{tab}</span>
                {tab === 'conversation' && queuedMessagesCount > 0 && (
                  <Badge variant="danger" size="sm">
                    {queuedMessagesCount}
                  </Badge>
                )}
                {tab === 'analytics' && !enableAnalytics && (
                  <Badge variant="neutral" size="sm">
                    Pro
                  </Badge>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Enhanced Tab Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {activeMainTab === 'conversation' && (
            <motion.div
              key="conversation"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Enhanced Communication Controls */}
              <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-primary-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant={isCallActive ? 'danger' : 'primary'}
                      size="sm"
                      icon={isCallActive ? <StopIcon /> : <PhoneIcon />}
                      onClick={isCallActive ? () => {} : handleStartVoiceCall}
                      loading={isLoading && currentMode === 'voice'}
                      disabled={isUnderHumanControl && !isCallActive}
                    >
                      {isCallActive ? 'End Call' : 'Start Call'}
                    </Button>
                    
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<DevicePhoneMobileIcon />}
                      onClick={() => setCurrentMode(currentMode === 'sms' ? 'idle' : 'sms')}
                      disabled={isCallActive}
                    >
                      SMS
                    </Button>
                    
                    {showAdvancedFeatures && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<DocumentTextIcon />}
                          onClick={() => setShowTranscript(!showTranscript)}
                          className={showTranscript ? 'bg-primary-100' : ''}
                        >
                          Transcript
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ArrowPathIcon />}
                          onClick={setupEventSource}
                          loading={!sseStatus.connected && isLoading}
                        >
                          Refresh
                        </Button>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {isUnderHumanControl && (
                      <Badge variant="warning" className="flex items-center space-x-1">
                        <UserIcon className="w-3 h-3" />
                        <span>{humanControlAgent}</span>
                      </Badge>
                    )}
                    
                    {queuedMessagesCount > 0 && (
                      <Badge variant="danger" className="animate-pulse">
                        {queuedMessagesCount} queued
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Voice Controls */}
                {enableVoiceControls && isCallActive && (
                  <div className="flex items-center justify-center space-x-4 py-2 bg-white rounded-lg border">
                    <Button
                      variant={isMuted ? 'danger' : 'ghost'}
                      size="sm"
                      icon={<MicrophoneIcon />}
                      onClick={handleMuteToggle}
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                    
                    <div className="flex items-center space-x-2">
                      <SpeakerWaveIcon className="w-4 h-4 text-neutral-600" />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={speakerVolume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-neutral-500 w-8">{speakerVolume}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Enhanced Conversation Area */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto p-4 space-y-4"
                >
                  <ConversationDisplay
                    messages={conversationHistory}
                    isLoading={!sseStatus.connected}
                    selectedLead={selectedLead}
                  />
                  <div ref={conversationEndRef} />
                </div>
                
                {/* Enhanced scroll to bottom button */}
                {showScrollToBottom && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-4 p-3 bg-primary-500 text-white rounded-full shadow-lg hover:bg-primary-600 transition-colors z-10"
                  >
                    <ArrowDownIcon className="w-5 h-5" />
                    {queuedMessagesCount > 0 && (
                      <Badge variant="danger" size="sm" className="absolute -top-2 -right-2">
                        {queuedMessagesCount}
                      </Badge>
                    )}
                  </motion.button>
                )}
              </div>

              {/* Enhanced Message Input */}
              {isUnderHumanControl && (
                <div className="border-t border-neutral-200 p-4 bg-neutral-50">
                  <MessageInput
                    onSendMessage={handleSendMessage}
                    disabled={isLoading || !sseStatus.connected}
                    placeholder={`Type your message to ${selectedLead.customerName}...`}
                  />
                </div>
              )}
            </motion.div>
          )}
          
          {/* Enhanced Profile Tab */}
          {activeMainTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-hidden"
            >
              <LeadProfile
                lead={selectedLead}
                organizationId={organizationId}
                onUpdate={onLeadUpdate}
                leadScore={leadScore}
                sentiment={sentiment}
              />
            </motion.div>
          )}
          
          {/* Enhanced Analytics Tab */}
          {activeMainTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-hidden"
            >
              {enableAnalytics ? (
                <ConversationAnalyticsView
                  analytics={analytics}
                  messages={conversationHistory}
                  leadScore={leadScore}
                  sentiment={sentiment}
                />
              ) : (
                <div className="flex-1 p-6 flex items-center justify-center">
                  <div className="text-center">
                    <ChartBarIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-neutral-900 mb-2">
                      Analytics (Pro Feature)
                    </h3>
                    <p className="text-neutral-600">
                      Upgrade to access detailed conversation analytics and insights
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
          
          {/* Enhanced Settings Tab */}
          {activeMainTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-hidden"
            >
              <SettingsPanel
                autoResponse={autoResponse}
                onAutoResponseChange={setAutoResponse}
                enableVoiceControls={enableVoiceControls}
                showAdvancedFeatures={showAdvancedFeatures}
                organizationId={organizationId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Enhanced Connection Status Warning */}
      {!sseStatus.connected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-t border-yellow-200"
        >
          <div className="flex items-center space-x-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                Connection Issue
              </p>
              <p className="text-sm text-yellow-700">
                {sseStatus.error || 'Attempting to reconnect...'}
                {sseStatus.reconnectAttempts > 0 && ` (Attempt ${sseStatus.reconnectAttempts})`}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={setupEventSource}
                loading={isLoading}
                icon={<ArrowPathIcon />}
              >
                Retry
              </Button>
              {sseStatus.reconnectAttempts > 3 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </Card>
  )
}

export default TelephonyInterfaceFixed