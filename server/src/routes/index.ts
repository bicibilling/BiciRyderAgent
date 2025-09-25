import { Express, Request, Response } from 'express';
import { setupSSEConnection, getCachedDashboardStats, getCachedDashboardLeads, invalidateDashboardCache } from '../services/realtime.service';
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
      
      // Try cached leads first
      const leads = await getCachedDashboardLeads(organizationId);
      
      logger.info('Found leads:', { count: leads?.length || 0, cached: true });
      res.json(leads || []);
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
      let previousSummary = null;
      let previousSummaryObj = null;
      
      if (leadId) {
        lead = await leadService.getLead(leadId);
        if (lead) {
          // Import the buildConversationContext function to get proper context
          const { buildConversationContext } = await import('../webhooks/elevenlabs.webhook');
          conversationContext = await buildConversationContext(leadId);
          
          // Also get the most recent summary for a brief overview
          const summaries = await conversationService.getAllSummaries(leadId);
          if (summaries && summaries.length > 0) {
            previousSummaryObj = summaries[0];
            previousSummary = summaries[0].summary;
          } else {
            previousSummary = 'No previous interactions';
          }
        }
      }
      
      // Get current Pacific time for the agent
      const getCurrentPacificTime = () => {
        const now = new Date();
        const pacificTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        const hours = pacificTime.getHours();
        const minutes = pacificTime.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const timeString = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][pacificTime.getDay()];
        return { timeString, dayOfWeek, pacificTime };
      };
      
      const { timeString: currentTime, dayOfWeek, pacificTime } = getCurrentPacificTime();
      
      // Dynamic business hours based on current time
      const getBusinessHoursMessage = () => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = days[pacificTime.getDay()];
        const hours = { open: '09:00', close: '18:00' }; // Default hours
        
        const currentHour = pacificTime.getHours();
        const currentMinute = pacificTime.getMinutes();
        const currentTimeNum = currentHour * 100 + currentMinute;
        
        if (currentTimeNum >= 900 && currentTimeNum < 1800) {
          return `Open now until 6:00 PM (current time: ${currentTime} PT)`;
        } else if (currentTimeNum < 900) {
          return `Opens at 9:00 AM today (current time: ${currentTime} PT)`;
        } else {
          return `Closed for today. Opens tomorrow at 9:00 AM (current time: ${currentTime} PT)`;
        }
      };
      
      // Import greeting helper for outbound-specific greetings
      const { generateGreetingContext } = await import('../utils/greeting.helper');
      
      // Log the summary object for debugging
      logger.info('Generating outbound greeting with summary:', {
        hasSummary: !!previousSummaryObj,
        classification: previousSummaryObj?.call_classification,
        summaryText: previousSummaryObj?.summary?.substring(0, 100)
      });
      
      // Generate outbound-specific greeting context
      const greetingContext = generateGreetingContext(lead, true, previousSummaryObj);
      
      // Log the generated greeting
      logger.info('Generated outbound greeting:', {
        greeting_opener: greetingContext.greeting_opener,
        greeting_variation: greetingContext.greeting_variation
      });
      
      // Build client data that will be passed to the conversation initiation webhook
      const clientData = {
        lead_id: leadId,
        customer_phone: phoneNumber,
        initiated_by: 'agent',
        timestamp: new Date().toISOString(),
        // Add dynamic variables directly since webhook won't be called for outbound
        dynamic_variables: {
          customer_name: lead?.customer_name || '',
          customer_phone: phoneNumber,
          lead_status: lead?.status || 'new',
          conversation_context: conversationContext || 'This is the first interaction with this customer.',
          previous_summary: previousSummary || 'No previous interactions',
          bike_interest: JSON.stringify(lead?.bike_interest || {}),
          organization_name: 'BICI Bike Store',
          organization_id: organizationId,
          location_address: '1497 Adanac Street, Vancouver, BC',
          business_hours: getBusinessHoursMessage(),
          current_time: currentTime,
          current_day: dayOfWeek,
          current_datetime: `${dayOfWeek} ${currentTime} Pacific Time`,
          has_customer_name: lead?.customer_name ? 'true' : 'false',
          // Add all greeting context variables for outbound calls
          ...greetingContext
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
      
      // Try cached dashboard stats first
      const stats = await getCachedDashboardStats(organizationId);
      
      if (stats) {
        res.json(stats);
      } else {
        res.status(500).json({ error: 'Failed to fetch stats' });
      }
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });
  
  // Cache invalidation endpoint for dashboard (admin use)
  app.post('/api/dashboard/invalidate-cache', async (req: Request, res: Response) => {
    try {
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      await invalidateDashboardCache(organizationId);
      
      res.json({ success: true, message: 'Dashboard cache invalidated' });
    } catch (error) {
      logger.error('Error invalidating dashboard cache:', error);
      res.status(500).json({ error: 'Failed to invalidate cache' });
    }
  });
  
  // Transfer number management endpoints
  // Get current transfer number
  app.get('/api/agent/transfer-number', async (req: Request, res: Response) => {
    try {
      const axios = (await import('axios')).default;
      const agentId = process.env.ELEVENLABS_AGENT_ID;
      const apiKey = process.env.ELEVENLABS_API_KEY;

      if (!agentId || !apiKey) {
        return res.status(400).json({
          error: 'Missing ElevenLabs configuration'
        });
      }

      // Get current agent configuration from ElevenLabs
      const currentAgentResponse = await axios.get(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
        headers: { 'xi-api-key': apiKey }
      });

      const currentConfig = currentAgentResponse.data;

      // Find transfer tool in the tools array
      const currentTools = currentConfig.conversation_config?.agent?.prompt?.tools || [];
      const transferTool = currentTools.find((tool: any) => tool.name === 'transfer_to_number');

      const transferNumber = transferTool?.params?.transfers?.[0]?.phone_number || 'Not configured';

      res.json({
        success: true,
        current_transfer_number: transferNumber
      });
    } catch (error) {
      logger.error('Error fetching transfer number:', error);
      res.status(500).json({ error: 'Failed to fetch transfer number' });
    }
  });

  // Update transfer number
  app.post('/api/agent/update-transfer-number', async (req: Request, res: Response) => {
    try {
      const { phone_number } = req.body;
      const axios = (await import('axios')).default;
      const fs = (await import('fs')).default;
      const path = (await import('path')).default;

      if (!phone_number) {
        return res.status(400).json({
          error: 'Phone number is required'
        });
      }

      // Validate E.164 format
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(phone_number)) {
        return res.status(400).json({
          error: 'Phone number must be in E.164 format (e.g., +17787193080)'
        });
      }

      const agentId = process.env.ELEVENLABS_AGENT_ID;
      const apiKey = process.env.ELEVENLABS_API_KEY;

      if (!agentId || !apiKey) {
        return res.status(400).json({
          error: 'Missing ElevenLabs configuration'
        });
      }

      logger.info(`📞 Updating transfer number via ElevenLabs PATCH API to: ${phone_number}`);

      // Get current agent configuration from ElevenLabs
      const currentAgentResponse = await axios.get(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
        headers: { 'xi-api-key': apiKey }
      });

      const currentConfig = currentAgentResponse.data;

      // Find and update transfer_to_number tool in agent.prompt.tools array
      const currentTools = currentConfig.conversation_config?.agent?.prompt?.tools || [];
      const transferToolIndex = currentTools.findIndex((tool: any) => tool.name === 'transfer_to_number');

      if (transferToolIndex === -1) {
        return res.status(500).json({
          error: 'Transfer tool not found in live agent',
          message: 'transfer_to_number tool not found in agent.prompt.tools array'
        });
      }

      const currentTransferTool = currentTools[transferToolIndex];
      const previousNumber = currentTransferTool.params?.transfers?.[0]?.phone_number || 'none';

      logger.info(`📞 Found transfer tool in agent.prompt.tools array`);
      logger.info(`📞 Current transfer number: ${previousNumber}`);

      // Create updated tools array with new transfer number
      const updatedTools = [...currentTools];
      updatedTools[transferToolIndex] = {
        ...currentTransferTool,
        params: {
          ...currentTransferTool.params,
          transfers: [{
            ...currentTransferTool.params.transfers[0],
            phone_number: phone_number,
            transfer_destination: {
              ...currentTransferTool.params.transfers[0].transfer_destination,
              phone_number: phone_number
            }
          }]
        }
      };

      const patchPayload = {
        conversation_config: {
          ...currentConfig.conversation_config,
          agent: {
            ...currentConfig.conversation_config.agent,
            prompt: {
              ...currentConfig.conversation_config.agent.prompt,
              tools: updatedTools
            }
          }
        }
      };

      // Update agent via PATCH API
      const patchResponse = await axios.patch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
        patchPayload,
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('✅ Transfer number updated successfully via PATCH API');
      logger.info(`✅ Response status: ${patchResponse.status}`);

      // Update local agent config files
      try {
        const configFiles = [
          '/Users/divhit/bici/agent_configs/ryder_-_bici_ai_teammate.json',
          '/Users/divhit/bici/agent_configs/bike_agent.json',
          '/Users/divhit/bici/agent_configs/sales_agent.json'
        ];

        for (const configPath of configFiles) {
          if (fs.existsSync(configPath)) {
            const localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // Update built_in_tools section in local config (different structure than live API)
            if (localConfig.conversation_config?.agent?.built_in_tools?.transfer_to_number) {
              localConfig.conversation_config.agent.built_in_tools.transfer_to_number.params.transfers[0].phone_number = phone_number;
              localConfig.conversation_config.agent.built_in_tools.transfer_to_number.params.transfers[0].transfer_destination.phone_number = phone_number;
              fs.writeFileSync(configPath, JSON.stringify(localConfig, null, 4));
              logger.info(`📝 Updated local config: ${path.basename(configPath)}`);
            }
          }
        }
      } catch (localUpdateError) {
        logger.warn('⚠️ Could not update local config files, but live agent is updated:', localUpdateError);
      }

      res.json({
        success: true,
        message: 'Transfer phone number updated and deployed immediately via ElevenLabs PATCH API',
        previous_number: previousNumber,
        new_number: phone_number,
        api_response: patchResponse.status,
        updated_at: patchResponse.data?.metadata?.updated_at_unix_secs || Date.now(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Transfer number update error:', error);

      // Enhanced error reporting for API issues
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        return res.status(500).json({
          error: 'ElevenLabs API error',
          status: axiosError.response?.status,
          message: axiosError.response?.data?.message || 'Unknown API error'
        });
      }

      res.status(500).json({
        error: 'Failed to update transfer number',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Setup debug routes
  setupDebugRoutes(app);

  // Setup admin routes
  setupAdminRoutes(app);

  logger.info('API routes configured');
}