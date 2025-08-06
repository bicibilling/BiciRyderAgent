import React from 'react'
import { motion } from 'framer-motion'
import { 
  ClockIcon,
  ChatBubbleLeftRightIcon,
  UserIcon,
  CpuChipIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { ConversationMessage, ConversationAnalytics } from '@/types/conversation'

interface ConversationAnalyticsViewProps {
  analytics: ConversationAnalytics | null
  messages: ConversationMessage[]
  leadScore: number
  sentiment: 'positive' | 'neutral' | 'negative'
}

interface MetricCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: React.ComponentType<any>
  trend?: 'up' | 'down' | 'neutral'
  color?: string
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon: Icon, trend, color = 'bg-primary-50 text-primary-600' }) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <ArrowTrendingUpIcon className="w-4 h-4 text-green-500" />
      case 'down':
        return <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-neutral-200 p-6 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
        {getTrendIcon()}
      </div>
      
      <div className="space-y-2">
        <div className="text-2xl font-bold text-neutral-900">{value}</div>
        <div className="text-sm font-medium text-neutral-700">{title}</div>
        <div className="text-xs text-neutral-500">{subtitle}</div>
      </div>
    </motion.div>
  )
}

const ConversationAnalyticsView: React.FC<ConversationAnalyticsViewProps> = ({
  analytics,
  messages,
  leadScore,
  sentiment
}) => {
  // Calculate real-time metrics from messages
  const messagesByType = {
    total: messages.length,
    customer: messages.filter(m => m.sentBy === 'user').length,
    ai: messages.filter(m => m.sentBy === 'agent').length,
    human: messages.filter(m => m.sentBy === 'human_agent').length,
    system: messages.filter(m => m.sentBy === 'system').length
  }

  const conversationDuration = messages.length > 0 
    ? Math.floor((new Date(messages[messages.length - 1].timestamp).getTime() - new Date(messages[0].timestamp).getTime()) / 1000 / 60)
    : 0

  const averageMessageLength = messages.length > 0
    ? Math.round(messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length)
    : 0

  // Mock engagement score calculation
  const engagementScore = Math.min(100, Math.max(0, 
    (messagesByType.customer * 10) + 
    (conversationDuration * 2) + 
    (leadScore * 0.5)
  ))

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-50 text-green-600'
      case 'negative': return 'bg-red-50 text-red-600'
      default: return 'bg-yellow-50 text-yellow-600'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-50 text-green-600'
    if (score >= 60) return 'bg-yellow-50 text-yellow-600'
    if (score >= 40) return 'bg-orange-50 text-orange-600'
    return 'bg-red-50 text-red-600'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-neutral-900">Conversation Analytics</h3>
          <p className="text-neutral-600 mt-1">Real-time insights and performance metrics</p>
        </div>
        <Badge variant="primary" className="flex items-center space-x-1">
          <SparklesIcon className="w-4 h-4" />
          <span>AI Insights</span>
        </Badge>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Messages"
          value={messagesByType.total}
          subtitle="Conversation activity"
          icon={ChatBubbleLeftRightIcon}
          trend={messagesByType.total > 10 ? 'up' : 'neutral'}
        />
        
        <MetricCard
          title="Duration"
          value={`${conversationDuration}m`}
          subtitle="Time engaged"
          icon={ClockIcon}
          color="bg-blue-50 text-blue-600"
          trend={conversationDuration > 15 ? 'up' : 'neutral'}
        />
        
        <MetricCard
          title="Lead Score"
          value={leadScore}
          subtitle="Quality rating"
          icon={ArrowTrendingUpIcon}
          color={getScoreColor(leadScore)}
          trend={leadScore > 70 ? 'up' : leadScore < 40 ? 'down' : 'neutral'}
        />
        
        <MetricCard
          title="Engagement"
          value={`${Math.round(engagementScore)}%`}
          subtitle="Interaction level"
          icon={HeartIcon}
          color="bg-purple-50 text-purple-600"
          trend={engagementScore > 70 ? 'up' : 'neutral'}
        />
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Breakdown */}
        <Card>
          <Card.Header>
            <h4 className="text-lg font-semibold text-neutral-900">Message Distribution</h4>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <UserIcon className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-neutral-700">Customer</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-neutral-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${(messagesByType.customer / messagesByType.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-neutral-600 w-8">
                    {messagesByType.customer}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CpuChipIcon className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-neutral-700">AI Agent</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-neutral-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ width: `${(messagesByType.ai / messagesByType.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-neutral-600 w-8">
                    {messagesByType.ai}
                  </span>
                </div>
              </div>
              
              {messagesByType.human > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <UserIcon className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-neutral-700">Human Agent</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-neutral-200 rounded-full h-2">
                      <div 
                        className="bg-purple-500 h-2 rounded-full" 
                        style={{ width: `${(messagesByType.human / messagesByType.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-neutral-600 w-8">
                      {messagesByType.human}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* Sentiment Analysis */}
        <Card>
          <Card.Header>
            <h4 className="text-lg font-semibold text-neutral-900">Sentiment Analysis</h4>
          </Card.Header>
          <Card.Body>
            <div className="text-center mb-6">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${getSentimentColor(sentiment)} mb-4`}>
                <span className="text-3xl">
                  {sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😞' : '😐'}
                </span>
              </div>
              <h5 className="text-xl font-bold text-neutral-900 capitalize mb-2">{sentiment}</h5>
              <p className="text-sm text-neutral-600">Overall conversation tone</p>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Positive</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-neutral-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: sentiment === 'positive' ? '80%' : '30%' }} />
                  </div>
                  <span className="text-xs text-neutral-500 w-8">
                    {sentiment === 'positive' ? '80%' : '30%'}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Neutral</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-neutral-200 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: sentiment === 'neutral' ? '70%' : '20%' }} />
                  </div>
                  <span className="text-xs text-neutral-500 w-8">
                    {sentiment === 'neutral' ? '70%' : '20%'}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Negative</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-neutral-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: sentiment === 'negative' ? '60%' : '10%' }} />
                  </div>
                  <span className="text-xs text-neutral-500 w-8">
                    {sentiment === 'negative' ? '60%' : '10%'}
                  </span>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Performance Insights</h4>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {analytics?.averageResponseTime?.toFixed(1) || '2.3'}s
              </div>
              <div className="text-sm font-medium text-blue-700">Average Response Time</div>
              <div className="text-xs text-blue-600 mt-1">
                {(analytics?.averageResponseTime || 2.3) < 3 ? 'Excellent' : 'Good'} response speed
              </div>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600 mb-2">
                {averageMessageLength}
              </div>
              <div className="text-sm font-medium text-green-700">Avg Message Length</div>
              <div className="text-xs text-green-600 mt-1">
                {averageMessageLength > 50 ? 'Detailed' : 'Concise'} responses
              </div>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {Math.round((messagesByType.customer / Math.max(messagesByType.ai + messagesByType.human, 1)) * 100)}%
              </div>
              <div className="text-sm font-medium text-purple-700">Interaction Ratio</div>
              <div className="text-xs text-purple-600 mt-1">
                Customer engagement level
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Keywords & Topics */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Key Topics & Keywords</h4>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <div>
              <h5 className="text-sm font-medium text-neutral-700 mb-3">Most Mentioned Topics</h5>
              <div className="flex flex-wrap gap-2">
                {[
                  { word: 'bike', count: 8, relevance: 0.9 },
                  { word: 'price', count: 5, relevance: 0.8 },
                  { word: 'electric', count: 4, relevance: 0.7 },
                  { word: 'warranty', count: 3, relevance: 0.6 },
                  { word: 'delivery', count: 2, relevance: 0.5 }
                ].map((keyword, index) => (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="text-sm"
                  >
                    {keyword.word} ({keyword.count})
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <h5 className="text-sm font-medium text-neutral-700 mb-3">Intent Analysis</h5>
              <div className="space-y-2">
                {[
                  { intent: 'Product Inquiry', confidence: 0.92, color: 'bg-blue-100 text-blue-800' },
                  { intent: 'Price Comparison', confidence: 0.75, color: 'bg-green-100 text-green-800' },
                  { intent: 'Technical Support', confidence: 0.45, color: 'bg-yellow-100 text-yellow-800' }
                ].map((intent, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Badge variant="secondary" className={intent.color}>
                      {intent.intent}
                    </Badge>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-neutral-200 rounded-full h-2">
                        <div 
                          className="bg-primary-500 h-2 rounded-full" 
                          style={{ width: `${intent.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-neutral-500 w-8">
                        {Math.round(intent.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

export default ConversationAnalyticsView