import { Express, Request, Response } from 'express';
import { setupSSEConnection } from '../services/realtime.service';
import { HumanControlService } from '../services/humanControl.service';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { CallSessionService } from '../services/callSession.service';
import { SMSAutomationService } from '../services/sms.service';
import { elevenLabsConfig } from '../config/elevenlabs.config';
import { logger } from '../utils/logger';
import { setupDebugRoutes } from './debug.routes';
import { setupAdminRoutes } from './admin.routes';

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
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'phoneNumber is required' });
      }
      
      logger.info('🚀 Initiating outbound call to:', phoneNumber, 'for lead:', leadId);
      
      // Check required environment variables
      if (!elevenLabsConfig.apiKey || !elevenLabsConfig.agentId || !elevenLabsConfig.phoneNumberId) {
        logger.error('❌ ElevenLabs configuration missing');
        return res.status(500).json({ 
          error: 'ElevenLabs not properly configured',
          missing: {
            apiKey: !elevenLabsConfig.apiKey,
            agentId: !elevenLabsConfig.agentId,
            phoneNumberId: !elevenLabsConfig.phoneNumberId
          }
        });
      }
      
      // Get lead data if leadId provided
      let lead = null;
      let conversationContext = '';
      
      if (leadId) {
        lead = await leadService.getLead(leadId);
        if (lead) {
          conversationContext = await conversationService.generateComprehensiveSummary(leadId);
        }
      }
      
      // Build client data that will be passed to the conversation initiation webhook
      const clientData = {
        lead_id: leadId,
        customer_phone: phoneNumber,
        initiated_by: 'agent',
        timestamp: new Date().toISOString(),
        // Add dynamic variables directly since webhook won't be called for outbound
        dynamic_variables: {
          greeting_opener: lead?.customer_name ? `Hey ${lead.customer_name}!` : "Hey there!",
          greeting_variation: "How can I help you today",
          customer_name: lead?.customer_name || '',
          customer_phone: phoneNumber,
          lead_status: lead?.status || 'new',
          conversation_context: conversationContext || 'New conversation',
          previous_summary: lead?.previous_summary || 'No previous interactions'
        }
      };
      
      // Use the correct Twilio outbound call endpoint
      const callPayload = {
        agent_id: elevenLabsConfig.agentId,
        agent_phone_number_id: elevenLabsConfig.phoneNumberId,
        to_number: phoneNumber,
        conversation_initiation_client_data: clientData
      };
      
      logger.info('📞 Making ElevenLabs API call with payload:', {
        agent_id: callPayload.agent_id,
        agent_phone_number_id: callPayload.agent_phone_number_id,
        to_number: callPayload.to_number,
        has_client_data: !!callPayload.conversation_initiation_client_data
      });
      
      // Use the Twilio outbound endpoint
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsConfig.apiKey
        },
        body: JSON.stringify(callPayload)
      });
      
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        logger.error('❌ Failed to parse ElevenLabs response:', parseError);
        const responseText = await response.text();
        return res.status(500).json({ 
          error: 'Invalid response from ElevenLabs',
          response_text: responseText.substring(0, 500)
        });
      }
      
      logger.info('📡 ElevenLabs API response status:', response.status);
      logger.info('📡 ElevenLabs API response:', result);
      
      if (!response.ok) {
        logger.error('❌ ElevenLabs API error:', {
          status: response.status,
          statusText: response.statusText,
          response: result
        });
        
        let errorMessage = 'Failed to initiate call';
        if (response.status === 401) {
          errorMessage = 'Invalid ElevenLabs API key';
        } else if (response.status === 400) {
          errorMessage = 'Invalid request parameters';
        } else if (response.status === 404) {
          errorMessage = 'Agent or phone number not found';
        }
        
        return res.status(response.status).json({ 
          error: errorMessage,
          details: result
        });
      }
      
      // Create call session if we have a lead
      if (leadId && result.conversation_id) {
        try {
          await callSessionService.createSession({
            organization_id: organizationId,
            lead_id: leadId,
            elevenlabs_conversation_id: result.conversation_id,
            status: 'initiated',
            call_type: 'outbound'
          });
        } catch (sessionError) {
          logger.error('Failed to create call session:', sessionError);
          // Don't fail the request, call was still initiated
        }
      }
      
      res.json({ 
        success: true, 
        conversation_id: result.conversation_id,
        call_sid: result.call_sid,
        message: `Call initiated to ${phoneNumber}`
      });
    } catch (error) {
      logger.error('Error initiating outbound call:', error);
      res.status(500).json({ 
        error: 'Failed to initiate call',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
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
        type: 'system',  // Use 'system' for system messages
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
      
      // Clean up stale sessions first
      await callSessionService.cleanupStaleSessions(organizationId);
      
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
  
  // Setup debug routes
  setupDebugRoutes(app);
  
  // Setup admin routes
  setupAdminRoutes(app);
  
  logger.info('API routes configured');
}