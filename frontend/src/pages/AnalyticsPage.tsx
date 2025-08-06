import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ChartBarIcon,
  ClockIcon,
  PhoneIcon,
  UserGroupIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  CalendarDaysIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar,
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import axios from 'axios'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import toast from 'react-hot-toast'

interface AnalyticsData {
  overview: {
    totalCalls: number
    totalCallsChange: number
    averageDuration: number
    averageDurationChange: number
    aiSuccessRate: number
    aiSuccessRateChange: number
    totalLeads: number
    totalLeadsChange: number
  }
  callsOverTime: Array<{
    date: string
    calls: number
    aiHandled: number
    humanHandled: number
  }>
  callsByHour: Array<{
    hour: string
    calls: number
    avgDuration: number
  }>
  callOutcomes: Array<{
    name: string
    value: number
    color: string
  }>
  leadQuality: Array<{
    quality: string
    count: number
    percentage: number
  }>
  topReasons: Array<{
    reason: string
    count: number
    aiSuccess: number
  }>
  performanceMetrics: {
    averageResponseTime: number
    callCompletionRate: number
    customerSatisfaction: number
    leadConversionRate: number
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const AnalyticsPage: React.FC = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('7d')
  const [selectedMetric, setSelectedMetric] = useState('calls')

  const fetchAnalyticsData = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get(`${API_BASE_URL}/api/analytics`, {
        params: {
          range: dateRange
        }
      })
      setAnalyticsData(response.data.data)
    } catch (error) {
      console.error('Failed to fetch analytics data:', error)
      toast.error('Failed to load analytics data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalyticsData()
  }, [dateRange])

  const formatChange = (value: number) => {
    const isPositive = value >= 0
    return (
      <div className={`flex items-center space-x-1 ${isPositive ? 'text-accent-600' : 'text-secondary-600'}`}>
        {isPositive ? (
          <TrendingUpIcon className="w-4 h-4" />
        ) : (
          <TrendingDownIcon className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">
          {isPositive ? '+' : ''}{value.toFixed(1)}%
        </span>
      </div>
    )
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-neutral-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12">
        <ChartBarIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-neutral-900 mb-2">
          No Analytics Data
        </h3>
        <p className="text-neutral-500">
          Analytics data is not available at the moment
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Analytics & Reports</h1>
          <p className="text-neutral-600 mt-1">
            Insights and performance metrics for BICI AI Voice Agent
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="1d">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <Button
            variant="secondary"
            size="md"
            icon={<CalendarDaysIcon />}
            onClick={fetchAnalyticsData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card hover>
            <Card.Body>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">Total Calls</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {analyticsData.overview.totalCalls.toLocaleString()}
                  </p>
                  {formatChange(analyticsData.overview.totalCallsChange)}
                </div>
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                  <PhoneIcon className="w-6 h-6 text-primary-600" />
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">Avg Duration</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {formatDuration(analyticsData.overview.averageDuration)}
                  </p>
                  {formatChange(analyticsData.overview.averageDurationChange)}
                </div>
                <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center">
                  <ClockIcon className="w-6 h-6 text-accent-600" />
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">AI Success Rate</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {analyticsData.overview.aiSuccessRate.toFixed(1)}%
                  </p>
                  {formatChange(analyticsData.overview.aiSuccessRateChange)}
                </div>
                <div className="w-12 h-12 bg-secondary-100 rounded-xl flex items-center justify-center">
                  <ChartBarIcon className="w-6 h-6 text-secondary-600" />
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">Leads Generated</p>
                  <p className="text-2xl font-bold text-neutral-900">
                    {analyticsData.overview.totalLeads.toLocaleString()}
                  </p>
                  {formatChange(analyticsData.overview.totalLeadsChange)}
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <UserGroupIcon className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-neutral-900">
                Calls Over Time
              </h3>
            </Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={analyticsData.callsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#666"
                    fontSize={12}
                    tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                  />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="aiHandled"
                    stackId="1"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.7}
                    name="AI Handled"
                  />
                  <Area
                    type="monotone"
                    dataKey="humanHandled"
                    stackId="1"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.7}
                    name="Human Handled"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </motion.div>

        {/* Call Outcomes */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-neutral-900">
                Call Outcomes
              </h3>
            </Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analyticsData.callOutcomes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analyticsData.callOutcomes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls by Hour */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-neutral-900">
                Call Volume by Hour
              </h3>
            </Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.callsByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </motion.div>

        {/* Lead Quality Distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-neutral-900">
                Lead Quality Distribution
              </h3>
            </Card.Header>
            <Card.Body>
              <div className="space-y-4">
                {analyticsData.leadQuality.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Badge 
                        variant={
                          item.quality === 'high' ? 'success' : 
                          item.quality === 'medium' ? 'warning' : 
                          'neutral'
                        }
                        size="sm"
                      >
                        {item.quality}
                      </Badge>
                      <span className="text-sm text-neutral-600 capitalize">
                        {item.quality} Quality
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-neutral-900">
                        {item.count} leads
                      </p>
                      <p className="text-xs text-neutral-500">
                        {item.percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6">
                <div className="flex h-2 bg-neutral-200 rounded-full overflow-hidden">
                  {analyticsData.leadQuality.map((item, index) => (
                    <div
                      key={index}
                      className={`h-full ${
                        item.quality === 'high' ? 'bg-accent-500' : 
                        item.quality === 'medium' ? 'bg-yellow-500' : 
                        'bg-neutral-400'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  ))}
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>
      </div>

      {/* Top Call Reasons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        <Card>
          <Card.Header>
            <h3 className="text-lg font-semibold text-neutral-900">
              Top Call Reasons & AI Performance
            </h3>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              {analyticsData.topReasons.map((reason, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 capitalize">
                      {reason.reason.replace('_', ' ')}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {reason.count} calls
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-neutral-900">
                        AI Success Rate
                      </p>
                      <p className="text-lg font-bold text-accent-600">
                        {reason.aiSuccess.toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-24 bg-neutral-200 rounded-full h-2">
                      <div
                        className="bg-accent-500 h-2 rounded-full"
                        style={{ width: `${reason.aiSuccess}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      </motion.div>
    </div>
  )
}

export default AnalyticsPage