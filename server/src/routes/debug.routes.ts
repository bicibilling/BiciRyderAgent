import { Express, Request, Response } from 'express';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { SMSAutomationService } from '../services/sms.service';
import { logger } from '../utils/logger';

const leadService = new LeadService();
const conversationService = new ConversationService();
const smsService = new SMSAutomationService();

export function setupDebugRoutes(app: Express) {
  // Test SMS functionality
  app.post('/api/debug/test-sms', async (req: Request, res: Response) => {
    try {
      const { phoneNumber, message } = req.body;
      const organizationId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      logger.info('DEBUG: Testing SMS functionality:', { phoneNumber, message });
      
      // Check if lead exists
      const lead = await leadService.findLeadByPhone(phoneNumber, organizationId);
      logger.info('DEBUG: Lead lookup result:', { 
        phone: phoneNumber,
        normalized: phoneNumber.replace(/\D/g, ''),
        found: !!lead,
        lead_id: lead?.id 
      });
      
      // Send SMS
      let result, error;
      try {
        result = await smsService.sendSMS(phoneNumber, message, organizationId);
      } catch (e) {
        error = e;
        logger.error('DEBUG: Detailed SMS error:', e);
      }
      
      // Get recent conversations for this lead
      if (lead) {
        const conversations = await conversationService.getRecentConversations(lead.id, 5);
        logger.info('DEBUG: Recent conversations after SMS:', conversations);
      }
      
      res.json({
        success: !error,
        lead_found: !!lead,
        lead_id: lead?.id,
        sms_sent: !!result,
        message_sid: result?.sid,
        error: error ? error.message : null,
        error_details: error ? error.toString() : null
      });
    } catch (error) {
      logger.error('DEBUG: SMS test error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Test webhook endpoint (for Twilio to call)
  app.get('/api/debug/webhook-test', (req: Request, res: Response) => {
    logger.info('DEBUG: Webhook test endpoint called:', {
      query: req.query,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
    res.json({ 
      success: true, 
      message: 'Webhook endpoint is reachable',
      timestamp: new Date().toISOString()
    });
  });
  
  // Check lead data
  app.get('/api/debug/lead/:phone', async (req: Request, res: Response) => {
    try {
      const { phone } = req.params;
      const organizationId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead = await leadService.findLeadByPhone(phone, organizationId);
      const conversations = lead ? await conversationService.getRecentConversations(lead.id, 10) : [];
      
      res.json({
        phone_searched: phone,
        normalized: phone.replace(/\D/g, ''),
        lead_found: !!lead,
        lead: lead,
        conversation_count: conversations.length,
        recent_conversations: conversations
      });
    } catch (error) {
      logger.error('DEBUG: Lead check error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Simulate incoming SMS (for testing without Twilio)
  app.post('/api/debug/simulate-sms', async (req: Request, res: Response) => {
    try {
      const { from, message } = req.body;
      
      // Simulate Twilio webhook format
      const simulatedWebhookBody = {
        From: from,
        To: process.env.TWILIO_PHONE_NUMBER,
        Body: message,
        MessageSid: 'SMS_DEBUG_' + Date.now()
      };
      
      // Import and call the webhook handler directly
      const { handleIncomingSMS } = await import('../webhooks/twilio.webhook');
      
      // Create mock request/response
      const mockReq = {
        body: simulatedWebhookBody,
        headers: {},
        originalUrl: '/webhooks/twilio/sms'
      } as Request;
      
      const mockRes = {
        status: (code: number) => ({ send: (msg: string) => msg }),
        send: (msg: string) => msg
      } as any;
      
      await handleIncomingSMS(mockReq, mockRes);
      
      res.json({
        success: true,
        simulated_webhook: simulatedWebhookBody,
        message: 'Simulated incoming SMS processed'
      });
    } catch (error) {
      logger.error('DEBUG: SMS simulation error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  logger.info('Debug routes configured');
}