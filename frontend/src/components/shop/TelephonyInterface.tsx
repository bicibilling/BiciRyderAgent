import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
  ChartBarIcon,
  CogIcon,
  PhoneIcon,
  DevicePhoneMobileIcon,
  StopIcon,
  UserIcon,
  ExclamationTriangleIcon,
  ArrowDownIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'

// Types
import {
  ConversationMessage,
  SSEEvent,
  SSEConnectionStatus,
  MainTabType,
  CurrentMode,
  TelephonyInterfaceProps
} from '@/types/conversation'

// Sub-components
import ConversationDisplay from './ConversationDisplay'
import MessageInput from './MessageInput'
import StatusIndicator from './StatusIndicator'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const TelephonyInterface: React.FC<TelephonyInterfaceProps> = ({ 
  selectedLead, 
  organizationId, 
  onClose 
}) => {
  const { user } = useAuth()
  
  // Core state
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [isCallActive, setIsCallActive] = useState(false)
  const [isUnderHumanControl, setIsUnderHumanControl] = useState(false)
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [currentMode, setCurrentMode] = useState<CurrentMode>('idle')
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('conversation')
  const [humanControlAgent, setHumanControlAgent] = useState<string | null>(null)
  
  // SSE connection state
  const [sseStatus, setSseStatus] = useState<SSEConnectionStatus>({
    connected: false,
    reconnectAttempts: 0
  })
  
  // UI state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [queuedMessagesCount, setQueuedMessagesCount] = useState(0)
  
  // Refs
  const eventSourceRef = useRef<EventSource | null>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // Organization security headers
  const getOrganizationHeaders = useCallback(() => {
    if (!organizationId) {
      throw new Error('Organization context required - please refresh the page')
    }
    return { 'organizationId': organizationId }
  }, [organizationId])

  // SSE Connection Management
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
        
        // Auto-reconnect with exponential backoff
        const reconnectDelay = Math.min(1000 * Math.pow(2, sseStatus.reconnectAttempts), 30000)
        setTimeout(() => {
          if (selectedLead && sseStatus.reconnectAttempts < 5) {
            setupEventSource()
          }
        }, reconnectDelay)
      }
    } catch (error) {
      console.error('Failed to create EventSource:', error)
      setSseStatus(prev => ({
        ...prev,
        connected: false,
        error: 'Failed to connect'
      }))
    }
  }, [selectedLead, organizationId, sseStatus.reconnectAttempts])

  // Handle SSE Events
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
        }
        break
        
      case 'call_initiated':
        setIsCallActive(true)
        setCurrentMode('voice')
        toast.success('Call initiated successfully')
        break
        
      case 'call_ended':
        setIsCallActive(false)
        setCurrentMode('idle')
        if (data.summary) {
          toast.success('Call completed with summary')
        }
        break
        
      case 'human_control_started':
        setIsUnderHumanControl(true)
        setIsAutoMode(false)
        setHumanControlAgent(data.session?.agentName || 'Agent')
        toast.success(`Human control started - ${data.session?.agentName}`)
        break
        
      case 'human_control_ended':
        setIsUnderHumanControl(false)
        setIsAutoMode(true)
        setHumanControlAgent(null)
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
          setQueuedMessagesCount(prev => prev + 1)
        }
        break
        
      case 'error':
        console.error('SSE Error event:', data.error)
        toast.error(`Connection error: ${data.error}`)
        break
        
      default:
        console.log('Unhandled SSE event type:', data.type)
    }
  }, [organizationId])

  // Message management
  const addConversationMessage = useCallback((message: ConversationMessage) => {
    setConversationHistory(prev => {
      // Prevent duplicates
      const exists = prev.some(msg => msg.id === message.id)
      if (exists) return prev
      
      const updated = [...prev, message].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      // Auto-scroll if near bottom
      setTimeout(() => {
        if (scrollContainerRef.current && conversationEndRef.current) {
          const container = scrollContainerRef.current
          const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100
          
          if (isNearBottom) {
            scrollToBottom()
          } else {
            setShowScrollToBottom(true)
          }
        }
      }, 100)
      
      return updated
    })
  }, [])

  // Scrolling functions
  const scrollToBottom = useCallback(() => {
    conversationEndRef.current?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'end'
    })
    setShowScrollToBottom(false)
  }, [])

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current && conversationEndRef.current) {
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100
      setShowScrollToBottom(!isNearBottom && conversationHistory.length > 0)
    }
  }, [conversationHistory.length])

  // Human control functions
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
          handoffReason: 'manual_takeover'
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // State will be updated via SSE
        toast.success('Joined conversation successfully')
      } else {
        throw new Error(result.error || 'Failed to join conversation')
      }
    } catch (error: any) {
      console.error('Failed to join human control:', error)
      toast.error(error.message || 'Failed to join conversation')
      // Reset toggle if failed
      setIsAutoMode(true)
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
          handoffSuccess: true
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // State will be updated via SSE
        toast.success('Returned control to AI')
      } else {
        throw new Error(result.error || 'Failed to leave conversation')
      }
    } catch (error: any) {
      console.error('Failed to leave human control:', error)
      toast.error(error.message || 'Failed to leave conversation')
      // Reset toggle if failed
      setIsAutoMode(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Communication functions
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
          organizationId: organizationId
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Status will be updated via SSE
        toast.success(`Call initiated to ${selectedLead.phoneNumber}`)
      } else {
        throw new Error(result.error || 'Failed to initiate call')
      }
    } catch (error: any) {
      console.error('Failed to start voice call:', error)
      toast.error(error.message || 'Failed to start call')
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
          messageType: 'text'
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Message will be added via SSE
        toast.success('Message sent successfully')
      } else {
        throw new Error(result.error || 'Failed to send message')
      }
    } catch (error: any) {
      console.error('Failed to send message:', error)
      toast.error(error.message || 'Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto/Manual mode sync
  useEffect(() => {
    if (!isAutoMode && !isUnderHumanControl && !isLoading) {
      // Switch to manual - join human control
      handleJoinHumanControl()
    } else if (isAutoMode && isUnderHumanControl && !isLoading) {
      // Switch to auto - leave human control
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
    }
  }, [selectedLead?.id, organizationId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  if (!selectedLead) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center">
          <ChatBubbleLeftRightIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            No Lead Selected
          </h3>
          <p className="text-neutral-600">
            Select a lead to start a conversation
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
      {/* Header */}
      <div className="p-6 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">
                {selectedLead.customerName}
              </h2>
              <div className="flex items-center space-x-2 mt-1">
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
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Auto/Manual Toggle */}
            <div className="flex items-center space-x-2 px-3 py-2 bg-neutral-50 rounded-lg">
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
            
            {/* Close button */}
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

      {/* Tab Navigation */}
      <div className="border-b border-neutral-200">
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
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
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
              {/* Communication Controls */}
              <div className="p-4 border-b border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between">
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
                  </div>
                  
                  {isUnderHumanControl && (
                    <div className="flex items-center space-x-2">
                      <Badge variant="warning" className="flex items-center space-x-1">
                        <UserIcon className="w-3 h-3" />
                        <span>{humanControlAgent}</span>
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation Area */}
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
                
                {/* Scroll to bottom button */}
                {showScrollToBottom && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-4 p-2 bg-primary-500 text-white rounded-full shadow-lg hover:bg-primary-600 transition-colors z-10"
                  >
                    <ArrowDownIcon className="w-5 h-5" />
                  </motion.button>
                )}
              </div>

              {/* Message Input */}
              {isUnderHumanControl && (
                <div className="border-t border-neutral-200 p-4">
                  <MessageInput
                    onSendMessage={handleSendMessage}
                    disabled={isLoading || !sseStatus.connected}
                    placeholder="Type your message..."
                  />
                </div>
              )}
            </motion.div>
          )}
          
          {/* Other tab contents */}
          {activeMainTab !== 'conversation' && (
            <motion.div
              key={activeMainTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 p-6 flex items-center justify-center"
            >
              <div className="text-center">
                <TabIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2 capitalize">
                  {activeMainTab}
                </h3>
                <p className="text-neutral-600">
                  {activeMainTab === 'profile' && 'Lead profile and contact information'}
                  {activeMainTab === 'analytics' && 'Conversation analytics and insights'}
                  {activeMainTab === 'settings' && 'Communication settings and preferences'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Connection Status Warning */}
      {!sseStatus.connected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-yellow-50 border-t border-yellow-200"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={setupEventSource}
              loading={isLoading}
            >
              Retry
            </Button>
          </div>
        </motion.div>
      )}
    </Card>
  )
}

export default TelephonyInterface