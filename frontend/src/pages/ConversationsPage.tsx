import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  StopIcon,
  PaperAirplaneIcon,
  UserIcon,
  ComputerDesktopIcon,
  ClockIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { useAuth } from '@/contexts/AuthContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import axios from 'axios'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

interface ConversationMessage {
  id: string
  type: 'user' | 'agent' | 'system'
  content: string
  timestamp: string
  metadata?: any
}

interface Conversation {
  id: string
  customerPhone: string
  customerName?: string
  status: 'active' | 'completed' | 'transferred' | 'error'
  startedAt: string
  endedAt?: string
  duration?: number
  isHumanTakeover: boolean
  messages: ConversationMessage[]
  leadQuality?: 'high' | 'medium' | 'low'
  summary?: string
  location?: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const ConversationsPage: React.FC = () => {
  const { user } = useAuth()
  const organizationId = user?.organizationId
  
  const { 
    // @ts-ignore - used in future WebSocket implementation
    activeConversations,
    takeoverConversation,
    releaseConversation,
    sendMessage,
    subscribeToConversation,
    // @ts-ignore - used in future WebSocket implementation  
    unsubscribeFromConversation,
    addEventListener,
    removeEventListener
  } = useWebSocket()
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [messageInput, setMessageInput] = useState('')
  const [messageType, setMessageType] = useState<'user_message' | 'contextual_update'>('user_message')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      setIsLoading(true)
      if (!organizationId) {
        toast.error('Organization context required')
        return
      }

      const headers = {
        'x-organization-id': organizationId,
        ...(axios.defaults.headers.common['Authorization'] && {
          'Authorization': axios.defaults.headers.common['Authorization']
        })
      }

      const response = await axios.get(`${API_BASE_URL}/api/conversations`, {
        headers,
        params: {
          search: searchQuery,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit: 50
        }
      })
      setConversations(response.data.data)
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
      toast.error('Failed to load conversations')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch conversation details
  const fetchConversationDetails = async (conversationId: string) => {
    try {
      if (!organizationId) {
        toast.error('Organization context required')
        return
      }

      const headers = {
        'x-organization-id': organizationId,
        ...(axios.defaults.headers.common['Authorization'] && {
          'Authorization': axios.defaults.headers.common['Authorization']
        })
      }

      const response = await axios.get(`${API_BASE_URL}/api/conversations/${conversationId}`, { headers })
      const conversation = response.data.data
      setSelectedConversation(conversation)
      subscribeToConversation(conversationId)
    } catch (error) {
      console.error('Failed to fetch conversation details:', error)
      toast.error('Failed to load conversation details')
    }
  }

  // Handle real-time message updates
  useEffect(() => {
    const handleMessageUpdate = (event: any) => {
      if (event.type === 'user_transcript' || event.type === 'agent_response') {
        if (selectedConversation && event.conversationId === selectedConversation.id) {
          const newMessage: ConversationMessage = {
            id: `msg-${Date.now()}`,
            type: event.type === 'user_transcript' ? 'user' : 'agent',
            content: event.data.text || event.data.message,
            timestamp: event.timestamp,
            metadata: event.data
          }
          
          setSelectedConversation(prev => prev ? {
            ...prev,
            messages: [...prev.messages, newMessage]
          } : null)
        }
      }
    }

    addEventListener('*', handleMessageUpdate)
    return () => removeEventListener('*', handleMessageUpdate)
  }, [selectedConversation])

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation?.messages])

  // Initial load
  useEffect(() => {
    if (organizationId) {
      fetchConversations()
    }
  }, [organizationId, searchQuery, statusFilter])

  const handleTakeoverConversation = (conversationId: string) => {
    takeoverConversation(conversationId)
    toast.success('Taking over conversation...')
  }

  const handleReleaseConversation = (conversationId: string) => {
    releaseConversation(conversationId)
    toast.success('Releasing conversation to AI...')
  }

  const handleSendMessage = () => {
    if (!selectedConversation || !messageInput.trim()) return

    sendMessage(selectedConversation.id, messageInput, messageType)
    
    // Add message to UI immediately
    const newMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      type: 'system',
      content: `${messageType === 'user_message' ? 'Human sent as user' : 'Context update'}: ${messageInput}`,
      timestamp: new Date().toISOString()
    }
    
    setSelectedConversation(prev => prev ? {
      ...prev,
      messages: [...prev.messages, newMessage]
    } : null)
    
    setMessageInput('')
    messageInputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.customerPhone.includes(searchQuery) || 
                         conv.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || conv.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success'
      case 'completed': return 'neutral'
      case 'transferred': return 'warning'
      case 'error': return 'danger'
      default: return 'neutral'
    }
  }

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'user': return <UserIcon className="w-4 h-4" />
      case 'agent': return <ComputerDesktopIcon className="w-4 h-4" />
      case 'system': return <ClockIcon className="w-4 h-4" />
      default: return <ChatBubbleLeftRightIcon className="w-4 h-4" />
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Conversations</h1>
          <p className="text-neutral-600 mt-1">
            Monitor and manage AI voice conversations
          </p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Conversations List */}
        <div className="lg:col-span-1">
          <Card padding="none" className="h-full flex flex-col">
            <Card.Header>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    All Conversations
                  </h2>
                  <Badge variant="primary">
                    {filteredConversations.length}
                  </Badge>
                </div>
                
                {/* Search and Filter */}
                <div className="space-y-3">
                  <Input
                    placeholder="Search by phone or name..."
                    icon={<MagnifyingGlassIcon />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="transferred">Transferred</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>
            </Card.Header>
            
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <ChatBubbleLeftRightIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                  <p className="text-neutral-500">No conversations found</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {filteredConversations.map((conversation) => (
                    <motion.div
                      key={conversation.id}
                      whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
                      className={clsx(
                        'p-4 cursor-pointer transition-colors',
                        selectedConversation?.id === conversation.id && 'bg-primary-50 border-r-2 border-primary-500'
                      )}
                      onClick={() => fetchConversationDetails(conversation.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <Avatar
                          initials={conversation.customerPhone.slice(-4)}
                          size="sm"
                          status={conversation.status === 'active' ? 'online' : 'offline'}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-neutral-900 truncate">
                              {conversation.customerName || conversation.customerPhone}
                            </p>
                            <span className="text-xs text-neutral-500">
                              {format(new Date(conversation.startedAt), 'HH:mm')}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge 
                              variant={getStatusColor(conversation.status)} 
                              size="sm"
                            >
                              {conversation.status}
                            </Badge>
                            {conversation.isHumanTakeover && (
                              <Badge variant="warning" size="sm">
                                Human
                              </Badge>
                            )}
                            {conversation.leadQuality && (
                              <Badge variant="success" size="sm">
                                {conversation.leadQuality} lead
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-neutral-500 mt-1">
                            Duration: {formatDuration(conversation.duration)}
                          </p>
                          
                          {conversation.location && (
                            <div className="flex items-center mt-1 text-xs text-neutral-500">
                              <MapPinIcon className="w-3 h-3 mr-1" />
                              {conversation.location}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Conversation Details */}
        <div className="lg:col-span-2">
          {selectedConversation ? (
            <Card padding="none" className="h-full flex flex-col">
              <Card.Header>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar
                      initials={selectedConversation.customerPhone.slice(-4)}
                      size="md"
                      status={selectedConversation.status === 'active' ? 'online' : 'offline'}
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">
                        {selectedConversation.customerName || selectedConversation.customerPhone}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant={getStatusColor(selectedConversation.status)} 
                          size="sm"
                        >
                          {selectedConversation.status}
                        </Badge>
                        {selectedConversation.isHumanTakeover && (
                          <Badge variant="warning" size="sm">
                            Human Control
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-neutral-500">
                      {formatDuration(selectedConversation.duration)}
                    </span>
                    {selectedConversation.status === 'active' && (
                      selectedConversation.isHumanTakeover ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<StopIcon />}
                          onClick={() => handleReleaseConversation(selectedConversation.id)}
                        >
                          Release to AI
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<PlayIcon />}
                          onClick={() => handleTakeoverConversation(selectedConversation.id)}
                        >
                          Take Over
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </Card.Header>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
                <AnimatePresence>
                  {selectedConversation.messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={clsx(
                        'flex items-start space-x-3',
                        message.type === 'user' && 'flex-row-reverse space-x-reverse'
                      )}
                    >
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm',
                        message.type === 'user' && 'bg-primary-500',
                        message.type === 'agent' && 'bg-accent-500',
                        message.type === 'system' && 'bg-neutral-400'
                      )}>
                        {getMessageTypeIcon(message.type)}
                      </div>
                      
                      <div className={clsx(
                        'flex-1 max-w-xs lg:max-w-md',
                        message.type === 'user' && 'text-right'
                      )}>
                        <div className={clsx(
                          'rounded-lg p-3 text-sm',
                          message.type === 'user' && 'bg-primary-500 text-white',
                          message.type === 'agent' && 'bg-accent-50 text-accent-900',
                          message.type === 'system' && 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        )}>
                          <p>{message.content}</p>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">
                          {format(new Date(message.timestamp), 'HH:mm:ss')}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
              
              {/* Message Input */}
              {selectedConversation.status === 'active' && selectedConversation.isHumanTakeover && (
                <Card.Footer>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="user_message"
                          checked={messageType === 'user_message'}
                          onChange={(e) => setMessageType(e.target.value as any)}
                          className="text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-neutral-700">Send as User</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="contextual_update"
                          checked={messageType === 'contextual_update'}
                          onChange={(e) => setMessageType(e.target.value as any)}
                          className="text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-neutral-700">Context Update</span>
                      </label>
                    </div>
                    
                    <div className="flex items-end space-x-3">
                      <div className="flex-1">
                        <textarea
                          ref={messageInputRef}
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder={
                            messageType === 'user_message' 
                              ? 'Type a message as the user...' 
                              : 'Provide contextual information to the AI...'
                          }
                          rows={2}
                          className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm resize-none"
                        />
                      </div>
                      <Button
                        onClick={handleSendMessage}
                        disabled={!messageInput.trim()}
                        icon={<PaperAirplaneIcon />}
                        variant="primary"
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                </Card.Footer>
              )}
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <ChatBubbleLeftRightIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">
                  Select a Conversation
                </h3>
                <p className="text-neutral-500">
                  Choose a conversation from the list to view details and manage it
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConversationsPage