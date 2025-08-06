import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  UserCircleIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  StarIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  DevicePhoneMobileIcon,
  UserIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import { Lead } from '@/types/conversation'

interface LeadProfileProps {
  lead: Lead
  organizationId: string
  onUpdate?: (lead: Lead) => void
  leadScore: number
  sentiment: 'positive' | 'neutral' | 'negative'
}

const LeadProfile: React.FC<LeadProfileProps> = ({
  lead,
  organizationId,
  onUpdate,
  leadScore,
  sentiment
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedLead, setEditedLead] = useState(lead)
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    if (!onUpdate) return
    
    try {
      setIsLoading(true)
      // In production, this would make an API call to update the lead
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call
      onUpdate(editedLead)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update lead:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setEditedLead(lead)
    setIsEditing(false)
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50'
      case 'negative': return 'text-red-600 bg-red-50'
      default: return 'text-yellow-600 bg-yellow-50'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    if (score >= 40) return 'text-orange-600 bg-orange-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <UserCircleIcon className="w-16 h-16 text-primary-600" />
            {leadScore > 75 && (
              <StarIcon className="absolute -top-1 -right-1 w-5 h-5 text-yellow-500 fill-yellow-500" />
            )}
          </div>
          <div>
            <h3 className="text-2xl font-bold text-neutral-900">
              {lead.customerName}
            </h3>
            <div className="flex items-center space-x-2 mt-1">
              <Badge 
                variant={sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'danger' : 'warning'}
                className="capitalize"
              >
                {sentiment} Sentiment
              </Badge>
              <div className={`px-2 py-1 rounded-md text-sm font-medium ${getScoreColor(leadScore)}`}>
                Score: {leadScore}/100
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<XMarkIcon />}
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<CheckIcon />}
                onClick={handleSave}
                loading={isLoading}
              >
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<PencilIcon />}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Contact Information */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Contact Information</h4>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <PhoneIcon className="w-5 h-5 text-neutral-500" />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Phone Number
                  </label>
                  {isEditing ? (
                    <Input
                      type="tel"
                      value={editedLead.phoneNumber}
                      onChange={(e) => setEditedLead(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      className="w-full"
                    />
                  ) : (
                    <p className="text-neutral-900">{lead.phoneNumber}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <EnvelopeIcon className="w-5 h-5 text-neutral-500" />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Email Address
                  </label>
                  {isEditing ? (
                    <Input
                      type="email"
                      value={editedLead.email || ''}
                      onChange={(e) => setEditedLead(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full"
                      placeholder="customer@email.com"
                    />
                  ) : (
                    <p className="text-neutral-900">{lead.email || 'Not provided'}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <CurrencyDollarIcon className="w-5 h-5 text-neutral-500" />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Funding Readiness
                  </label>
                  {isEditing ? (
                    <select
                      value={editedLead.fundingReadiness || 'Not Ready'}
                      onChange={(e) => setEditedLead(prev => ({ ...prev, fundingReadiness: e.target.value as any }))}
                      className="w-full rounded-lg border-neutral-300 focus:border-primary-500 focus:ring-primary-500"
                    >
                      <option value="Not Ready">Not Ready</option>
                      <option value="Pre-Qualified">Pre-Qualified</option>
                      <option value="Ready">Ready</option>
                    </select>
                  ) : (
                    <Badge 
                      variant={
                        lead.fundingReadiness === 'Ready' ? 'success' :
                        lead.fundingReadiness === 'Pre-Qualified' ? 'warning' : 'neutral'
                      }
                    >
                      {lead.fundingReadiness || 'Not Ready'}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <MapPinIcon className="w-5 h-5 text-neutral-500" />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Chase Status
                  </label>
                  {isEditing ? (
                    <select
                      value={editedLead.chaseStatus || 'Auto Chase Running'}
                      onChange={(e) => setEditedLead(prev => ({ ...prev, chaseStatus: e.target.value as any }))}
                      className="w-full rounded-lg border-neutral-300 focus:border-primary-500 focus:ring-primary-500"
                    >
                      <option value="Auto Chase Running">Auto Chase Running</option>
                      <option value="Manual Follow-up">Manual Follow-up</option>
                      <option value="Closed">Closed</option>
                    </select>
                  ) : (
                    <Badge 
                      variant={
                        lead.chaseStatus === 'Auto Chase Running' ? 'success' :
                        lead.chaseStatus === 'Manual Follow-up' ? 'warning' : 'neutral'
                      }
                    >
                      {lead.chaseStatus || 'Auto Chase Running'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Lead Scoring */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Lead Intelligence</h4>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreColor(leadScore)} mb-3`}>
                <span className="text-2xl font-bold">{leadScore}</span>
              </div>
              <h5 className="font-medium text-neutral-900">Lead Score</h5>
              <p className="text-sm text-neutral-600">Overall quality rating</p>
            </div>
            
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getSentimentColor(sentiment)} mb-3`}>
                <span className="text-2xl">
                  {sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😞' : '😐'}
                </span>
              </div>
              <h5 className="font-medium text-neutral-900 capitalize">{sentiment}</h5>
              <p className="text-sm text-neutral-600">Current sentiment</p>
            </div>
            
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 text-primary-600 mb-3">
                <ChatBubbleLeftRightIcon className="w-8 h-8" />
              </div>
              <h5 className="font-medium text-neutral-900">Engaged</h5>
              <p className="text-sm text-neutral-600">Interaction level</p>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Recent Activity</h4>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            {[
              {
                time: new Date(),
                action: 'Conversation started',
                type: 'conversation',
                icon: ChatBubbleLeftRightIcon,
                color: 'text-blue-600 bg-blue-50'
              },
              {
                time: new Date(Date.now() - 3600000),
                action: 'SMS received',
                type: 'sms',
                icon: DevicePhoneMobileIcon,
                color: 'text-green-600 bg-green-50'
              },
              {
                time: new Date(Date.now() - 7200000),
                action: 'Lead created',
                type: 'lead',
                icon: UserCircleIcon,
                color: 'text-purple-600 bg-purple-50'
              }
            ].map((activity, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center space-x-4 p-3 bg-neutral-50 rounded-lg"
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-full ${activity.color} flex items-center justify-center`}>
                  <activity.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">{activity.action}</p>
                  <p className="text-sm text-neutral-600">
                    {format(activity.time, 'MMM dd, yyyy \'at\' HH:mm')}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* Lead Notes */}
      <Card>
        <Card.Header>
          <h4 className="text-lg font-semibold text-neutral-900">Notes & Comments</h4>
        </Card.Header>
        <Card.Body>
          <div className="space-y-3">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-yellow-600">AI</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-yellow-800">
                    Customer shows high interest in electric bikes. Budget range appears to be $1500-3000. 
                    Prefers weekend test rides.
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Generated from conversation analysis
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-800">
                    Follow up needed - customer requested specific model information for Trek FX series.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Added by Mike Johnson • 2 hours ago
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Add Note Button */}
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <Button variant="secondary" size="sm" className="w-full">
              Add Note
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

export default LeadProfile