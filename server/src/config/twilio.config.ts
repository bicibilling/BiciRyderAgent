import twilio from 'twilio';
import { logger } from '../utils/logger';

// Validate Twilio configuration
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  logger.error('Missing Twilio configuration');
  throw new Error('Twilio configuration is required');
}

// Create Twilio client
export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Twilio configuration
export const twilioConfig = {
  phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  
  // Native ElevenLabs integration - no voice webhook needed
  voiceWebhook: '', 
  
  // SMS webhooks for your backend
  smsWebhook: `${process.env.WEBHOOK_BASE_URL}/webhooks/twilio/sms`,
  smsStatusCallback: `${process.env.WEBHOOK_BASE_URL}/webhooks/twilio/sms/status`,
  
  // Capabilities
  capabilities: {
    voice: true,
    sms: true,
    mms: false
  }
};

// Helper function to format phone numbers
export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Add country code if missing
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  return phone;
}

// Helper function to normalize phone numbers for database storage
export function normalizePhoneNumber(phone: string): string {
  const formatted = formatPhoneNumber(phone);
  // Remove + for storage
  return formatted.replace(/^\+/, '');
}