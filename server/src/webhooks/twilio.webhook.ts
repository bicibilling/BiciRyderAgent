import { Request, Response } from 'express';
import twilio from 'twilio';
import { logger } from '../utils/logger';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { HumanControlService } from '../services/humanControl.service';
import { SMSAutomationService } from '../services/sms.service';
import { broadcastToClients } from '../services/realtime.service';
import { normalizePhoneNumber } from '../config/twilio.config';

const leadService = new LeadService();
const conversationService = new ConversationService();
const humanControlService = new HumanControlService();
const smsService = new SMSAutomationService();

// Verify Twilio webhook signature
function verifyTwilioSignature(req: Request): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  
  const signature = req.headers['x-twilio-signature'] as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const url = `${process.env.WEBHOOK_BASE_URL}${req.originalUrl}`;
  
  return twilio.validateRequest(
    authToken,
    signature,
    url,
    req.body
  );
}

export async function handleIncomingSMS(req: Request, res: Response) {
  try {
    const { From, To, Body, MessageSid } = req.body;
    
    logger.info('Incoming SMS received:', { 
      from: From, 
      to: To, 
      messageSid: MessageSid 
    });
    
    // Verify signature
    if (!verifyTwilioSignature(req)) {
      logger.error('Invalid Twilio signature');
      return res.status(403).send('Forbidden');
    }
    
    // Get organization from To number
    const organization = await leadService.getOrganizationByPhone(To);
    if (!organization) {
      logger.error('No organization found for number:', To);
      return res.status(404).send('Organization not found');
    }
    
    // Get or create lead
    const lead = await leadService.findOrCreateLead(From, organization.id);
    
    // Store incoming message
    await conversationService.storeConversation({
      organization_id: organization.id,
      lead_id: lead.id,
      phone_number: From, // Required field
      phone_number_normalized: From.replace(/\D/g, ''),
      content: Body,
      sent_by: 'user',
      type: 'sms',
      metadata: { message_sid: MessageSid }
    });
    
    // Check if under human control
    if (await humanControlService.isUnderHumanControl(lead.id)) {
      // Queue for human agent
      await humanControlService.queueMessage(lead.id, Body);
      
      // Broadcast to dashboard
      broadcastToClients({
        type: 'sms_received_human_queue',
        lead_id: lead.id,
        message: Body,
        phone_number: From
      });
      
      logger.info('SMS queued for human agent:', { lead_id: lead.id });
      return res.status(200).send('Queued for human agent');
    }
    
    // Process with AI (simplified response for now)
    const aiResponse = await generateAIResponse(Body, lead);
    
    // Send SMS reply
    await smsService.sendSMS(From, aiResponse, organization.id);
    
    // Broadcast to dashboard
    broadcastToClients({
      type: 'sms_received',
      lead_id: lead.id,
      message: Body,
      phone_number: From,
      ai_response: aiResponse
    });
    
    res.status(200).send('Message processed');
  } catch (error) {
    logger.error('Error handling incoming SMS:', error);
    res.status(500).send('Internal Server Error');
  }
}

export async function handleSMSStatus(req: Request, res: Response) {
  try {
    const { MessageSid, MessageStatus, To } = req.body;
    
    logger.info('SMS status update:', { 
      messageSid: MessageSid, 
      status: MessageStatus,
      to: To 
    });
    
    // Update SMS status in database if needed
    // This can be used for delivery confirmation
    
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error handling SMS status:', error);
    res.status(500).send('Internal Server Error');
  }
}

// Generate AI response (simplified version)
async function generateAIResponse(message: string, lead: any): Promise<string> {
  const lowerMessage = message.toLowerCase();
  
  // Simple pattern matching for common queries
  if (lowerMessage.includes('hours') || lowerMessage.includes('open')) {
    return `Hi! BICI is open Monday-Wednesday 9am-6pm, Thursday-Friday 9am-8pm, Saturday 10am-5pm, and closed Sunday. How can we help you today?`;
  }
  
  if (lowerMessage.includes('location') || lowerMessage.includes('address')) {
    return `We're located at 123 Bike Street, Montreal, QC H2X 1Y7. Here's a map link: https://maps.google.com/?q=BICI+Bike+Store`;
  }
  
  if (lowerMessage.includes('repair') || lowerMessage.includes('service')) {
    return `We offer professional bike repairs and servicing! Please call us at ${process.env.TWILIO_PHONE_NUMBER} to schedule an appointment or bring your bike in during business hours.`;
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
    return `We have bikes for every budget! Road bikes start at $800, mountain bikes from $600, and e-bikes from $1,500. Visit us to see our full selection or call for specific models.`;
  }
  
  // Default response
  return `Thanks for your message! For immediate assistance, please call us at ${process.env.TWILIO_PHONE_NUMBER}. We're here to help with all your cycling needs!`;
}