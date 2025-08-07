import { Request, Response } from 'express';
import twilio from 'twilio';
import { logger } from '../utils/logger';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { HumanControlService } from '../services/humanControl.service';
import { SMSAutomationService } from '../services/sms.service';
import { broadcastToClients } from '../services/realtime.service';
import { normalizePhoneNumber } from '../config/twilio.config';
import { storeInfo, businessHours } from '../config/elevenlabs.config';
import WebSocket from 'ws';

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
    
    // Store incoming message (match voice conversation pattern)
    await conversationService.storeConversation({
      organization_id: organization.id,
      lead_id: lead.id,
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

// Build comprehensive conversation context for SMS (reuse from voice calls)
async function buildConversationContext(leadId: string): Promise<string> {
  // Get previous conversation summaries for comprehensive context
  const previousSummaries = await conversationService.getAllSummaries(leadId);
  
  // Get all conversation history for analysis
  const allHistory = await conversationService.getRecentConversations(leadId, 50);
  
  // Get the most recent 6 messages for immediate context
  const recentMessages = await conversationService.getRecentConversations(leadId, 6);
  
  if (!allHistory || allHistory.length === 0) {
    return "This is the first interaction with this customer.";
  }
  
  let context = `=== COMPREHENSIVE CUSTOMER CONTEXT ===\n\n`;
  
  // 1. PREVIOUS CONVERSATION SUMMARIES (for historical context)
  if (previousSummaries && previousSummaries.length > 0) {
    context += `PREVIOUS CONVERSATION SUMMARIES:\n`;
    previousSummaries.forEach((summary, index) => {
      const timeAgo = getTimeAgo(summary.created_at);
      context += `${index + 1}. ${summary.call_classification?.toUpperCase() || 'GENERAL'} (${timeAgo}):\n`;
      context += `   Summary: ${summary.summary}\n`;
      if (summary.key_points && summary.key_points.length > 0) {
        context += `   Key Points: ${summary.key_points.join(', ')}\n`;
      }
      if (summary.next_steps && summary.next_steps.length > 0) {
        context += `   Follow-ups: ${summary.next_steps.join(', ')}\n`;
      }
      context += `   Sentiment: ${getSentimentLabel(summary.sentiment_score)}\n\n`;
    });
  }
  
  // 2. CONVERSATION STATISTICS & PATTERNS
  const voiceConversations = allHistory.filter(msg => msg.type === 'voice');
  const smsConversations = allHistory.filter(msg => msg.type === 'sms');
  const customerMessages = allHistory.filter(msg => msg.sent_by === 'user');
  
  context += `CUSTOMER ENGAGEMENT OVERVIEW:\n`;
  context += `- Total interactions: ${allHistory.length} messages\n`;
  context += `- Voice calls: ${voiceConversations.length} messages\n`;
  context += `- SMS/Text: ${smsConversations.length} messages\n`;
  context += `- Customer messages: ${customerMessages.length}\n`;
  context += `- Communication style: ${getCustomerStyle(customerMessages)}\n`;
  context += `- Relationship duration: ${getRelationshipDuration(allHistory)}\n`;
  context += `- Last contact: ${getTimeAgo(allHistory[allHistory.length - 1]?.timestamp)}\n\n`;
  
  // 3. RECENT CONVERSATION FLOW (last 6 messages for immediate context)
  context += `IMMEDIATE CONVERSATION CONTEXT (Last ${recentMessages.length} Messages):\n`;
  context += `--- This is what we were just talking about ---\n`;
  
  recentMessages.forEach((msg, index) => {
    const speaker = msg.sent_by === 'user' ? 'CUSTOMER' : 
                   msg.sent_by === 'human_agent' ? 'HUMAN AGENT' : 'AI AGENT';
    const timeAgo = getTimeAgo(msg.timestamp);
    const channel = msg.type === 'voice' ? ' 🎤' : ' 📱';
    
    context += `${index + 1}. ${speaker}${channel} (${timeAgo}):\n`;
    context += `   "${msg.content}"\n\n`;
  });
  
  // 4. CRITICAL INSTRUCTIONS FOR NATURAL SMS CONVERSATION
  context += `=== CRITICAL SMS CONVERSATION INSTRUCTIONS ===\n`;
  context += `🔥 IMMEDIATE PRIORITY: Continue naturally from the last message above\n`;
  context += `🧠 CONTEXT AWARENESS: Reference previous conversations when relevant\n`;
  context += `🎯 NO REPETITION: Don't ask questions already answered in history\n`;
  context += `💬 MATCH ENERGY: Use customer's communication style (${getCustomerStyle(customerMessages)})\n`;
  context += `🤝 BE HUMAN: Sound natural, not robotic - use conversation summaries to show you remember\n`;
  context += `⚡ FOCUS: Address what they were just talking about in the recent messages\n`;
  context += `📱 SMS SPECIFIC: Keep responses concise but helpful - this is a text message\n`;
  
  return context;
}

// Helper functions for SMS context building
function getTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function getCustomerStyle(messages: any[]): string {
  if (!messages || messages.length === 0) return 'unknown';
  
  const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const avgLength = totalLength / messages.length;
  
  if (avgLength > 100) return 'detailed/chatty';
  if (avgLength > 50) return 'conversational';
  return 'brief/direct';
}

function getSentimentLabel(score: number): string {
  if (score >= 0.7) return 'Very Positive';
  if (score >= 0.5) return 'Positive';
  if (score >= 0.3) return 'Neutral';
  if (score >= 0.1) return 'Negative';
  return 'Very Negative';
}

function getRelationshipDuration(messages: any[]): string {
  if (!messages || messages.length === 0) return 'New customer';
  
  const oldest = new Date(messages[0].timestamp);
  const newest = new Date(messages[messages.length - 1].timestamp);
  const diffDays = Math.floor((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Same day';
  if (diffDays === 1) return '1 day';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
  return `${Math.floor(diffDays / 365)} years`;
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

// Generate AI response using ElevenLabs Conversational AI WebSocket
async function generateAIResponse(message: string, lead: any): Promise<string> {
  try {
    // Build comprehensive conversation context
    const conversationContext = await buildConversationContext(lead.id);
    const previousSummary = await conversationService.getLatestSummary(lead.id);
    
    logger.info('Generating ElevenLabs SMS response:', {
      lead_id: lead.id,
      customer_name: lead.customer_name,
      message_preview: message.substring(0, 50),
      has_context: !!conversationContext
    });
    
    // Use ElevenLabs WebSocket for text conversation
    return await generateElevenLabsTextResponse(message, lead, conversationContext, previousSummary);

  } catch (error) {
    logger.error('Error generating ElevenLabs AI response:', error);
    return generateFallbackResponse(message, lead);
  }
}

// Generate ElevenLabs text response using WebSocket API
async function generateElevenLabsTextResponse(
  message: string, 
  lead: any, 
  conversationContext: string, 
  previousSummary: any
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 30000; // 30 second timeout
    let responseReceived = false;
    let isFirstResponse = true; // Track if this is the first agent response (greeting)
    let conversationStarted = false;

    // Create WebSocket connection to ElevenLabs
    const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${process.env.ELEVENLABS_AGENT_ID}`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!
      }
    });

    const timeout = setTimeout(() => {
      if (!responseReceived) {
        ws.close();
        reject(new Error('ElevenLabs WebSocket timeout'));
      }
    }, timeoutMs);

    ws.on('open', () => {
      logger.info('ElevenLabs WebSocket connected for SMS');
      
      // Send conversation initialization with ONLY dynamic variables - NO overrides
      const initMessage = {
        type: 'conversation_initiation_client_data',
        // Pass ALL context through dynamic variables only
        dynamic_variables: {
          // Customer info
          customer_name: lead.customer_name || 'Unknown',
          customer_phone: lead.phone_number,
          lead_status: lead.status,
          bike_interest: JSON.stringify(lead.bike_interest),
          
          // Conversation context
          conversation_context: conversationContext,
          previous_summary: previousSummary?.summary || 'First interaction',
          
          // Store info
          organization_name: 'BICI Bike Store',
          location_address: storeInfo.address,
          business_hours: getTodaysHours(),
          
          // SMS specific flag
          conversation_mode: 'sms_text_only',
          is_sms: 'true',
          
          // Additional context
          last_interaction_date: lead.last_contact_at || 'First contact',
          customer_sentiment: lead.sentiment || 'neutral'
        }
      };
      
      ws.send(JSON.stringify(initMessage));
      conversationStarted = true;
      
      // Send user message immediately after init
      setTimeout(() => {
        const userMessage = {
          type: 'user_message',
          text: message
        };
        ws.send(JSON.stringify(userMessage));
        logger.info('Sent user message to ElevenLabs:', { 
          message: message.substring(0, 50),
          customer_name: lead.customer_name 
        });
      }, 500); // Reduced delay
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        logger.info('ElevenLabs WebSocket response:', { 
          type: response.type,
          isFirstResponse,
          hasAgentResponse: !!response.agent_response_event?.agent_response,
          hasError: !!response.error
        });

        // Check for errors
        if (response.error) {
          logger.error('ElevenLabs error:', response.error);
          clearTimeout(timeout);
          ws.close();
          reject(new Error(response.error.message || 'ElevenLabs error'));
          return;
        }

        // Handle agent response
        if (response.type === 'agent_response' && response.agent_response_event?.agent_response) {
          const aiResponse = response.agent_response_event.agent_response;
          
          // Skip the first response if it looks like a greeting
          if (isFirstResponse) {
            isFirstResponse = false;
            const lowerResponse = aiResponse.toLowerCase();
            if (lowerResponse.includes('hey') || lowerResponse.includes('hello') || 
                lowerResponse.includes('how can i help') || lowerResponse.includes("i'm mark") ||
                lowerResponse.includes('bici') && lowerResponse.includes('help')) {
              logger.info('Skipping greeting response, waiting for actual response');
              return; // Skip this greeting and wait for the real response
            }
          }
          
          // This is the actual response to the user's message
          responseReceived = true;
          clearTimeout(timeout);
          ws.close();
          
          logger.info('Received ElevenLabs SMS response:', { 
            response_preview: aiResponse.substring(0, 100),
            response_length: aiResponse.length,
            lead_id: lead.id,
            customer_name: lead.customer_name
          });
          
          resolve(aiResponse);
        }
        
        // Log other message types for debugging
        if (response.type === 'conversation_initiation_metadata') {
          logger.info('Conversation initialized successfully');
        }
      } catch (error) {
        logger.error('Error parsing ElevenLabs WebSocket response:', error);
      }
    });

    ws.on('error', (error) => {
      logger.error('ElevenLabs WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      logger.info('ElevenLabs WebSocket closed');
      clearTimeout(timeout);
      if (!responseReceived) {
        reject(new Error('WebSocket closed without proper response'));
      }
    });
  });
}

// Fallback response for errors
function generateFallbackResponse(message: string, lead: any): string {
  const customerName = lead.customer_name || '';
  const greeting = customerName ? `Hi ${customerName}! ` : 'Hi! ';
  
  return `${greeting}Thanks for your message! For the quickest help, please call us at ${storeInfo.phone}. We're here ${getTodaysHours()}!`;
}