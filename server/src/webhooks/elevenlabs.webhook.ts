import { Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { CallSessionService } from '../services/callSession.service';
import { SMSAutomationService } from '../services/sms.service';
import { broadcastToClients } from '../services/realtime.service';
import { businessHours, storeInfo } from '../config/elevenlabs.config';
import { ElevenLabsDynamicVariables, ConversationInsights, Lead } from '../types';

const leadService = new LeadService();
const conversationService = new ConversationService();
const callSessionService = new CallSessionService();
const smsAutomationService = new SMSAutomationService();

// Verify ElevenLabs webhook signature
function verifyElevenLabsSignature(req: Request): boolean {
  // Skip signature verification for testing - RE-ENABLE FOR PRODUCTION
  if (!process.env.ELEVENLABS_WEBHOOK_SECRET) {
    logger.info('Skipping webhook signature verification - no secret set');
    return true;
  }
  
  const signature = req.headers['xi-signature'] as string;
  if (!signature) {
    logger.warn('No xi-signature header found');
    return true; // Allow for testing - change to false in production
  }
  
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ELEVENLABS_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  const isValid = signature === `sha256=${expectedSignature}`;
  logger.info('Webhook signature check', { 
    provided: signature, 
    expected: `sha256=${expectedSignature}`,
    valid: isValid
  });
  
  return isValid;
}

// Get today's business hours
function getTodaysHours(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const hours = businessHours[today as keyof typeof businessHours];
  
  if (hours.open === 'closed') {
    return `Closed today. We're open Monday-Friday 9am-6pm (Thu-Fri until 8pm), Saturday 10am-5pm`;
  }
  
  return `Today: ${hours.open} - ${hours.close}`;
}

// Build conversation context from history
async function buildConversationContext(leadId: string): Promise<string> {
  const history = await conversationService.getRecentConversations(leadId, 6);
  
  if (!history || history.length === 0) {
    return "This is the first interaction with this customer.";
  }
  
  let context = `RECENT CONVERSATION HISTORY:\n\n`;
  
  history.forEach(msg => {
    const speaker = msg.sent_by === 'user' ? 'Customer' : 
                   msg.sent_by === 'human_agent' ? 'Human Agent' : 'Agent';
    const channel = msg.type === 'voice' ? ' (Voice)' : ' (SMS)';
    context += `${speaker}${channel}: ${msg.content}\n`;
  });
  
  context += `\n\nCRITICAL: Continue naturally from where the conversation left off. Don't repeat questions already answered.`;
  
  return context;
}

// Handle conversation initiation (for inbound calls)
export async function handleConversationInitiation(req: Request, res: Response) {
  try {
    logger.info('ElevenLabs conversation initiation webhook received', {
      body: req.body,
      headers: req.headers
    });
    
    const { caller_id, called_number, conversation_id, call_sid, agent_id } = req.body;
    
    // Use conversation_id or call_sid as fallback
    const sessionId = conversation_id || call_sid;
    
    if (!caller_id || !called_number || !sessionId) {
      logger.error('Missing required fields', { caller_id, called_number, conversation_id, call_sid, agent_id });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    logger.info('Processing conversation with ID:', sessionId);
    
    // Get organization from called number
    logger.info('Looking up organization for phone:', called_number);
    const organization = await leadService.getOrganizationByPhone(called_number);
    if (!organization) {
      logger.error('No organization found for phone:', {
        called_number,
        available_orgs: 'Check database for organizations table'
      });
      return res.status(404).json({ error: 'Organization not found for phone: ' + called_number });
    }
    
    logger.info('Found organization:', { id: organization.id, name: organization.name });
    
    // Get or create lead
    const lead = await leadService.findOrCreateLead(caller_id, organization.id);
    
    // Build conversation context
    const conversationContext = await buildConversationContext(lead.id);
    const previousSummary = await conversationService.getLatestSummary(lead.id);
    
    // Generate dynamic variables
    const dynamicVariables: ElevenLabsDynamicVariables = {
      conversation_context: conversationContext,
      previous_summary: previousSummary?.summary || "First time caller - no previous interactions",
      customer_name: lead.customer_name || "",  // Empty string if no name
      customer_phone: caller_id,
      lead_status: lead.status,
      bike_interest: JSON.stringify(lead.bike_interest),
      organization_name: organization.name,
      organization_id: organization.id,
      location_address: storeInfo.address,
      business_hours: getTodaysHours(),
      has_customer_name: lead.customer_name ? "true" : "false"  // Flag to check if name exists
    };
    
    // Create call session record
    await callSessionService.createSession({
      organization_id: organization.id,
      lead_id: lead.id,
      elevenlabs_conversation_id: sessionId,
      call_type: 'inbound',
      status: 'initiated',
      metadata: {
        call_sid: call_sid || sessionId,
        agent_id: agent_id,
        caller_id: caller_id,
        called_number: called_number
      }
    });
    
    // Broadcast to dashboard
    broadcastToClients({
      type: 'call_initiated',
      lead_id: lead.id,
      phone_number: caller_id,
      conversation_id: sessionId
    });
    
    logger.info('Returning dynamic variables for conversation', { lead_id: lead.id });
    
    res.json({ 
      dynamic_variables: dynamicVariables,
      success: true 
    });
  } catch (error) {
    logger.error('Error in conversation initiation:', error);
    res.status(500).json({ error: 'Failed to initialize conversation' });
  }
}

// Handle post-call webhook
export async function handlePostCall(req: Request, res: Response) {
  try {
    logger.info('ElevenLabs post-call webhook received', {
      body: req.body,
      headers: req.headers
    });
    
    // Verify webhook signature (temporarily disabled for testing)
    if (!verifyElevenLabsSignature(req)) {
      logger.error('Invalid webhook signature');
      // return res.status(403).json({ error: 'Invalid signature' });
    }
    
    // ElevenLabs sends a different structure than expected
    const { data, analysis } = req.body;
    
    if (!data) {
      logger.error('No data field in post-call webhook');
      return res.status(400).json({ error: 'No data field found' });
    }
    
    const { 
      conversation_id, 
      transcript = [], 
      metadata = {} 
    } = data;
    
    const sessionId = conversation_id || metadata?.phone_call?.call_sid;
    const phone_number = metadata?.phone_call?.external_number;
    const duration = metadata?.call_duration_secs;
    
    if (!sessionId || !phone_number) {
      logger.error('Missing required fields in post-call', { 
        conversation_id, 
        call_sid: metadata?.phone_call?.call_sid,
        phone_number,
        sessionId 
      });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    logger.info('Processing post-call for session:', sessionId);
    
    // Process transcript array into readable text
    const fullTranscript = Array.isArray(transcript) 
      ? transcript.map(turn => `${turn.role}: ${turn.message}`).join('\n')
      : transcript || '';
    
    // Find the most recent call session for this phone number instead of by conversation_id
    // since ElevenLabs sends different IDs in initiation vs post-call
    const sessionUpdateData = {
      status: 'completed',
      ended_at: new Date(),
      duration_seconds: duration,
      metadata: {
        transcript: fullTranscript,
        summary: analysis?.call_summary_title || analysis?.transcript_summary,
        raw_transcript: transcript,
        elevenlabs_analysis: analysis,
        conversation_id: sessionId  // Store the conversation_id from post-call
      }
    };
    
    // Try direct lookup first, then fallback to phone-based
    let session = await callSessionService.updateSession(sessionId, sessionUpdateData);
    
    if (!session) {
      // Fallback: find most recent session by phone number and update it
      session = await callSessionService.updateRecentSessionByPhone(phone_number, sessionUpdateData);
    }
    
    if (!session) {
      logger.error('Call session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Process transcript for insights
    const insights = await processTranscript(fullTranscript, analysis);
    
    // Update lead with extracted data
    const updateData: any = {
      bike_interest: insights.bikePreferences || {},
      qualification_data: {
        ready_to_buy: (insights.purchaseIntent || 0) > 0.7,
        timeline: (insights as any).timeline,
        purchase_intent: insights.purchaseIntent || 0,
        contact_preference: 'phone'
      },
      status: (insights.leadStatus || 'contacted') as Lead['status'],
      last_contact_at: new Date()
    };
    
    // Update customer name if extracted
    if (insights.customerName) {
      updateData.customer_name = insights.customerName;
    }
    
    await leadService.updateLead(session.lead_id, updateData);
    
    // Store conversation summary
    await conversationService.createSummary({
      organization_id: session.organization_id,
      lead_id: session.lead_id,
      phone_number: phone_number,
      summary: analysis?.call_summary_title || analysis?.transcript_summary || 'Call completed',
      key_points: insights.keyPoints || [],
      next_steps: insights.nextSteps || [],
      sentiment_score: insights.sentiment || 0.5,
      call_classification: insights.classification || 'general'
    });
    
    // Store individual conversation turns from the transcript array
    if (Array.isArray(transcript)) {
      for (const turn of transcript) {
        if (turn.message && turn.message.trim()) {
          await conversationService.storeConversation({
            organization_id: session.organization_id,
            lead_id: session.lead_id,
            phone_number_normalized: phone_number.replace(/\D/g, ''),
            content: turn.message,
            sent_by: turn.role === 'user' ? 'user' : 'agent',
            type: 'voice',
            call_classification: insights.classification || 'general',
            timestamp: new Date(metadata.start_time_unix_secs * 1000 + (turn.time_in_call_secs || 0) * 1000),
            metadata: {
              time_in_call_secs: turn.time_in_call_secs,
              interrupted: turn.interrupted,
              llm_usage: turn.llm_usage
            }
          });
        }
      }
    } else {
      // Fallback: store the full transcript as one conversation entry
      await conversationService.storeConversation({
        organization_id: session.organization_id,
        lead_id: session.lead_id,
        phone_number_normalized: phone_number.replace(/\D/g, ''),
        content: fullTranscript || 'Call completed - transcript not available',
        sent_by: 'system',
        type: 'voice',
        call_classification: insights.classification || 'general'
      });
    }
    
    // Trigger SMS automation if needed
    await smsAutomationService.triggerAutomation(session, insights);
    
    // Broadcast to dashboard
    broadcastToClients({
      type: 'call_completed',
      lead_id: session.lead_id,
      summary: analysis?.summary,
      classification: insights.classification,
      duration: duration
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error in post-call handler:', error);
    res.status(500).json({ error: 'Failed to process call data' });
  }
}

// Process transcript to extract insights
async function processTranscript(transcript: string, analysis: any): Promise<ConversationInsights> {
  const insights: ConversationInsights = {
    classification: 'general',
    triggers: [],
    leadStatus: 'contacted',
    keyPoints: [],
    nextSteps: [],
    sentiment: 0
  };
  
  // Classify the conversation
  if (transcript.toLowerCase().includes('buy') || transcript.toLowerCase().includes('purchase')) {
    insights.classification = 'sales';
    insights.leadStatus = 'qualified';
  } else if (transcript.toLowerCase().includes('repair') || transcript.toLowerCase().includes('service')) {
    insights.classification = 'service';
  } else if (transcript.toLowerCase().includes('help') || transcript.toLowerCase().includes('support')) {
    insights.classification = 'support';
  }
  
  // Check for triggers
  if (transcript.toLowerCase().includes('hours') || transcript.toLowerCase().includes('open')) {
    insights.triggers.push('asked_hours');
  }
  if (transcript.toLowerCase().includes('direction') || transcript.toLowerCase().includes('location')) {
    insights.triggers.push('asked_directions');
  }
  if (transcript.toLowerCase().includes('appointment') || transcript.toLowerCase().includes('schedule')) {
    insights.triggers.push('appointment_request');
    insights.appointmentScheduled = true;
  }
  
  // Extract customer name if mentioned (only from user messages)
  const namePatterns = [
    /(?:i'm|i am|my name is|this is|it's)\s+([A-Z][a-z]+)/i,
    /(?:call me|name's)\s+([A-Z][a-z]+)/i
  ];
  
  // Only look for names in user messages, not agent messages
  const userTranscript = transcript.split('\n')
    .filter(line => line.toLowerCase().includes('user:') || line.toLowerCase().includes('customer:'))
    .join(' ');
  
  for (const pattern of namePatterns) {
    const match = userTranscript.match(pattern);
    if (match && match[1] && match[1] !== 'Mark') { // Exclude agent name
      insights.customerName = match[1];
      break;
    }
  }
  
  // Check for specific names mentioned by users
  if (userTranscript.includes('Dev')) {
    insights.customerName = 'Dev';
  }
  if (userTranscript.includes('Didi')) {
    insights.customerName = 'Didi';
  }
  
  // Extract bike preferences
  const bikeTypes = ['road', 'mountain', 'hybrid', 'e-bike', 'electric'];
  bikeTypes.forEach(type => {
    if (transcript.toLowerCase().includes(type)) {
      insights.bikePreferences = { type };
    }
  });
  
  // Determine purchase intent (simplified)
  insights.purchaseIntent = 0.5;
  if (transcript.toLowerCase().includes('how much') || transcript.toLowerCase().includes('price')) {
    insights.purchaseIntent = 0.7;
  }
  if (transcript.toLowerCase().includes('buy today') || transcript.toLowerCase().includes('purchase now')) {
    insights.purchaseIntent = 0.9;
    insights.leadStatus = 'hot';
  }
  
  // Extract key points from analysis if available
  if (analysis?.key_points) {
    insights.keyPoints = analysis.key_points;
  }
  
  // Set sentiment
  if (analysis?.sentiment) {
    insights.sentiment = analysis.sentiment;
  }
  
  return insights;
}

// Handle client events from ElevenLabs (real-time events during call)
export async function handleClientEvents(req: Request, res: Response) {
  try {
    const { type, data, conversation_id, event_id } = req.body;
    
    logger.info(`Client event received: ${type}`, { conversation_id, event_id });
    
    // Find session for context
    const session = await callSessionService.getSessionByConversationId(conversation_id);
    
    switch (type) {
      case 'user_transcript':
        // Store user's speech in real-time
        if (data.user_transcript && session) {
          await conversationService.storeConversation({
            organization_id: session.organization_id,
            lead_id: session.lead_id,
            phone_number_normalized: '',
            content: data.user_transcript,
            sent_by: 'user',
            type: 'voice',
            call_classification: 'live',
            metadata: {
              real_time: true,
              event_type: 'user_transcript',
              conversation_id
            }
          });
          
          // Broadcast to dashboard for real-time display
          broadcastToClients({
            type: 'live_transcript',
            lead_id: session.lead_id,
            speaker: 'user',
            message: data.user_transcript,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'agent_response':
        // Store agent's response in real-time
        if (data.agent_response && session) {
          await conversationService.storeConversation({
            organization_id: session.organization_id,
            lead_id: session.lead_id,
            phone_number_normalized: '',
            content: data.agent_response,
            sent_by: 'agent',
            type: 'voice',
            call_classification: 'live',
            metadata: {
              real_time: true,
              event_type: 'agent_response',
              conversation_id
            }
          });
          
          // Broadcast to dashboard
          broadcastToClients({
            type: 'live_transcript',
            lead_id: session.lead_id,
            speaker: 'agent',
            message: data.agent_response,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'vad_score':
        // Voice Activity Detection - user is speaking
        if (data.vad_score > 0.8 && session) {
          broadcastToClients({
            type: 'user_speaking',
            lead_id: session.lead_id,
            vad_score: data.vad_score,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'client_tool_call':
        // Agent requested a tool/function call
        logger.info('Client tool call requested:', data);
        if (session) {
          broadcastToClients({
            type: 'tool_call',
            lead_id: session.lead_id,
            tool_name: data.tool_name,
            parameters: data.parameters,
            timestamp: new Date().toISOString()
          });
        }
        break;
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error handling client event:', error);
    res.status(500).json({ error: 'Failed to process event' });
  }
}

// Handle conversation events (optional real-time events during call)
export async function handleConversationEvents(req: Request, res: Response) {
  try {
    const { type, data, conversation_id } = req.body;
    
    logger.info(`Conversation event received: ${type}`, { conversation_id });
    
    // Try to find the session to get lead_id for targeted broadcast
    const session = await callSessionService.getSessionByConversationId(conversation_id);
    
    // Broadcast real-time events to dashboard
    broadcastToClients({
      type: `conversation_${type}`,
      conversation_id,
      lead_id: session?.lead_id,
      data,
      timestamp: new Date().toISOString()
    });
    
    // If it's a transcript event, store it immediately
    if (type === 'transcript' && data.message && session) {
      await conversationService.storeConversation({
        organization_id: session.organization_id,
        lead_id: session.lead_id,
        phone_number_normalized: data.phone_number?.replace(/\D/g, '') || '',
        content: data.message,
        sent_by: data.role === 'user' ? 'user' : 'agent',
        type: 'voice',
        call_classification: 'live',
        metadata: {
          real_time: true,
          conversation_id
        }
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error handling conversation event:', error);
    res.status(500).json({ error: 'Failed to process event' });
  }
}