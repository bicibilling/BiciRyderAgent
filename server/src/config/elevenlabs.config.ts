import { logger } from '../utils/logger';

// Validate ElevenLabs configuration
if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID) {
  logger.error('Missing ElevenLabs configuration');
  throw new Error('ElevenLabs configuration is required');
}

export const elevenLabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY!,
  agentId: process.env.ELEVENLABS_AGENT_ID!,
  phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID!,
  webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET!,
  
  // API endpoints
  endpoints: {
    conversations: 'https://api.elevenlabs.io/v1/convai/conversations',
    phoneCall: 'https://api.elevenlabs.io/v1/convai/conversations/phone',
    transfer: (conversationId: string) => 
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/transfer`
  },
  
  // Default agent configuration
  agentConfig: {
    voice: 'professional',
    language: 'en-US',
    temperature: 0.7,
    maxResponseLength: 200
  }
};

// Business hours configuration for BICI
export const businessHours = {
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '20:00' },
  friday: { open: '09:00', close: '20:00' },
  saturday: { open: '10:00', close: '17:00' },
  sunday: { open: 'closed', close: 'closed' }
};

// Store information - configurable via environment variables
export const storeInfo = {
  name: process.env.STORE_NAME || 'BICI Bike Store',
  address: process.env.STORE_ADDRESS || '1234 Main Street, Vancouver, BC V6B 2W9',  // Default Vancouver address
  phone: process.env.TWILIO_PHONE_NUMBER!,
  email: process.env.STORE_EMAIL || 'info@bici.cc',
  website: process.env.STORE_WEBSITE || 'https://www.bici.cc',
  services: [
    'Bike Sales (Road, Mountain, Hybrid, E-Bikes)',
    'Professional Bike Repairs',
    'Custom Bike Builds',
    'Bike Fitting Services',
    'Bike Rentals'
  ]
};