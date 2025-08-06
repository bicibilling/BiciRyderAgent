import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  UserGroupIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { TelephonyInterfaceFixed as TelephonyInterface, Lead as TelephonyLead } from '@/components/shop'
import AddLeadModal from '@/components/AddLeadModal'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

// Lead interface matching the system design
interface Lead {
  id: string
  customerName: string
  phoneNumber: string
  email?: string
  leadStatus: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'follow_up'
  leadSource: string
  createdAt: string
  updatedAt: string
  lastContactDate?: string
  conversationCount: number
  leadScore?: number
  sentiment: 'positive' | 'neutral' | 'negative'
  bikeInterest?: {
    type?: 'road' | 'mountain' | 'electric' | 'hybrid' | 'kids' | 'other'
    budget?: {
      min?: number
      max?: number
    }
    usage?: 'commuting' | 'recreation' | 'fitness' | 'racing' | 'touring'
    timeline?: 'immediate' | 'weeks' | 'months' | 'researching'
  }
  contactPreferences?: {
    sms: boolean
    email: boolean
    call: boolean
    preferredTime: 'morning' | 'afternoon' | 'evening' | 'business_hours'
    language: 'en' | 'fr'
  }
  notes?: string
  organizationId: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const LeadsPage: React.FC = () => {
  const { user } = useAuth()
  const organizationId = user?.organizationId

  // Convert Lead to TelephonyLead format
  const convertToTelephonyLead = (lead: Lead): TelephonyLead => {
    return {
      id: lead.id,
      customerName: lead.customerName,
      phoneNumber: lead.phoneNumber,
      email: lead.email,
      sentiment: lead.sentiment === 'positive' ? 'Positive' : 
                 lead.sentiment === 'negative' ? 'Negative' : 'Neutral',
      organizationId: lead.organizationId,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt
    }
  }
  
  // State for leads management
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'name' | 'status'>('recent')
  const [showAddLeadModal, setShowAddLeadModal] = useState(false)

  // Fetch leads from API
  const fetchLeads = async () => {
    if (!organizationId) return

    try {
      setIsLoading(true)
      const response = await axios.get(`${API_BASE_URL}/api/leads`, {
        headers: {
          'x-organization-id': organizationId,
          ...(axios.defaults.headers.common['Authorization'] && {
            'Authorization': axios.defaults.headers.common['Authorization']
          })
        },
        params: {
          search: searchQuery,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          source: sourceFilter !== 'all' ? sourceFilter : undefined,
          sortBy,
          limit: 100
        }
      })
      
      if (response.data.success) {
        setLeads(response.data.data || [])
      } else {
        throw new Error(response.data.error || 'Failed to fetch leads')
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
      toast.error('Failed to load leads')
      setLeads([]) // Clear leads on error
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load and refresh on filters
  useEffect(() => {
    if (organizationId) {
      fetchLeads()
    }
  }, [organizationId, searchQuery, statusFilter, sourceFilter, sortBy])

  // Handle lead selection for telephony interface
  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead)
  }

  const handleCloseTelephony = () => {
    setSelectedLead(null)
  }

  const handleLeadUpdate = (updatedTelephonyLead: TelephonyLead) => {
    // Convert back and update the lead
    setLeads(prev => prev.map(lead => {
      if (lead.id === updatedTelephonyLead.id) {
        return {
          ...lead,
          customerName: updatedTelephonyLead.customerName,
          phoneNumber: updatedTelephonyLead.phoneNumber,
          email: updatedTelephonyLead.email,
          sentiment: updatedTelephonyLead.sentiment === 'Positive' ? 'positive' : 
                     updatedTelephonyLead.sentiment === 'Negative' ? 'negative' : 'neutral',
          updatedAt: updatedTelephonyLead.updatedAt || new Date().toISOString()
        }
      }
      return lead
    }))
    
    // Also update selected lead
    const updatedLead = leads.find(l => l.id === updatedTelephonyLead.id)
    if (updatedLead) {
      setSelectedLead({
        ...updatedLead,
        customerName: updatedTelephonyLead.customerName,
        phoneNumber: updatedTelephonyLead.phoneNumber,
        email: updatedTelephonyLead.email,
        sentiment: updatedTelephonyLead.sentiment === 'Positive' ? 'positive' : 
                   updatedTelephonyLead.sentiment === 'Negative' ? 'negative' : 'neutral',
        updatedAt: updatedTelephonyLead.updatedAt || new Date().toISOString()
      })
    }
  }

  // Filter and sort leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         lead.phoneNumber.includes(searchQuery) ||
                         lead.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || lead.leadStatus === statusFilter
    const matchesSource = sourceFilter === 'all' || lead.leadSource === sourceFilter
    return matchesSearch && matchesStatus && matchesSource
  })

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'primary'
      case 'contacted': return 'secondary'
      case 'qualified': return 'success'
      case 'converted': return 'success'
      case 'lost': return 'danger'
      case 'follow_up': return 'warning'
      default: return 'neutral'
    }
  }

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'negative': return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
      default: return <ClockIcon className="w-4 h-4 text-neutral-500" />
    }
  }

  const getScoreColor = (score?: number) => {
    if (!score) return 'text-neutral-400'
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Leads Management</h1>
          <p className="text-neutral-600 mt-1">
            Manage customer leads with sophisticated conversation interface
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <Button
            variant="secondary"
            size="md"
            icon={<FunnelIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<PlusIcon />}
            onClick={() => setShowAddLeadModal(true)}
          >
            Add Lead
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Search leads by name, phone, or email..."
              icon={<MagnifyingGlassIcon />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            >
              <option value="recent">Most Recent</option>
              <option value="score">Lead Score</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 p-4 bg-neutral-50 rounded-lg"
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
                <option value="lost">Lost</option>
                <option value="follow_up">Follow Up</option>
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Sources</option>
                <option value="inbound_call">Inbound Call</option>
                <option value="sms_inquiry">SMS Inquiry</option>
                <option value="missed_call">Missed Call</option>
                <option value="website_form">Website Form</option>
                <option value="referral">Referral</option>
              </select>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Leads Grid/List */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner />
          </div>
        ) : filteredLeads.length === 0 ? (
          <Card className="h-64 flex items-center justify-center">
            <div className="text-center">
              <UserGroupIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-neutral-900 mb-2">
                No Leads Found
              </h3>
              <p className="text-neutral-500">
                {searchQuery ? 'Try adjusting your search criteria' : 'Start adding leads to see them here'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredLeads.map((lead, index) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div 
                  className="cursor-pointer"
                  onClick={() => handleSelectLead(lead)}
                >
                  <Card hover className="h-full">
                    <Card.Body className="space-y-4">
                    {/* Lead Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <Avatar
                          initials={lead.customerName.split(' ').map(n => n[0]).join('')}
                          size="md"
                          status={lead.leadStatus === 'new' ? 'online' : 'offline'}
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-neutral-900 truncate max-w-[150px]">
                            {lead.customerName}
                          </h3>
                          <p className="text-sm text-neutral-500 truncate max-w-[150px]">
                            {lead.phoneNumber}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        {getSentimentIcon(lead.sentiment)}
                        {lead.leadScore && (
                          <div className={clsx('text-sm font-medium', getScoreColor(lead.leadScore))}>
                            {lead.leadScore}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status and Source */}
                    <div className="flex items-center justify-between">
                      <Badge variant={getStatusColor(lead.leadStatus)} size="sm">
                        {lead.leadStatus.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-neutral-500 capitalize truncate max-w-[80px]">
                        {lead.leadSource.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Bike Interest */}
                    {lead.bikeInterest?.type && (
                      <div className="text-sm text-neutral-600 truncate">
                        <div className="truncate">
                          <strong>Interest:</strong> {lead.bikeInterest.type} bike
                        </div>
                        {lead.bikeInterest.budget && (
                          <div className="text-xs text-neutral-500 truncate">
                            Budget: ${lead.bikeInterest.budget.min} - ${lead.bikeInterest.budget.max}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-1 text-neutral-500">
                        <ChatBubbleLeftRightIcon className="w-4 h-4" />
                        <span>{lead.conversationCount} msg</span>
                      </div>
                      {lead.lastContactDate ? (
                        <span className="text-xs text-neutral-500">
                          {format(parseISO(lead.lastContactDate), 'MMM d, HH:mm')}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          No contact
                        </span>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center space-x-2 pt-2 border-t border-neutral-100">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<PhoneIcon />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectLead(lead)
                          toast.success('Opening conversation interface...')
                        }}
                        className="flex-1"
                      >
                        Call
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<ChatBubbleLeftRightIcon />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectLead(lead)
                          toast.success('Opening SMS interface...')
                        }}
                        className="flex-1"
                      >
                        SMS
                      </Button>
                    </div>
                    </Card.Body>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Sophisticated TelephonyInterface Modal/Overlay */}
      <AnimatePresence>
        {selectedLead && organizationId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={handleCloseTelephony}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TelephonyInterface
                selectedLead={convertToTelephonyLead(selectedLead)}
                organizationId={organizationId}
                onLeadUpdate={handleLeadUpdate}
                onClose={handleCloseTelephony}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={showAddLeadModal}
        onClose={() => setShowAddLeadModal(false)}
        onLeadAdded={(newLead) => {
          setLeads(prev => [newLead, ...prev])
          setShowAddLeadModal(false)
          fetchLeads() // Refresh the list
        }}
      />
    </div>
  )
}

export default LeadsPage