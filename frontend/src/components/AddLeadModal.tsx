import React, { useState } from 'react'
import { UserIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import axios from 'axios'
import toast from 'react-hot-toast'
import { 
  normalizePhoneNumber, 
  validatePhoneNumber, 
  formatAsUserTypes,
  cleanPhoneNumber 
} from '@/utils/phone'

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
    email: ''
  })
  
  const [phoneDisplayValue, setPhoneDisplayValue] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phoneNumber') {
      // Handle phone number with real-time formatting
      const cleanValue = cleanPhoneNumber(value)
      const displayValue = formatAsUserTypes(value)
      
      setPhoneDisplayValue(displayValue)
      setFormData(prev => ({
        ...prev,
        [field]: cleanValue
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required'
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!validatePhoneNumber(formData.phoneNumber.trim())) {
      newErrors.phoneNumber = 'Please enter a valid phone number (10+ digits)'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm() || !organizationId) return

    setIsSubmitting(true)
    
    try {
      // Normalize phone number using utility function
      const formattedPhone = normalizePhoneNumber(formData.phoneNumber.trim())
      
      // Double-check that normalization worked
      if (!formattedPhone || !validatePhoneNumber(formattedPhone)) {
        throw new Error('Unable to normalize phone number format')
      }

      const leadData = {
        customerName: formData.customerName.trim(),
        phoneNumber: formattedPhone,
        email: formData.email.trim() || undefined,
        leadStatus: 'new',
        leadSource: 'manual_entry'
      }

      const response = await axios.post(`${API_BASE_URL}/api/leads`, leadData, {
        headers: {
          'x-organization-id': organizationId,
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
      email: ''
    })
    setPhoneDisplayValue('')
    setErrors({})
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Add New Lead</h2>
            <p className="text-sm text-neutral-500">Create a new lead in your system</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Customer Name *
            </label>
            <Input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleInputChange('customerName', e.target.value)}
              placeholder="Enter customer name"
              error={errors.customerName}
              icon={<UserIcon className="w-4 h-4" />}
              disabled={isSubmitting}
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Phone Number *
            </label>
            <Input
              type="tel"
              value={phoneDisplayValue || formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              placeholder="(555) 123-4567"
              error={errors.phoneNumber}
              icon={<PhoneIcon className="w-4 h-4" />}
              disabled={isSubmitting}
            />
            {formData.phoneNumber && validatePhoneNumber(formData.phoneNumber) && (
              <p className="text-xs text-neutral-500 mt-1">
                Will be saved as: {normalizePhoneNumber(formData.phoneNumber)}
              </p>
            )}
          </div>

          {/* Email (Optional) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="customer@example.com (optional)"
              error={errors.email}
              icon={<EnvelopeIcon className="w-4 h-4" />}
              disabled={isSubmitting}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Creating Lead...' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

export default AddLeadModal