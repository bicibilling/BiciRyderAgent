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
  const smsConversations = allHistory.filter(msg => msg.type === 'sms' || msg.type === 'text');
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

// Generate AI response using ElevenLabs API with comprehensive context
async function generateAIResponse(message: string, lead: any): Promise<string> {
  try {
    // Build comprehensive conversation context
    const conversationContext = await buildConversationContext(lead.id);
    const previousSummary = await conversationService.getLatestSummary(lead.id);
    
    // Create system prompt for SMS context
    const systemPrompt = `You are Mark, a friendly and knowledgeable assistant for BICI Bike Store. You are responding to a text message from a customer.

STORE INFO:
- Address: ${storeInfo.address}
- Phone: ${storeInfo.phone}
- Services: ${storeInfo.services.join(', ')}
- Hours: ${getTodaysHours()}

CUSTOMER CONTEXT:
${conversationContext}

CONVERSATION STYLE:
- Keep responses concise but helpful (this is SMS)
- Be conversational and natural
- Reference previous interactions when relevant
- Match the customer's communication style
- Don't repeat questions already answered
- Show you remember past conversations

CUSTOMER INFO:
- Name: ${lead.customer_name || 'Unknown'}
- Phone: ${lead.phone_number}
- Status: ${lead.status}
- Bike Interest: ${JSON.stringify(lead.bike_interest)}

PREVIOUS SUMMARY: ${previousSummary?.summary || 'First interaction'}

Respond naturally to the customer's text message. Be helpful and human-like.`;

    const response = await fetch('https://api.elevenlabs.io/v1/convai/conversation/get_signed_url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY!
      },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID!,
        // Use text completion endpoint for SMS instead of voice
        mode: 'text',
        context: systemPrompt,
        message: message
      })
    });

    if (!response.ok) {
      logger.error('ElevenLabs API error:', response.statusText);
      // Fallback to intelligent default
      return generateFallbackResponse(message, lead);
    }

    const data = await response.json();
    
    // For now, let's use a simpler approach - direct text generation
    // ElevenLabs primarily focuses on voice, so we'll create an intelligent fallback
    return generateIntelligentResponse(message, lead, conversationContext);

  } catch (error) {
    logger.error('Error generating AI response:', error);
    return generateFallbackResponse(message, lead);
  }
}

// Generate intelligent response based on context and patterns
async function generateIntelligentResponse(message: string, lead: any, context: string): Promise<string> {
  const lowerMessage = message.toLowerCase();
  const customerName = lead.customer_name || 'there';
  
  // Extract recent conversation for smart responses
  const recentConversations = await conversationService.getRecentConversations(lead.id, 3);
  const hasRecentContact = recentConversations.length > 0;
  const lastMessage = recentConversations[recentConversations.length - 1];
  
  // Smart greeting for returning customers
  if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
    if (lead.customer_name) {
      return `Hey ${customerName}! Good to hear from you again. What can I help you with today?`;
    }
    if (hasRecentContact) {
      return `Hi there! Great to hear from you again. How can I help you today?`;
    }
    return `Hello! Welcome to BICI. I'm Mark, how can I help you with your cycling needs?`;
  }
  
  // Context-aware responses
  if (lowerMessage.includes('hours') || lowerMessage.includes('open')) {
    const hours = getTodaysHours();
    if (lead.customer_name) {
      return `Hi ${customerName}! ${hours}. Planning to visit us?`;
    }
    return `${hours}. Hope to see you soon!`;
  }
  
  if (lowerMessage.includes('location') || lowerMessage.includes('address') || lowerMessage.includes('where')) {
    return `We're at ${storeInfo.address}. Here's the map: https://maps.google.com/?q=${encodeURIComponent(storeInfo.address)}. See you soon!`;
  }
  
  if (lowerMessage.includes('repair') || lowerMessage.includes('service') || lowerMessage.includes('fix')) {
    if (hasRecentContact && lastMessage?.content.includes('bike')) {
      return `Perfect! Bring your bike in and we'll take great care of it. ${getTodaysHours()}. Any specific issues you're noticing?`;
    }
    return `We'd love to help with your bike service! What type of repair do you need? You can bring it in during ${getTodaysHours()}.`;
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
    if (lead.bike_interest?.type) {
      return `Great question! For ${lead.bike_interest.type} bikes, we have options starting around $600-800. Want to come in and see what we have in stock?`;
    }
    return `We have bikes for every budget! Road bikes from $800, mountain bikes from $600, e-bikes from $1,500. What type are you most interested in?`;
  }
  
  // Bike type inquiries
  const bikeTypes = ['road', 'mountain', 'hybrid', 'electric', 'e-bike', 'kids'];
  const mentionedBike = bikeTypes.find(type => lowerMessage.includes(type));
  if (mentionedBike) {
    return `Great choice! We have several excellent ${mentionedBike} bikes in stock. What's your riding style and budget looking like? Come check them out!`;
  }
  
  // Appointment/visit related
  if (lowerMessage.includes('appointment') || lowerMessage.includes('visit') || lowerMessage.includes('come in')) {
    return `Sounds great! We're open ${getTodaysHours()}. Feel free to drop by or call ${storeInfo.phone} if you'd like to set a specific time.`;
  }
  
  // Follow up on previous conversations
  if (hasRecentContact && lowerMessage.includes('still') || lowerMessage.includes('update')) {
    return `Absolutely! Thanks for following up. What specific information can I help you with?`;
  }
  
  // Thank you responses
  if (lowerMessage.includes('thank')) {
    return `You're very welcome${customerName !== 'there' ? ' ' + customerName : ''}! Always happy to help with your cycling needs. 🚴`;
  }
  
  // Default intelligent response
  if (lead.customer_name && hasRecentContact) {
    return `Thanks for your message, ${customerName}! I'd be happy to help with that. Can you tell me a bit more about what you're looking for?`;
  }
  
  return `Thanks for reaching out! I'm here to help with any questions about bikes, service, or our store. What can I assist you with today?`;
}

// Fallback response for errors
function generateFallbackResponse(message: string, lead: any): string {
  const customerName = lead.customer_name || '';
  const greeting = customerName ? `Hi ${customerName}! ` : 'Hi! ';
  
  return `${greeting}Thanks for your message! For the quickest help, please call us at ${storeInfo.phone}. We're here ${getTodaysHours()}!`;
}