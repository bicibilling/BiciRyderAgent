import React, { useState } from 'react'
import { UserIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import axios from 'axios'
import toast from 'react-hot-toast'

interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onLeadAdded: (lead: any) => void
}

const AddLeadModal: React.FC<AddLeadModalProps> = ({
  isOpen,
  onClose,
  onLeadAdded
}) => {
  const { user } = useAuth()
  const organizationId = user?.organizationId

  const [formData, setFormData] = useState({
    customerName: '',
    phoneNumber: '',
    email: '',
    leadStatus: 'new',
    leadSource: 'manual_entry',
    bikeInterest: {
      type: '',
      budget: {
        min: '',
        max: ''
      },
      usage: '',
      timeline: ''
    },
    contactPreferences: {
      sms: true,
      email: true,
      call: true,
      preferredTime: 'business_hours',
      language: 'en'
    },
    notes: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  const handleNestedInputChange = (parentField: string, childField: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parentField]: {
        ...(prev[parentField as keyof typeof prev] as any),
        [childField]: value
      }
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required'
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^\+?[\d\s\-\(\)]+$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid phone number'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm() || !organizationId) {
      return
    }

    setIsSubmitting(true)

    try {
      // Format phone number
      let formattedPhone = formData.phoneNumber.trim()
      if (!formattedPhone.startsWith('+')) {
        // Add +1 for North American numbers
        formattedPhone = '+1' + formattedPhone.replace(/\D/g, '')
      }

      const leadData = {
        customerName: formData.customerName.trim(),
        phoneNumber: formattedPhone,
        email: formData.email.trim() || undefined,
        leadStatus: formData.leadStatus,
        leadSource: formData.leadSource,
        bikeInterest: {
          type: formData.bikeInterest.type || undefined,
          budget: formData.bikeInterest.budget.min && formData.bikeInterest.budget.max ? {
            min: parseInt(formData.bikeInterest.budget.min),
            max: parseInt(formData.bikeInterest.budget.max)
          } : undefined,
          usage: formData.bikeInterest.usage || undefined,
          timeline: formData.bikeInterest.timeline || undefined
        },
        contactPreferences: formData.contactPreferences,
        notes: formData.notes.trim() || undefined
      }

      const response = await axios.post(`${API_BASE_URL}/api/leads`, leadData, {
        headers: {
          'organizationId': organizationId,
          'Content-Type': 'application/json'
        }
      })

      if (response.data.success) {
        toast.success('Lead added successfully!')
        onLeadAdded(response.data.data)
        handleClose()
      } else {
        throw new Error(response.data.error || 'Failed to create lead')
      }

    } catch (error: any) {
      console.error('Error creating lead:', error)
      
      if (error.response?.status === 409) {
        toast.error('A lead with this phone number already exists')
      } else {
        toast.error(error.response?.data?.error || 'Failed to create lead. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({
      customerName: '',
      phoneNumber: '',
      email: '',
      leadStatus: 'new',
      leadSource: 'manual_entry',
      bikeInterest: {
        type: '',
        budget: { min: '', max: '' },
        usage: '',
        timeline: ''
      },
      contactPreferences: {
        sms: true,
        email: true,
        call: true,
        preferredTime: 'business_hours',
        language: 'en'
      },
      notes: ''
    })
    setErrors({})
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Lead"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-neutral-900 flex items-center">
            <UserIcon className="w-4 h-4 mr-2" />
            Basic Information
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="Customer Name"
                placeholder="Enter full name"
                value={formData.customerName}
                onChange={(e) => handleInputChange('customerName', e.target.value)}
                error={errors.customerName}
                required
              />
            </div>
            
            <div>
              <Input
                label="Phone Number"
                placeholder="+1 (416) 555-0123"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                error={errors.phoneNumber}
                required
                icon={<PhoneIcon />}
              />
            </div>
          </div>

          <Input
            label="Email (Optional)"
            type="email"
            placeholder="customer@email.com"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            error={errors.email}
            icon={<EnvelopeIcon />}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Lead Status
              </label>
              <select
                value={formData.leadStatus}
                onChange={(e) => handleInputChange('leadStatus', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="follow_up">Follow Up</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Lead Source
              </label>
              <select
                value={formData.leadSource}
                onChange={(e) => handleInputChange('leadSource', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="manual_entry">Manual Entry</option>
                <option value="inbound_call">Inbound Call</option>
                <option value="sms_inquiry">SMS Inquiry</option>
                <option value="website_form">Website Form</option>
                <option value="referral">Referral</option>
                <option value="walk_in">Walk-in</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bike Interest */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-neutral-900">
            Bike Interest (Optional)
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Bike Type
              </label>
              <select
                value={formData.bikeInterest.type}
                onChange={(e) => handleNestedInputChange('bikeInterest', 'type', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="">Select type...</option>
                <option value="road">Road Bike</option>
                <option value="mountain">Mountain Bike</option>
                <option value="electric">Electric Bike</option>
                <option value="hybrid">Hybrid Bike</option>
                <option value="kids">Kids Bike</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Usage
              </label>
              <select
                value={formData.bikeInterest.usage}
                onChange={(e) => handleNestedInputChange('bikeInterest', 'usage', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="">Select usage...</option>
                <option value="commuting">Commuting</option>
                <option value="recreation">Recreation</option>
                <option value="fitness">Fitness</option>
                <option value="racing">Racing</option>
                <option value="touring">Touring</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="Min Budget ($)"
                type="number"
                placeholder="500"
                value={formData.bikeInterest.budget.min}
                onChange={(e) => handleNestedInputChange('bikeInterest', 'budget', {
                  ...formData.bikeInterest.budget,
                  min: e.target.value
                })}
              />
            </div>

            <div>
              <Input
                label="Max Budget ($)"
                type="number"
                placeholder="2000"
                value={formData.bikeInterest.budget.max}
                onChange={(e) => handleNestedInputChange('bikeInterest', 'budget', {
                  ...formData.bikeInterest.budget,
                  max: e.target.value
                })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Timeline
              </label>
              <select
                value={formData.bikeInterest.timeline}
                onChange={(e) => handleNestedInputChange('bikeInterest', 'timeline', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="">Select timeline...</option>
                <option value="immediate">Immediate</option>
                <option value="weeks">Next few weeks</option>
                <option value="months">Next few months</option>
                <option value="researching">Just researching</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact Preferences */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-neutral-900">
            Contact Preferences
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.contactPreferences.sms}
                  onChange={(e) => handleNestedInputChange('contactPreferences', 'sms', e.target.checked)}
                  className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-neutral-700">SMS</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.contactPreferences.email}
                  onChange={(e) => handleNestedInputChange('contactPreferences', 'email', e.target.checked)}
                  className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-neutral-700">Email</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.contactPreferences.call}
                  onChange={(e) => handleNestedInputChange('contactPreferences', 'call', e.target.checked)}
                  className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-neutral-700">Phone Call</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Preferred Contact Time
              </label>
              <select
                value={formData.contactPreferences.preferredTime}
                onChange={(e) => handleNestedInputChange('contactPreferences', 'preferredTime', e.target.value)}
                className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="morning">Morning (9AM - 12PM)</option>
                <option value="afternoon">Afternoon (12PM - 5PM)</option>
                <option value="evening">Evening (5PM - 8PM)</option>
                <option value="business_hours">Business Hours (9AM - 5PM)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            placeholder="Any additional information about this lead..."
            rows={3}
            className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-200">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
          >
            Add Lead
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default AddLeadModal