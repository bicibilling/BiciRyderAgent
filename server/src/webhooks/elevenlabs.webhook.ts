import { Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { CallSessionService } from '../services/callSession.service';
import { EnhancedSMSAutomationService } from '../services/enhanced-sms.service';
import { broadcastToClients } from '../services/realtime.service';
import { businessHours, storeInfo } from '../config/elevenlabs.config';
import { ElevenLabsDynamicVariables, ConversationInsights, Lead, CallSession } from '../types';
import { generateGreetingContext, createDynamicGreeting } from '../utils/greeting.helper';

const leadService = new LeadService();
const conversationService = new ConversationService();
const callSessionService = new CallSessionService();
const enhancedSMSService = new EnhancedSMSAutomationService();

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

// Build dynamic prompt based on customer data
function buildDynamicPrompt(lead: Lead, context: string, previousSummary: any): string {
  let prompt = `You are speaking with a customer who has called BICI Bike Store.`;
  
  if (lead.customer_name) {
    prompt += ` The customer's name is ${lead.customer_name}.`;
  }
  
  if (lead.bike_interest?.type) {
    prompt += ` They have previously expressed interest in ${lead.bike_interest.type} bikes.`;
  }
  
  if (lead.qualification_data?.ready_to_buy) {
    prompt += ` This is a qualified lead who is ready to make a purchase.`;
  }
  
  if (previousSummary?.summary) {
    prompt += ` Previous interaction summary: ${previousSummary.summary}`;
  }
  
  if (context && context !== "This is the first interaction with this customer.") {
    prompt += ` Recent conversation context: ${context}`;
  }
  
  prompt += ` Be helpful, friendly, and knowledgeable about bikes. If they mention their name, remember it for future interactions.`;
  
  return prompt;
}

// Generate personalized first message
function generateFirstMessage(lead: Lead): string {
  if (lead.customer_name) {
    const greetings = [
      `Hi ${lead.customer_name}! Great to hear from you again. How can I help you today?`,
      `Hey ${lead.customer_name}, welcome back to BICI! What can I do for you?`,
      `Hello ${lead.customer_name}! Good to have you calling again. How's everything going?`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  if (lead.last_contact_at) {
    return `Welcome back to BICI! I see you've been in touch with us before. How can I help you today?`;
  }
  
  return `Hey there, I'm Mark from BICI. How can I help you today?`;
}

// Get current Pacific time
function getCurrentPacificTime(): { date: Date, timeString: string, hourMinute: string } {
  // Create date in Pacific timezone
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  
  const hours = pacificTime.getHours();
  const minutes = pacificTime.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  const timeString = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  const hourMinute = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  return { date: pacificTime, timeString, hourMinute };
}

// Get today's business hours with current time awareness
function getTodaysHours(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const { date: pacificTime, timeString } = getCurrentPacificTime();
  const today = days[pacificTime.getDay()];
  const hours = businessHours[today as keyof typeof businessHours];
  
  if (hours.open === 'closed') {
    return `Closed today. We're open Monday-Friday 9am-6pm (Thu-Fri until 8pm), Saturday 10am-5pm`;
  }
  
  // Check if currently open
  const currentHour = pacificTime.getHours();
  const currentMinute = pacificTime.getMinutes();
  const currentTime = currentHour * 100 + currentMinute;
  
  const [openHour, openMinute] = hours.open.split(':').map(Number);
  const [closeHour, closeMinute] = hours.close.split(':').map(Number);
  const openTime = openHour * 100 + openMinute;
  const closeTime = closeHour * 100 + closeMinute;
  
  if (currentTime >= openTime && currentTime < closeTime) {
    return `Open now until ${hours.close} (current time: ${timeString} PT)`;
  } else if (currentTime < openTime) {
    return `Opens at ${hours.open} today (current time: ${timeString} PT)`;
  } else {
    return `Closed for today. Opens tomorrow (current time: ${timeString} PT)`;
  }
}

// Build comprehensive conversation context with summaries and recent messages
export async function buildConversationContext(leadId: string): Promise<string> {
  // Run queries in parallel to reduce latency
  const [previousSummaries, allHistory, recentMessages] = await Promise.all([
    conversationService.getAllSummaries(leadId),
    conversationService.getRecentConversations(leadId, 20), // Reduced from 50 for performance
    conversationService.getRecentConversations(leadId, 6)
  ]);
  
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
  
  // 4. CONVERSATION TOPICS & INTERESTS (from all history)
  const topics = extractTopics(allHistory);
  if (topics.length > 0) {
    context += `DISCUSSION TOPICS & INTERESTS:\n`;
    topics.forEach(topic => {
      context += `- ${topic}\n`;
    });
    context += '\n';
  }
  
  // 5. CRITICAL INSTRUCTIONS FOR NATURAL CONVERSATION
  context += `=== CRITICAL CONVERSATION INSTRUCTIONS ===\n`;
  context += `🔥 IMMEDIATE PRIORITY: Continue naturally from the last message above\n`;
  context += `🧠 CONTEXT AWARENESS: Reference previous conversations when relevant\n`;
  context += `🎯 NO REPETITION: Don't ask questions already answered in history\n`;
  context += `💬 MATCH ENERGY: Use customer's communication style (${getCustomerStyle(customerMessages)})\n`;
  context += `🤝 BE HUMAN: Sound natural, not robotic - use conversation summaries to show you remember\n`;
  context += `⚡ FOCUS: Address what they were just talking about in the recent messages\n`;
  
  return context;
}

// Helper function to get time ago string
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

// Helper function to analyze customer communication style
function getCustomerStyle(messages: any[]): string {
  if (!messages || messages.length === 0) return 'unknown';
  
  const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const avgLength = totalLength / messages.length;
  
  if (avgLength > 100) return 'detailed/chatty';
  if (avgLength > 50) return 'conversational';
  return 'brief/direct';
}

// Helper function to get sentiment label
function getSentimentLabel(score: number): string {
  if (score >= 0.7) return 'Very Positive';
  if (score >= 0.5) return 'Positive';
  if (score >= 0.3) return 'Neutral';
  if (score >= 0.1) return 'Negative';
  return 'Very Negative';
}

// Helper function to get relationship duration
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

// Helper function to extract customer name from recent conversations
async function extractRecentCustomerName(leadId: string): Promise<string | null> {
  try {
    const recentConversations = await conversationService.getRecentConversations(leadId, 10);
    
    // Look for patterns like "this is [Name]" or "I'm [Name]" in user messages
    for (const conv of recentConversations.filter(c => c.sent_by === 'user')) {
      const content = conv.content.toLowerCase();
      
      // Pattern: "this is [name]" or "i'm [name]"
      const namePatterns = [
        /(?:this is|i'm|i am|my name is)\s+([a-z]+)/i,
        /(?:call me|it's)\s+([a-z]+)/i
      ];
      
      for (const pattern of namePatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          // Avoid common false positives
          if (!['looking', 'for', 'the', 'bike', 'store', 'help', 'call'].includes(name.toLowerCase())) {
            logger.info('Extracted name from conversation:', name);
            return name;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Error extracting customer name:', error);
    return null;
  }
}

// Helper function to extract conversation topics
function extractTopics(messages: any[]): string[] {
  const topics = new Set<string>();
  const bikeTypes = ['road bike', 'mountain bike', 'hybrid bike', 'e-bike', 'electric bike', 'kids bike'];
  const services = ['repair', 'tune-up', 'service', 'maintenance', 'fitting', 'custom build'];
  const interests = ['budget', 'price', 'cost', 'appointment', 'test ride', 'visit store', 'hours', 'location'];
  
  messages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for bike types
    bikeTypes.forEach(bike => {
      if (content.includes(bike)) {
        topics.add(`Interested in ${bike}s`);
      }
    });
    
    // Check for services
    services.forEach(service => {
      if (content.includes(service)) {
        topics.add(`Needs ${service} service`);
      }
    });
    
    // Check for other interests
    interests.forEach(interest => {
      if (content.includes(interest)) {
        topics.add(`Asked about ${interest}`);
      }
    });
    
    // Check for specific budget mentions
    if (content.match(/\$[\d,]+/) || content.includes('budget')) {
      topics.add('Discussed budget/pricing');
    }
  });
  
  return Array.from(topics).slice(0, 8); // Limit to top 8 topics
}

// Handle conversation initiation (for both inbound and outbound calls)
export async function handleConversationInitiation(req: Request, res: Response) {
  try {
    logger.info('ElevenLabs conversation initiation webhook received', {
      body: req.body,
      headers: req.headers
    });
    
    const { caller_id, called_number, conversation_id, call_sid, agent_id, conversation_initiation_client_data } = req.body;
    
    // Detect if this is an outbound call
    const isOutbound = conversation_initiation_client_data?.initiated_by === 'agent';
    logger.info('Call direction detected:', { isOutbound, initiated_by: conversation_initiation_client_data?.initiated_by });
    
    // Use conversation_id or call_sid as fallback
    const sessionId = conversation_id || call_sid;
    
    logger.info('Conversation IDs:', {
      conversation_id,
      call_sid,
      sessionId,
      agent_id
    });
    
    if (!caller_id || !called_number || !sessionId) {
      logger.error('Missing required fields', { caller_id, called_number, conversation_id, call_sid, agent_id });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    logger.info('Processing conversation with ID:', sessionId);
    
    // For outbound calls, the customer phone is in client_data or reversed (we're calling them)
    const customerPhone = isOutbound 
      ? (conversation_initiation_client_data?.customer_phone || called_number)
      : caller_id;
    
    // For outbound calls, our number is the caller_id; for inbound, it's the called_number
    const ourPhoneNumber = isOutbound ? caller_id : called_number;
    
    logger.info('Phone number detection:', { 
      customerPhone, 
      ourPhoneNumber, 
      isOutbound,
      raw_caller_id: caller_id,
      raw_called_number: called_number 
    });
    
    // Get organization from our phone number
    logger.info('Looking up organization for phone:', ourPhoneNumber);
    const organization = await leadService.getOrganizationByPhone(ourPhoneNumber);
    if (!organization) {
      logger.error('No organization found for phone:', {
        ourPhoneNumber,
        available_orgs: 'Check database for organizations table'
      });
      return res.status(404).json({ error: 'Organization not found for phone: ' + ourPhoneNumber });
    }
    
    logger.info('Found organization:', { id: organization.id, name: organization.name });
    
    // Get or create lead - use customer phone
    const lead = conversation_initiation_client_data?.lead_id 
      ? await leadService.getLead(conversation_initiation_client_data.lead_id)
      : await leadService.findOrCreateLead(customerPhone, organization.id);
    
    logger.info('Lead data retrieved:', {
      lead_id: lead.id,
      has_name: !!lead.customer_name,
      customer_name: lead.customer_name || 'not set',
      phone: lead.phone_number,
      status: lead.status
    });
    
    // Build conversation context
    const conversationContext = await buildConversationContext(lead.id);
    const previousSummary = await conversationService.getLatestSummary(lead.id);
    
    // Get current Pacific time info
    const { timeString: currentTime, date: pacificDate } = getCurrentPacificTime();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][pacificDate.getDay()];
    const businessHoursStatus = getTodaysHours();
    
    // Create complete dynamic greeting
    const dynamicGreeting = createDynamicGreeting(lead, currentTime, dayOfWeek, businessHoursStatus);
    
    // Generate greeting context for additional variables
    const greetingContext = generateGreetingContext(lead, isOutbound, previousSummary);
    
    const dynamicVariables: ElevenLabsDynamicVariables = {
      conversation_context: conversationContext,
      previous_summary: previousSummary?.summary || "First time caller - no previous interactions",
      customer_name: lead.customer_name || "",  // Pass existing name if any
      customer_phone: caller_id,
      lead_status: lead.status,
      bike_interest: JSON.stringify(lead.bike_interest),
      organization_name: organization.name,
      organization_id: organization.id,
      location_address: storeInfo.address,
      business_hours: businessHoursStatus,
      current_time: currentTime,
      current_day: dayOfWeek,
      current_datetime: `${dayOfWeek} ${currentTime} Pacific Time`,
      has_customer_name: lead.customer_name ? "true" : "false",  // Flag to check if name exists
      // Add the complete dynamic greeting that ElevenLabs expects
      dynamic_greeting: dynamicGreeting,
      // Add greeting context for additional variables
      ...greetingContext
    };
    
    logger.info('Dynamic variables for ElevenLabs:', {
      customer_name: dynamicVariables.customer_name,
      has_customer_name: dynamicVariables.has_customer_name,
      lead_status: dynamicVariables.lead_status
    });
    
    // Create call session record
    await callSessionService.createSession({
      organization_id: organization.id,
      lead_id: lead.id,
      elevenlabs_conversation_id: sessionId,
      call_type: isOutbound ? 'outbound' : 'inbound',
      status: 'initiated',
      metadata: {
        call_sid: call_sid || sessionId,
        agent_id: agent_id,
        caller_id: caller_id,
        called_number: called_number,
        initiated_by: conversation_initiation_client_data?.initiated_by
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
    
    // Build proper response structure for ElevenLabs
    const response = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        ...dynamicVariables,
        // Add extracted customer name if available (check recent conversations for name)
        customer_name: lead.customer_name || await extractRecentCustomerName(lead.id) || '',
        // Add dynamic context about the customer
        customer_history: previousSummary?.summary || 'New customer',
        last_topic: lead.bike_interest?.type || 'general inquiry',
        qualification_status: lead.qualification_data?.ready_to_buy ? 'ready to purchase' : 'exploring options',
        interaction_count: await conversationService.getConversationCount(lead.id),
        last_contact: lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'First contact',
        // CRITICAL: Add greeting variables for outbound calls
        greeting_opener: dynamicVariables.greeting_opener || (lead.customer_name ? `Hey ${lead.customer_name}!` : "Hey there!"),
        greeting_variation: dynamicVariables.greeting_variation || "How can I help you"
      }
      // Removed conversation_config_override as first_message is not allowed
      // The agent configuration should be done in ElevenLabs dashboard
    };
    
    res.json(response);
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
    // Analysis is actually inside the data object
    const { data, analysis: rootAnalysis } = req.body;
    const analysis = rootAnalysis || data?.analysis;
    
    logger.info('Post-call webhook body structure:', {
      has_data: !!data,
      has_analysis: !!analysis,
      body_keys: Object.keys(req.body),
      data_keys: data ? Object.keys(data) : null,
      analysis_keys: analysis ? Object.keys(analysis) : null,
      // Check if analysis is actually inside data
      data_has_analysis: data?.analysis ? Object.keys(data.analysis) : null,
      full_body_sample: JSON.stringify(req.body).substring(0, 500) + '...'
    });
    
    if (!data) {
      logger.error('No data field in post-call webhook');
      return res.status(400).json({ error: 'No data field found' });
    }
    
    const { 
      conversation_id, 
      transcript = [], 
      metadata = {},
      conversation_initiation_client_data = {}
    } = data;
    
    const sessionId = conversation_id || metadata?.phone_call?.call_sid;
    // For SMS/text conversations, phone number might be in dynamic_variables
    const phone_number = metadata?.phone_call?.external_number || 
                        conversation_initiation_client_data?.dynamic_variables?.customer_phone;
    const duration = metadata?.call_duration_secs;
    
    logger.info('Post-call session details:', {
      conversation_id,
      call_sid: metadata?.phone_call?.call_sid,
      sessionId,
      phone_number,
      duration
    });
    
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
    const sessionUpdateData: Partial<CallSession> = {
      status: 'completed' as const,  // Use const assertion for literal type
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
    
    // If still no session (for SMS conversations), create a minimal session object
    if (!session && phone_number) {
      // Find lead by phone number for SMS conversations
      const leadService = new LeadService();
      const organizationId = 'b0c1b1c1-0000-0000-0000-000000000001'; // Default org
      const lead = await leadService.findLeadByPhone(phone_number, organizationId);
      
      if (lead) {
        session = {
          id: sessionId,
          organization_id: organizationId,
          lead_id: lead.id,
          status: 'completed' as const,
          started_at: new Date(metadata?.start_time_unix_secs * 1000 || Date.now()),
          metadata: sessionUpdateData.metadata
        } as CallSession;
        logger.info('Created minimal session for SMS conversation:', { 
          lead_id: lead.id, 
          phone: phone_number 
        });
      }
    }
    
    if (!session) {
      logger.error('Call session not found and unable to create:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Process transcript for insights (pass the analysis properly)
    // Note: Don't override the data property which contains data_collection_results
    logger.info('Analysis structure for processTranscript:', {
      has_data_collection_results: !!analysis?.data_collection_results,
      analysis_keys: Object.keys(analysis || {}),
      data_collection_keys: analysis?.data_collection_results ? Object.keys(analysis.data_collection_results) : null
    });
    
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
    
    // Update customer name based on extraction
    if (insights.customerName) {
      updateData.customer_name = insights.customerName;
      logger.info('Updating customer name to:', insights.customerName);
    } else if (insights.clearCustomerName) {
      // Only clear if we found an incorrect name (like "Mark")
      updateData.customer_name = null;
      logger.info('Clearing incorrect customer name');
    }
    // Note: If neither customerName nor clearCustomerName is set, we keep the existing name
    
    const updatedLead = await leadService.updateLead(session.lead_id, updateData);
    logger.info('Lead updated with extracted data:', {
      lead_id: session.lead_id,
      customer_name: updateData.customer_name,
      has_customer_name: !!updateData.customer_name,
      updated_successfully: !!updatedLead
    });
    
    // Broadcast the lead update to all connected clients so frontend updates immediately
    if (updateData.customer_name) {
      broadcastToClients({
        type: 'lead_updated',
        lead_id: session.lead_id,
        customer_name: updateData.customer_name,
        updates: updateData
      });
    }
    
    // Store conversation summary for both voice and SMS
    await conversationService.createSummary({
      organization_id: session.organization_id,
      lead_id: session.lead_id,
      phone_number: phone_number || session.metadata?.phone_number,
      summary: analysis?.call_summary_title || analysis?.transcript_summary || 'Conversation completed',
      key_points: insights.keyPoints || [],
      next_steps: insights.nextSteps || [],
      sentiment_score: insights.sentiment || 0.5,
      call_classification: insights.classification || 'general',
      conversation_type: metadata?.phone_call ? 'voice' : 'sms' // Track the conversation medium
    });
    
    // Store individual conversation turns from the transcript array
    // IMPORTANT: Only store transcript for voice calls, not SMS (SMS messages are already stored in real-time)
    const isVoiceCall = !!metadata?.phone_call;
    
    if (isVoiceCall) {
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
    } else {
      logger.info('Skipping transcript storage for SMS conversation - already stored in real-time');
    }
    
    // Trigger enhanced SMS automation ONLY for voice calls, not SMS conversations
    if (isVoiceCall) {
      logger.info('Triggering SMS follow-up for voice call');
      await enhancedSMSService.triggerSmartAutomation(session, insights, fullTranscript);
    } else {
      logger.info('Skipping SMS automation for SMS conversation - not needed');
    }
    
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
  
  // Use ElevenLabs data collection if available, otherwise fallback to keyword matching
  if (analysis?.data_collection_results?.call_classification?.value) {
    // ElevenLabs has already classified the call intelligently
    insights.classification = analysis.data_collection_results.call_classification.value;
    logger.info('Using ElevenLabs call classification:', insights.classification);
  } else {
    // Fallback to keyword matching
    if (transcript.toLowerCase().includes('buy') || transcript.toLowerCase().includes('purchase')) {
      insights.classification = 'sales';
      insights.leadStatus = 'qualified';
    } else if (transcript.toLowerCase().includes('repair') || transcript.toLowerCase().includes('service')) {
      insights.classification = 'service';
    } else if (transcript.toLowerCase().includes('help') || transcript.toLowerCase().includes('support')) {
      insights.classification = 'support';
    }
  }
  
  // Use ElevenLabs triggers if available, otherwise fallback
  if (analysis?.data_collection_results?.customer_triggers?.value) {
    // ElevenLabs returns triggers as a string, we need to parse it
    const triggerString = analysis.data_collection_results.customer_triggers.value;
    if (typeof triggerString === 'string') {
      // Parse comma-separated triggers and map to our expected format
      const triggerMap: Record<string, string> = {
        'asked about store hours': 'asked_hours',
        'asked for directions/location': 'asked_directions',
        'inquired about prices': 'asked_price',
        'wants to schedule appointment': 'appointment_request',
        'interested in test ride': 'test_ride_interest',
        'has a complaint': 'has_complaint',
        'needs general help': 'needs_help'
      };
      
      insights.triggers = triggerString.split(',').map(t => t.trim())
        .map(t => triggerMap[t] || t)
        .filter(Boolean);
    } else {
      insights.triggers = analysis.data_collection_results.customer_triggers.value;
    }
    logger.info('Using ElevenLabs customer triggers:', insights.triggers);
  } else {
    // Fallback trigger detection
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
  }
  
  // Extract customer data from ElevenLabs data collection
  // This should be configured in the ElevenLabs dashboard under Analysis > Data Collection
  if (analysis?.data_collection_results) {
    logger.info('Data collection results found:', analysis.data_collection_results);
    
    // Extract call classification from ElevenLabs
    if (analysis.data_collection_results.call_classification?.value) {
      insights.classification = analysis.data_collection_results.call_classification.value;
      logger.info('Call classified as:', insights.classification);
    }
    
    // Extract customer triggers from ElevenLabs
    if (analysis.data_collection_results.customer_triggers?.value) {
      insights.triggers = analysis.data_collection_results.customer_triggers.value || [];
      logger.info('Customer triggers:', insights.triggers);
    }
    
    // Extract follow-up recommendation from ElevenLabs
    if (analysis.data_collection_results.follow_up_needed?.value) {
      insights.followUpNeeded = analysis.data_collection_results.follow_up_needed.value;
      logger.info('Follow-up needed:', insights.followUpNeeded);
    }
    
    // Extract customer name if collected (note: ElevenLabs returns structured data with .value)
    // IMPORTANT: Only update the name if we found a new one, don't clear existing names
    if (analysis.data_collection_results.customer_name?.value) {
      const extractedName = analysis.data_collection_results.customer_name.value;
      
      // Only set the name if it's not "Mark" (our agent's name) or other false positives
      if (!['mark', 'agent', 'assistant'].includes(extractedName.toLowerCase())) {
        insights.customerName = extractedName;
        logger.info('Extracted customer name:', insights.customerName);
      } else {
        // Found agent's name as customer name - this should be cleared
        insights.clearCustomerName = true;
        logger.info('Found agent name as customer name - will clear:', extractedName);
      }
    }
    // Note: If no name was found, we do NOT clear the existing name
    // Customer might not say their name in every call, especially short ones
    
    // Extract bike preferences if collected
    if (analysis.data_collection_results.bike_type?.value) {
      insights.bikePreferences = insights.bikePreferences || {};
      insights.bikePreferences.type = analysis.data_collection_results.bike_type.value;
      logger.info('Extracted bike type:', insights.bikePreferences.type);
    }
    
    // Extract purchase intent if collected
    if (analysis.data_collection_results.purchase_intent?.value) {
      insights.purchaseIntent = analysis.data_collection_results.purchase_intent.value;
    }
    
    // Extract riding experience if collected
    if (analysis.data_collection_results.riding_experience?.value) {
      insights.ridingExperience = analysis.data_collection_results.riding_experience.value;
    }
    
    // Extract purchase timeline if collected
    if (analysis.data_collection_results.purchase_timeline?.value) {
      insights.purchaseTimeline = analysis.data_collection_results.purchase_timeline.value;
    }
    
    // Extract budget range if collected
    if (analysis.data_collection_results.budget_range?.value) {
      insights.budgetRange = analysis.data_collection_results.budget_range.value;
    }
    
    logger.info('Final extracted insights:', {
      customerName: insights.customerName,
      bikePreferences: insights.bikePreferences,
      ridingExperience: insights.ridingExperience,
      purchaseTimeline: insights.purchaseTimeline,
      budgetRange: insights.budgetRange
    });
  } else {
    logger.warn('No data collection results found in analysis');
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
          logger.info('Real-time user transcript:', {
            lead_id: session.lead_id,
            transcript_length: data.user_transcript.length,
            conversation_id
          });

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
              conversation_id,
              event_id,
              stream_timestamp: new Date().toISOString()
            }
          });
          
          // Broadcast to dashboard for real-time display with enhanced data
          broadcastToClients({
            type: 'live_transcript',
            lead_id: session.lead_id,
            speaker: 'user',
            message: data.user_transcript,
            timestamp: new Date().toISOString(),
            conversation_id,
            event_id,
            is_final: data.is_final || false,
            confidence: data.confidence || null
          });
        }
        break;
        
      case 'agent_response':
        // Store agent's response in real-time
        if (data.agent_response && session) {
          logger.info('Real-time agent response:', {
            lead_id: session.lead_id,
            response_length: data.agent_response.length,
            conversation_id
          });

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
              conversation_id,
              event_id,
              stream_timestamp: new Date().toISOString()
            }
          });
          
          // Broadcast to dashboard with enhanced data
          broadcastToClients({
            type: 'live_transcript',
            lead_id: session.lead_id,
            speaker: 'agent',
            message: data.agent_response,
            timestamp: new Date().toISOString(),
            conversation_id,
            event_id,
            is_final: true, // Agent responses are always final
            confidence: 1.0 // Agent responses have full confidence
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
        
      case 'partial_transcript':
      case 'interim_transcript':
        // Partial/interim transcripts (not final)
        if (data.transcript && session) {
          logger.info('Real-time partial transcript:', {
            lead_id: session.lead_id,
            transcript_length: data.transcript.length,
            is_final: data.is_final,
            speaker: data.speaker || 'user'
          });

          // Broadcast partial transcript for live display (don't store in DB yet)
          broadcastToClients({
            type: 'live_transcript_partial',
            lead_id: session.lead_id,
            speaker: data.speaker || 'user',
            message: data.transcript,
            timestamp: new Date().toISOString(),
            conversation_id,
            event_id,
            is_final: data.is_final || false,
            confidence: data.confidence || null,
            is_partial: true
          });
        }
        break;
        
      case 'conversation_started':
        // Conversation has started
        if (session) {
          logger.info('Real-time conversation started:', { lead_id: session.lead_id });
          broadcastToClients({
            type: 'conversation_started',
            lead_id: session.lead_id,
            conversation_id,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'conversation_ended':
        // Conversation has ended
        if (session) {
          logger.info('Real-time conversation ended:', { lead_id: session.lead_id });
          broadcastToClients({
            type: 'conversation_ended',
            lead_id: session.lead_id,
            conversation_id,
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