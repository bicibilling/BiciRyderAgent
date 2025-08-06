import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  PhoneIcon, 
  UserGroupIcon, 
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { useWebSocket } from '@/contexts/WebSocketContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import axios from 'axios'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface DashboardStats {
  activeConversations: number
  totalCallsToday: number
  averageCallDuration: number
  humanTakeoverRate: number
  aiSuccessRate: number
  totalLeadsToday: number
}

interface RecentConversation {
  id: string
  customerPhone: string
  status: 'completed' | 'active' | 'transferred' | 'error'
  startedAt: string
  duration?: number
  aiHandled: boolean
  leadQuality?: 'high' | 'medium' | 'low'
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const DashboardPage: React.FC = () => {
  const { 
    isConnected, 
    activeConversations, 
    connectionStatus,
    takeoverConversation,
    releaseConversation,
    addEventListener,
    removeEventListener
  } = useWebSocket()
  
  const [stats, setStats] = useState<DashboardStats>({
    activeConversations: 0,
    totalCallsToday: 0,
    averageCallDuration: 0,
    humanTakeoverRate: 0,
    aiSuccessRate: 95,
    totalLeadsToday: 0
  })
  
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      const [statsResponse, conversationsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/dashboard/stats`),
        axios.get(`${API_BASE_URL}/api/dashboard/recent-conversations`)
      ])
      
      setStats(statsResponse.data.data)
      setRecentConversations(conversationsResponse.data.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  // Update stats from active conversations
  useEffect(() => {
    setStats(prev => ({
      ...prev,
      activeConversations: activeConversations.size
    }))
  }, [activeConversations])

  // Listen for real-time updates
  useEffect(() => {
    const handleConversationUpdate = (event: any) => {
      // Update recent conversations
      if (event.type === 'conversation_ended') {
        fetchDashboardData()
      }
    }

    addEventListener('*', handleConversationUpdate)
    
    // Initial data fetch
    fetchDashboardData()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000)

    return () => {
      removeEventListener('*', handleConversationUpdate)
      clearInterval(interval)
    }
  }, [])

  const handleTakeoverConversation = (conversationId: string) => {
    takeoverConversation(conversationId)
    toast.success('Taking over conversation...')
  }

  const handleReleaseConversation = (conversationId: string) => {
    releaseConversation(conversationId)
    toast.success('Releasing conversation to AI...')
  }

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

  const getLeadQualityColor = (quality?: string) => {
    switch (quality) {
      case 'high': return 'success'
      case 'medium': return 'warning'
      case 'low': return 'neutral'
      default: return 'neutral'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-neutral-600 mt-1">
            Real-time monitoring of BICI AI Voice Agent system
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <div className="flex items-center space-x-2">
            <Badge 
              variant={connectionStatus === 'connected' ? 'success' : 'danger'} 
              dot 
            />
            <span className="text-sm text-neutral-600">
              {connectionStatus === 'connected' ? 'Live Updates' : 'Offline'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="md"
            icon={<ArrowPathIcon />}
            onClick={fetchDashboardData}
            loading={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Connection Warning */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center space-x-3"
        >
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Dashboard is offline
            </p>
            <p className="text-sm text-yellow-700">
              Real-time updates are unavailable. Data may not be current.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card hover>
            <Card.Body>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                    <PhoneIcon className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-neutral-600">Active Calls</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {stats.activeConversations}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card hover>
            <Card.Body>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-accent-100 rounded-lg flex items-center justify-center">
                    <ChatBubbleLeftRightIcon className="w-5 h-5 text-accent-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-neutral-600">Today's Calls</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {stats.totalCallsToday}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card hover>
            <Card.Body>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-secondary-100 rounded-lg flex items-center justify-center">
                    <UserGroupIcon className="w-5 h-5 text-secondary-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-neutral-600">Leads Generated</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {stats.totalLeadsToday}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card hover>
            <Card.Body>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="w-5 h-5 text-yellow-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-neutral-600">AI Success Rate</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {stats.aiSuccessRate}%
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Conversations */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Active Conversations
                </h2>
                <Badge variant="primary">
                  {activeConversations.size}
                </Badge>
              </div>
            </Card.Header>
            <Card.Body>
              {activeConversations.size === 0 ? (
                <div className="text-center py-8">
                  <PhoneIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                  <p className="text-neutral-500">No active conversations</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.from(activeConversations.values()).map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar
                          initials={conversation.customerPhone.slice(-4)}
                          size="sm"
                          status="online"
                        />
                        <div>
                          <p className="font-medium text-neutral-900">
                            {conversation.customerPhone}
                          </p>
                          <div className="flex items-center space-x-2">
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
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-neutral-500">
                          {formatDuration(conversation.duration)}
                        </span>
                        {conversation.isHumanTakeover ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<StopIcon />}
                            onClick={() => handleReleaseConversation(conversation.id)}
                          >
                            Release
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<PlayIcon />}
                            onClick={() => handleTakeoverConversation(conversation.id)}
                          >
                            Take Over
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </motion.div>

        {/* Recent Conversations */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <Card.Header>
              <h2 className="text-lg font-semibold text-neutral-900">
                Recent Activity
              </h2>
            </Card.Header>
            <Card.Body>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : recentConversations.length === 0 ? (
                <div className="text-center py-8">
                  <ChatBubbleLeftRightIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                  <p className="text-neutral-500">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-center justify-between p-3 hover:bg-neutral-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar
                          initials={conversation.customerPhone.slice(-4)}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium text-neutral-900">
                            {conversation.customerPhone}
                          </p>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant={getStatusColor(conversation.status)} 
                              size="sm"
                            >
                              {conversation.status}
                            </Badge>
                            {conversation.aiHandled && (
                              <Badge variant="success" size="sm">
                                <CheckCircleIcon className="w-3 h-3 mr-1" />
                                AI
                              </Badge>
                            )}
                            {conversation.leadQuality && (
                              <Badge 
                                variant={getLeadQualityColor(conversation.leadQuality)} 
                                size="sm"
                              >
                                {conversation.leadQuality} lead
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-neutral-500">
                          {format(new Date(conversation.startedAt), 'HH:mm')}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {formatDuration(conversation.duration)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default DashboardPage