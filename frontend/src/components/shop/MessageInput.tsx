import React, { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  PaperAirplaneIcon,
  FaceSmileIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  maxLength?: number
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
  maxLength = 1600 // SMS limit
}) => {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= maxLength) {
      setMessage(value)
      adjustTextareaHeight()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSendMessage = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isSending || disabled) return

    // Validation
    if (trimmedMessage.length > maxLength) {
      toast.error(`Message too long (max ${maxLength} characters)`)
      return
    }

    try {
      setIsSending(true)
      await onSendMessage(trimmedMessage)
      setMessage('')
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const isDisabled = disabled || isSending
  const canSend = message.trim().length > 0 && !isDisabled

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-neutral-200 shadow-sm"
    >
      {/* Input Area */}
      <div className="flex items-end space-x-3 p-4">
        {/* Attachment Button (Future Enhancement) */}
        <Button
          variant="ghost"
          size="sm"
          icon={<PlusIcon />}
          disabled={isDisabled}
          className="flex-shrink-0 self-end mb-1"
          onClick={() => toast('Attachments coming soon!')}
        />

        {/* Message Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            className={`
              w-full resize-none rounded-lg border-0 bg-neutral-50 px-4 py-3 text-sm
              placeholder:text-neutral-500 focus:bg-white focus:ring-2 focus:ring-primary-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
            `}
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          
          {/* Character Counter */}
          <div className="absolute bottom-1 right-2 text-xs text-neutral-400">
            {message.length}/{maxLength}
          </div>
        </div>

        {/* Emoji Button (Future Enhancement) */}
        <Button
          variant="ghost"
          size="sm"
          icon={<FaceSmileIcon />}
          disabled={isDisabled}
          className="flex-shrink-0 self-end mb-1"
          onClick={() => toast('Emoji picker coming soon!')}
        />

        {/* Send Button */}
        <Button
          variant={canSend ? 'primary' : 'secondary'}
          size="sm"
          icon={<PaperAirplaneIcon />}
          onClick={handleSendMessage}
          loading={isSending}
          disabled={!canSend}
          className="flex-shrink-0 self-end mb-1"
        >
          Send
        </Button>
      </div>

      {/* Message Hints */}
      {message.length === 0 && !disabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3"
        >
          <div className="flex flex-wrap gap-2">
            {[
              "Thanks for your interest!",
              "Let me help you with that.",
              "I'll connect you with a specialist.",
              "What specific model are you looking for?"
            ].map((hint, index) => (
              <button
                key={index}
                onClick={() => setMessage(hint)}
                className="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-md transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Validation Messages */}
      {message.length > maxLength * 0.9 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 pb-2"
        >
          <p className={`text-xs ${message.length > maxLength ? 'text-red-500' : 'text-yellow-600'}`}>
            {message.length > maxLength 
              ? `Message exceeds ${maxLength} character limit`
              : `Approaching character limit (${maxLength - message.length} remaining)`
            }
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

export default MessageInput