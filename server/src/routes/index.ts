import { Express, Request, Response } from 'express';
import { setupSSEConnection } from '../services/realtime.service';
import { HumanControlService } from '../services/humanControl.service';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { CallSessionService } from '../services/callSession.service';
import { SMSAutomationService } from '../services/sms.service';
import { elevenLabsConfig } from '../config/elevenlabs.config';
import { logger } from '../utils/logger';

const humanControlService = new HumanControlService();
const leadService = new LeadService();
const conversationService = new ConversationService();
const callSessionService = new CallSessionService();
const smsService = new SMSAutomationService();

export function setupAPIRoutes(app: Express) {
  logger.info('Setting up API routes');
  
  // SSE endpoint for real-time updates
  app.get('/api/stream/:clientId', (req: Request, res: Response) => {
    const { clientId } = req.params;
    setupSSEConnection(clientId, res);
  });
  
  // Lead management endpoints
  app.get('/api/leads', async (req: Request, res: Response) => {
    try {
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      logger.info('Fetching leads for organization:', { organizationId });
      
      const supabaseModule = await import('../config/supabase.config');
      const { data, error } = await supabaseModule.supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      logger.info('Found leads:', { count: data?.length || 0, leads: data });
      res.json(data);
    } catch (error) {
      logger.error('Error fetching leads:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
    }
  });
  
  app.get('/api/leads/:id', async (req: Request, res: Response) => {
    try {
      const lead = await leadService.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      res.json(lead);
    } catch (error) {
      logger.error('Error fetching lead:', error);
      res.status(500).json({ error: 'Failed to fetch lead' });
    }
  });
  
  // Conversation endpoints
  app.get('/api/conversations/:leadId', async (req: Request, res: Response) => {
    try {
      const conversations = await conversationService.getRecentConversations(req.params.leadId, 50);
      res.json(conversations);
    } catch (error) {
      logger.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });
  
  // Human control endpoints
  app.post('/api/human-control/join', async (req: Request, res: Response) => {
    try {
      const { leadId, agentName } = req.body;
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const session = await humanControlService.joinConversation(
        leadId,
        agentName || 'Agent',
        organizationId
      );
      
      res.json({ success: true, session });
    } catch (error) {
      logger.error('Error joining conversation:', error);
      res.status(500).json({ error: 'Failed to join conversation' });
    }
  });
  
  app.post('/api/human-control/leave', async (req: Request, res: Response) => {
    try {
      const { leadId } = req.body;
      await humanControlService.leaveConversation(leadId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error leaving conversation:', error);
      res.status(500).json({ error: 'Failed to leave conversation' });
    }
  });
  
  app.post('/api/human-control/send-message', async (req: Request, res: Response) => {
    try {
      const { leadId, message, phoneNumber } = req.body;
      await humanControlService.sendHumanMessage(leadId, message, phoneNumber);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error sending human message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });
  
  // Outbound call endpoint
  app.post('/api/elevenlabs/outbound-call', async (req: Request, res: Response) => {
    try {
      const { phoneNumber, leadId } = req.body;
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      // Get lead data
      const lead = await leadService.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      // Build context
      const conversationContext = await conversationService.generateComprehensiveSummary(leadId);
      
      // Make call via ElevenLabs
      const response = await fetch(`${elevenLabsConfig.endpoints.phoneCall}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsConfig.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: elevenLabsConfig.agentId,
          agent_phone_number_id: elevenLabsConfig.phoneNumberId,
          to_number: phoneNumber,
          conversation_initiation_client_data: {
            dynamic_variables: {
              conversation_context: conversationContext,
              customer_name: lead.customer_name || 'valued customer',
              customer_phone: phoneNumber,
              lead_status: lead.status,
              organization_name: 'BICI Bike Store',
              organization_id: organizationId
            }
          }
        })
      });
      
      const result = await response.json() as any;
      
      // Create call session
      await callSessionService.createSession({
        organization_id: organizationId,
        lead_id: leadId,
        elevenlabs_conversation_id: result.conversation_id,
        status: 'initiated'
      });
      
      res.json({ success: true, conversation_id: result.conversation_id });
    } catch (error) {
      logger.error('Error initiating outbound call:', error);
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  });
  
  // Send context update to ElevenLabs during active call
  app.post('/api/elevenlabs/context-update', async (req: Request, res: Response) => {
    try {
      const { leadId, context, type = 'contextual' } = req.body;
      
      // Get active session for the lead
      const session = await callSessionService.getActiveSession(leadId);
      if (!session || !session.elevenlabs_conversation_id) {
        return res.status(404).json({ error: 'No active call session' });
      }
      
      // Send context update to ElevenLabs
      // This would be sent via WebSocket or their API if they support it
      logger.info('Context update requested:', { 
        leadId, 
        conversationId: session.elevenlabs_conversation_id,
        type,
        context 
      });
      
      // Store as system message for tracking
      await conversationService.storeConversation({
        organization_id: session.organization_id,
        lead_id: leadId,
        phone_number_normalized: '',
        content: `[Context Update] ${context}`,
        sent_by: 'system',
        type: 'text',
        metadata: {
          context_type: type,
          during_call: true
        }
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error sending context update:', error);
      res.status(500).json({ error: 'Failed to send context update' });
    }
  });
  
  // Send SMS endpoint
  app.post('/api/sms/send', async (req: Request, res: Response) => {
    try {
      const { phoneNumber, message } = req.body;
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      await smsService.sendSMS(phoneNumber, message, organizationId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error sending SMS:', error);
      res.status(500).json({ error: 'Failed to send SMS' });
    }
  });
  
  // Dashboard stats endpoint
  app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      const { supabase } = await import('../config/supabase.config');
      
      // Get counts
      const [leads, calls, conversations, activeCalls] = await Promise.all([
        supabase.from('leads').select('count').eq('organization_id', organizationId),
        supabase.from('call_sessions').select('count').eq('organization_id', organizationId),
        supabase.from('conversations').select('count').eq('organization_id', organizationId),
        supabase.from('call_sessions')
          .select('count')
          .eq('organization_id', organizationId)
          .in('status', ['initiated', 'active'])
      ]);
      
      // Count both human control sessions and active calls
      const humanSessions = humanControlService.getActiveSessions().length;
      const activeCallSessions = activeCalls.data?.[0]?.count || 0;
      
      res.json({
        total_leads: leads.data?.[0]?.count || 0,
        total_calls: calls.data?.[0]?.count || 0,
        total_conversations: conversations.data?.[0]?.count || 0,
        active_sessions: humanSessions + activeCallSessions
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });
  
  logger.info('API routes configured');
}