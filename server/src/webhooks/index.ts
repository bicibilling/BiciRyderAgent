import { Express } from 'express';
import { 
  handleConversationInitiation, 
  handlePostCall, 
  handleConversationEvents,
  handleClientEvents 
} from './elevenlabs.webhook';
import { 
  handleIncomingSMS, 
  handleSMSStatus 
} from './twilio.webhook';
import { logger } from '../utils/logger';

export function setupWebhooks(app: Express) {
  logger.info('Setting up webhook endpoints');
  
  // ElevenLabs webhooks
  app.post('/webhooks/elevenlabs/conversation-initiation', handleConversationInitiation);
  app.post('/webhooks/elevenlabs/post-call', handlePostCall);
  app.post('/webhooks/elevenlabs/conversation-events', handleConversationEvents);
  app.post('/webhooks/elevenlabs/client-events', handleClientEvents);
  
  // Twilio webhooks
  app.post('/webhooks/twilio/sms', handleIncomingSMS);
  app.post('/webhooks/twilio/sms/status', handleSMSStatus);
  
  logger.info('Webhook endpoints configured');
}