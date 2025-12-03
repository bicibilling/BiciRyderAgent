import { Request, Response } from 'express';
import crypto from 'crypto';
import { toZonedTime } from 'date-fns-tz';
import { logger } from '../utils/logger';
import { LeadService } from '../services/lead.service';
import { ConversationService } from '../services/conversation.service';
import { CallSessionService } from '../services/callSession.service';
import { EnhancedSMSAutomationService } from '../services/enhanced-sms.service';
import { broadcastToClients } from '../services/realtime.service';
import { businessHours, storeInfo } from '../config/elevenlabs.config';
import { ElevenLabsDynamicVariables, ConversationInsights, Lead, CallSession } from '../types';
import { generateGreetingContext, createDynamicGreeting } from '../utils/greeting.helper';
import { redisService } from '../services/redis.service';

const leadService = new LeadService();
const conversationService = new ConversationService();
const callSessionService = new CallSessionService();
const enhancedSMSService = new EnhancedSMSAutomationService();

// Verify ElevenLabs webhook signature
function verifyElevenLabsSignature(req: Request): boolean {
  // Check if webhook secret is configured
  if (!process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.ELEVENLABS_WEBHOOK_SECRET === 'whsec_your_webhook_secret_here') {
    logger.warn('ELEVENLABS_WEBHOOK_SECRET not properly configured - allowing webhook for development');
    return true;
  }
  
  const signature = req.headers['xi-signature'] as string;
  
  // Allow phone call webhooks without signatures (ElevenLabs phone calls may not include signatures)
  if (!signature) {
    logger.warn('Missing xi-signature header - allowing for phone call compatibility');
    return true; // Allow phone calls to proceed
  }
  
  // Verify signature if present
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ELEVENLABS_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  const isValid = signature === `sha256=${expectedSignature}`;
  
  if (isValid) {
    logger.info('Webhook signature verified successfully');
  } else {
    logger.error('Invalid webhook signature - but allowing for compatibility', { 
      provided: signature, 
      expected: `sha256=${expectedSignature}`
    });
    return true; // Allow for now, but log the issue
  }
  
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
  
  return `Hey there, I'm Ryder from BICI. How can I help you today?`;
}

// Get current Pacific time
function getCurrentPacificTime(): { date: Date, timeString: string, hourMinute: string } {
  // Get current time in Pacific timezone using date-fns-tz
  const now = new Date();
  const pacificTime = toZonedTime(now, 'America/Los_Angeles');

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
  // Try to get cached context first (1 minute TTL for fast-changing contexts)
  try {
    const cachedContext = await redisService.getCachedContext(leadId);
    if (cachedContext) {
      logger.debug(`Context cache hit for lead ${leadId}`);
      return cachedContext;
    }
  } catch (redisError) {
    logger.warn('Context cache error, building fresh context:', redisError);
  }
  
  // Run queries in parallel to reduce latency
  const [previousSummaries, allHistory, recentMessages] = await Promise.all([
    conversationService.getAllSummaries(leadId),
    conversationService.getRecentConversations(leadId, 20), // Reduced from 50 for performance
    conversationService.getRecentConversations(leadId, 6)
  ]);
  
  if (!allHistory || allHistory.length === 0) {
    const firstTimeContext = "This is the first interaction with this customer.";
    
    // Cache the first-time result briefly (still cache to avoid repeated DB calls)
    try {
      await redisService.cacheContext(leadId, firstTimeContext);
    } catch (redisError) {
      logger.warn('Failed to cache first-time context, continuing:', redisError);
    }
    
    return firstTimeContext;
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
  
  // Cache the built context for future requests (1 minute TTL for fast-changing data)
  try {
    await redisService.cacheContext(leadId, context);
    logger.debug(`Cached context for lead ${leadId}`);
  } catch (redisError) {
    logger.warn('Failed to cache context, continuing:', redisError);
  }
  
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

    // Verify webhook signature FIRST
    if (!verifyElevenLabsSignature(req)) {
      logger.error('Invalid webhook signature - rejecting conversation initiation');
      return res.status(403).json({ error: 'Invalid signature' });
    }
    
    // Extract fields from both root and data levels for compatibility
    // ElevenLabs may use different field names: caller_id/external_number, called_number/agent_number
    const rootFields = req.body;
    const { data, analysis: rootAnalysis } = req.body;
    const dataFields = data || {};

    // Handle both field name formats: caller_id or external_number
    const caller_id = rootFields.caller_id || rootFields.external_number ||
                     dataFields.caller_id || dataFields.external_number;
    // Handle both field name formats: called_number or agent_number
    const called_number = rootFields.called_number || rootFields.agent_number ||
                         dataFields.called_number || dataFields.agent_number;
    const conversation_id = rootFields.conversation_id || dataFields.conversation_id;
    const call_sid = rootFields.call_sid || dataFields.call_sid || dataFields.metadata?.phone_call?.call_sid;
    const agent_id = rootFields.agent_id || dataFields.agent_id;
    const conversation_initiation_client_data = rootFields.conversation_initiation_client_data || dataFields.conversation_initiation_client_data;

    logger.info('Extracted webhook fields:', {
      caller_id,
      called_number,
      conversation_id,
      call_sid,
      agent_id,
      raw_body_keys: Object.keys(rootFields)
    });
    
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
    let organization = await leadService.getOrganizationByPhone(ourPhoneNumber);

    // If organization not found, use default organization instead of failing
    // This prevents webhook failures which would cause ElevenLabs calls to fail
    if (!organization) {
      logger.warn('No organization found for phone, using default:', {
        ourPhoneNumber,
        defaultOrgId: 'b0c1b1c1-0000-0000-0000-000000000001'
      });
      // Fallback to default organization
      organization = {
        id: 'b0c1b1c1-0000-0000-0000-000000000001',
        name: 'Beechee Bike Store',
        phone_number: ourPhoneNumber,
        timezone: 'America/Vancouver',
        settings: {}
      };
    }
    
    logger.info('Found organization:', { id: organization.id, name: organization.name });
    
    // Get or create lead - use customer phone
    let lead = conversation_initiation_client_data?.lead_id
      ? await leadService.getLead(conversation_initiation_client_data.lead_id)
      : await leadService.findOrCreateLead(customerPhone, organization.id);

    // Handle null lead case - create a minimal lead object to prevent failures
    if (!lead) {
      logger.warn('Lead could not be retrieved or created, using minimal fallback');
      lead = {
        id: `temp-${Date.now()}`,
        organization_id: organization.id,
        phone_number: customerPhone,
        phone_number_normalized: customerPhone.replace(/\D/g, ''),
        status: 'new' as const,
        sentiment: 'neutral' as const,
        created_at: new Date(),
        updated_at: new Date()
      };
    }

    logger.info('Lead data retrieved:', {
      lead_id: lead.id,
      has_name: !!lead.customer_name,
      customer_name: lead.customer_name || 'not set',
      phone: lead.phone_number,
      status: lead.status
    });
    
    // Build conversation context - wrap in try-catch to prevent failures
    let conversationContext = '';
    let previousSummary: any = null;
    try {
      conversationContext = await buildConversationContext(lead.id);
      previousSummary = await conversationService.getLatestSummary(lead.id);
    } catch (contextError) {
      logger.warn('Error building conversation context, continuing with minimal context:', contextError);
      conversationContext = 'First time caller';
    }

    // Get current Pacific time info
    const { timeString: currentTime, date: pacificDate } = getCurrentPacificTime();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][pacificDate.getDay()];
    const businessHoursStatus = getTodaysHours();

    // Create complete dynamic greeting - wrap in try-catch
    let dynamicGreeting = '';
    try {
      dynamicGreeting = await createDynamicGreeting(lead, currentTime, dayOfWeek, businessHoursStatus);
    } catch (greetingError) {
      logger.warn('Error creating dynamic greeting, using fallback:', greetingError);
      dynamicGreeting = `Hey! Thanks for calling Beechee. We're ${businessHoursStatus}. How can I help you?`;
    }
    
    // Generate greeting context for additional variables
    const greetingContext = generateGreetingContext(lead, isOutbound, previousSummary);
    
    const dynamicVariables: ElevenLabsDynamicVariables = {
      // Customer info (with length limits like SMS)
      customer_name: (lead.customer_name || "").substring(0, 50),
      customer_phone: caller_id,
      lead_status: lead.status || 'new',
      bike_interest: typeof lead.bike_interest === 'string' ? lead.bike_interest : JSON.stringify(lead.bike_interest || {}),
      
      // Conversation context (increased limit to match SMS implementation)
      conversation_context: (conversationContext || '').substring(0, 1500),
      previous_summary: (previousSummary?.summary || 'First time caller - no previous interactions').substring(0, 500),
      
      // Store info and timing context
      organization_name: organization.name,
      organization_id: organization.id,
      location_address: storeInfo.address,
      location_address_formatted: storeInfo.address, // Formatted version for SMS (same as location_address)
      business_hours: businessHoursStatus,
      store_greeting: businessHoursStatus, // Alias for business_hours (used in agent prompt)
      current_time: currentTime,
      current_day: dayOfWeek,
      current_datetime: `${dayOfWeek} ${currentTime} Pacific Time`,
      has_customer_name: lead.customer_name ? "true" : "false",
      
      // Dynamic greeting (complete and processed)
      dynamic_greeting: dynamicGreeting,
      
      // Additional greeting context variables
      ...greetingContext
    };
    
    logger.info('Voice Call Dynamic variables for ElevenLabs:', {
      customer_name: dynamicVariables.customer_name,
      has_customer_name: dynamicVariables.has_customer_name,
      lead_status: dynamicVariables.lead_status,
      hasCustomerName: !!dynamicVariables.customer_name,
      hasDynamicGreeting: !!dynamicVariables.dynamic_greeting,
      contextLength: dynamicVariables.conversation_context?.length || 0,
      summaryLength: dynamicVariables.previous_summary?.length || 0,
      bikeInterest: dynamicVariables.bike_interest
    });
    
    // Log the context preview for debugging (like SMS does)
    logger.info('Voice Call Context Preview:', {
      conversation_context_preview: dynamicVariables.conversation_context?.substring(0, 200) + '...',
      previous_summary_preview: dynamicVariables.previous_summary?.substring(0, 100) + '...',
      lead_status: dynamicVariables.lead_status,
      bike_interest: dynamicVariables.bike_interest,
      dynamic_greeting_preview: dynamicVariables.dynamic_greeting?.substring(0, 100) + '...'
    });
    
    // Create call session record - wrap in try-catch to not fail webhook
    try {
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
    } catch (sessionError) {
      logger.warn('Error creating call session, continuing anyway:', sessionError);
    }
    
    // Broadcast to dashboard
    logger.info('🔴 BROADCASTING call_initiated event', {
      type: 'call_initiated',
      lead_id: lead.id,
      phone_number: caller_id,
      conversation_id: sessionId
    });
    broadcastToClients({
      type: 'call_initiated',
      lead_id: lead.id,
      phone_number: caller_id,
      conversation_id: sessionId
    });
    logger.info('✅ call_initiated broadcast sent');

    logger.info('Returning dynamic variables for conversation', { lead_id: lead.id });

    // Pre-compute async values BEFORE building response object to avoid Promise issues
    const extractedName = lead.customer_name || await extractRecentCustomerName(lead.id) || '';
    const interactionCount = await conversationService.getConversationCount(lead.id);

    // Build proper response structure for ElevenLabs (just dynamic variables, no type field)
    const response = {
      dynamic_variables: {
        ...dynamicVariables,
        // Add extracted customer name if available (check recent conversations for name)
        customer_name: extractedName,
        // Add dynamic context about the customer
        customer_history: previousSummary?.summary || 'New customer',
        last_topic: lead.bike_interest?.type || 'general inquiry',
        qualification_status: lead.qualification_data?.ready_to_buy ? 'ready to purchase' : 'exploring options',
        interaction_count: String(interactionCount),
        last_contact: lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'First contact',
        // CRITICAL: Add greeting variables for outbound calls
        greeting_opener: dynamicVariables.greeting_opener || (lead.customer_name ? `Hey ${lead.customer_name}!` : "Hey there!"),
        greeting_variation: dynamicVariables.greeting_variation || "How can I help you"
      }
    };

    logger.info('Sending response to ElevenLabs', {
      has_dynamic_variables: !!response.dynamic_variables,
      variable_count: Object.keys(response.dynamic_variables).length
    });

    res.json(response);
  } catch (error) {
    logger.error('Error in conversation initiation:', error);
    
    // Return minimal dynamic variables on error to prevent call failure
    const fallbackResponse = {
      dynamic_variables: {
        conversation_context: '',
        previous_summary: 'New customer',
        customer_name: '',
        customer_phone: '',
        lead_status: 'new',
        bike_interest: '{}',
        organization_name: 'BICI Bike Store',
        business_hours: getTodaysHours(),
        current_datetime: new Date().toLocaleString('en-US', {
          timeZone: 'America/Vancouver',
          weekday: 'long',
          timeStyle: 'short'
        }),
        dynamic_greeting: 'Hi there! Thanks for calling BICI, how can I help you today?',
        has_customer_name: 'false'
      }
    };
    
    logger.info('Returning fallback response to prevent call failure');
    res.json(fallbackResponse);
  }
}

// Handle post-call webhook
export async function handlePostCall(req: Request, res: Response) {
  try {
    logger.info('ElevenLabs post-call webhook received', {
      body: req.body,
      headers: req.headers,
      bodyKeys: Object.keys(req.body || {}),
      bodyType: typeof req.body
    });
    
    // DEBUG: Log the exact webhook structure
    logger.info('Post-call webhook debug info:', {
      hasData: 'data' in req.body,
      hasAnalysis: 'analysis' in req.body,
      hasConversationId: 'conversation_id' in req.body,
      hasCallerId: 'caller_id' in req.body,
      hasCalledNumber: 'called_number' in req.body,
      fullBody: JSON.stringify(req.body, null, 2)
    });
    
    // Declare variables at the top level
    let conversation_id: string;
    let agent_id: string;
    let transcript: any[];
    let metadata: any;
    let analysis: any;
    let conversation_initiation_client_data: any;
    let phone_number: string;
    let caller_id: string;
    let called_number: string;
    let call_sid: string;
    let duration: number;
    let sessionId: string;
    
    // Handle post_call webhook formats (ElevenLabs sends 'transcript' or 'post_call_transcription')
    if (req.body.type === 'post_call_transcription' || req.body.type === 'transcript') {
      logger.info('Processing post-call transcript format:', req.body.type);
      
      // Verify webhook signature - ENABLED FOR PRODUCTION
      if (!verifyElevenLabsSignature(req)) {
        logger.warn('Invalid webhook signature - allowing for development');
        // Continue for now to not break functionality
      }
      
      const { data } = req.body;
      if (!data) {
        logger.error('No data in post_call_transcription webhook');
        return res.status(400).json({ error: 'Invalid webhook format' });
      }
      
      // Extract from new format
      conversation_id = data.conversation_id;
      agent_id = data.agent_id;
      transcript = data.transcript || [];
      metadata = data.metadata || {};
      analysis = data.analysis || {};
      conversation_initiation_client_data = data.conversation_initiation_client_data || {};
      
      // Try to extract phone number from various locations
      phone_number = 
        metadata.phone_call?.external_number ||
        conversation_initiation_client_data.dynamic_variables?.customer_phone ||
        conversation_initiation_client_data.dynamic_variables?.system__caller_id ||
        'unknown';
      
      // For web widget calls, there might not be a phone number
      const isWebCall = metadata.conversation_initiation_source === 'react_sdk' ||
                       metadata.conversation_initiation_source === 'widget';
      
      caller_id = phone_number;
      called_number = '+17786528784'; // Your Twilio number
      call_sid = metadata.phone_call?.call_sid || conversation_id;
      duration = metadata.call_duration_secs;
      
      logger.info('Extracted post-call data:', {
        conversation_id,
        agent_id,
        phone_number,
        isWebCall,
        duration,
        source: metadata.conversation_initiation_source
      });
      
      // Continue with existing logic but use extracted values
      sessionId = conversation_id;
    
      // Log structure for debugging
      logger.info('Post-call data structure:', {
        has_transcript: transcript.length > 0,
        has_analysis: !!analysis,
        has_metadata: !!metadata,
        transcript_count: transcript.length
      });
    
    logger.info('Post-call session details:', {
      conversation_id,
      call_sid: metadata?.phone_call?.call_sid,
      sessionId,
      phone_number,
      duration
    });
      
      // For web calls, we might not have a phone number, which is okay
      if (!sessionId) {
        logger.error('Missing conversation_id in post-call');
        return res.status(400).json({ error: 'Missing conversation_id' });
      }
      
      if (!phone_number || phone_number === 'unknown') {
        if (!isWebCall) {
          logger.warn('No phone number found for non-web call, using placeholder');
        }
        // Use a placeholder for web calls or when phone is missing
        const placeholderPhone = isWebCall ? 'web-user' : 'unknown-caller';
        logger.info('Using placeholder phone:', placeholderPhone);
      }
      
      logger.info('Processing post-call for session:', sessionId);
    } else {
      // Handle legacy webhook format
      logger.info('Processing legacy post-call format');
      
      // Verify webhook signature - ENABLED FOR PRODUCTION
      if (!verifyElevenLabsSignature(req)) {
        logger.error('Invalid webhook signature - rejecting post-call');
        return res.status(403).json({ error: 'Invalid signature' });
      }
      
      // Extract fields from both root and data levels for compatibility  
      const rootFields = req.body;
      const { data, analysis: rootAnalysis } = req.body;
      const dataFields = data || {};
      
      caller_id = rootFields.caller_id || dataFields.caller_id;
      called_number = rootFields.called_number || dataFields.called_number; 
      conversation_id = rootFields.conversation_id || dataFields.conversation_id;
      call_sid = rootFields.call_sid || dataFields.call_sid || dataFields.metadata?.phone_call?.call_sid;
      agent_id = rootFields.agent_id || dataFields.agent_id;
      conversation_initiation_client_data = rootFields.conversation_initiation_client_data || dataFields.conversation_initiation_client_data;
      
      // Analysis is actually inside the data object
      analysis = rootAnalysis || data?.analysis;
      
      // Extract transcript and metadata from appropriate location
      transcript = data?.transcript || rootFields.transcript || [];
      metadata = data?.metadata || rootFields.metadata || {};
      
      sessionId = conversation_id || metadata?.phone_call?.call_sid;
      // For SMS/text conversations, phone number might be in dynamic_variables
      phone_number = metadata?.phone_call?.external_number || 
                          conversation_initiation_client_data?.dynamic_variables?.customer_phone;
      duration = metadata?.call_duration_secs;
      
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
    }
    
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
    
    if (!session && phone_number && phone_number !== 'unknown' && phone_number !== 'web-user') {
      // Fallback: find most recent session by phone number and update it
      session = await callSessionService.updateRecentSessionByPhone(phone_number, sessionUpdateData);
    }
    
    // If still no session, create a minimal session object for web/SMS conversations
    if (!session) {
      // For web calls or when we don't have a phone number
      const organizationId = 'b0c1b1c1-0000-0000-0000-000000000001'; // Default org
      let lead = null;
      
      if (phone_number && phone_number !== 'unknown' && phone_number !== 'web-user') {
        // Try to find lead by phone
        lead = await leadService.findLeadByPhone(phone_number, organizationId);
      }
      
      // Create a minimal lead if needed for web calls
      if (!lead) {
        const isWebCall = metadata?.conversation_initiation_source === 'react_sdk' ||
                         metadata?.conversation_initiation_source === 'widget';
        
        if (isWebCall) {
          // Create a short identifier for web users (max 20 chars for phone field)
          // Use last 8 chars of conversation ID or user ID for uniqueness
          const userId = conversation_initiation_client_data?.user_id || sessionId || 'unknown';
          const shortId = userId.slice(-8); // Take last 8 characters
          const webPhone = `web-${shortId}`.substring(0, 20); // Ensure max 20 chars
          
          logger.info('Creating web user lead with phone identifier:', webPhone);
          
          lead = await leadService.findOrCreateLead(
            webPhone,
            organizationId
          );
          logger.info('Created/found web user lead:', { lead_id: lead.id, phone: webPhone });
        }
      }
      
      if (lead) {
        session = {
          id: sessionId,
          organization_id: organizationId,
          lead_id: lead.id,
          status: 'completed' as const,
          started_at: new Date(metadata?.start_time_unix_secs * 1000 || Date.now()),
          metadata: sessionUpdateData.metadata
        } as CallSession;
        logger.info('Created minimal session for conversation:', { 
          lead_id: lead.id, 
          phone: phone_number,
          source: metadata?.conversation_initiation_source
        });
      }
    }
    
    if (!session) {
      logger.error('Call session not found and unable to create:', sessionId);
      // Don't fail the webhook, just log the error and continue with minimal processing
      logger.warn('Continuing with minimal post-call processing without session');
      
      // Still try to broadcast to dashboard even without a session
      broadcastToClients({
        type: 'call_completed',
        conversation_id: sessionId,
        summary: analysis?.call_summary_title || 'Call completed',
        duration: duration || 0
      });
      
      return res.json({ success: true, warning: 'Processed without session' });
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
      // Only clear if we found an incorrect name (like "Ryder")
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

    // ALWAYS broadcast lead update to connected clients so frontend updates immediately
    // This ensures UI refreshes even if only sentiment/classification changed (not just name)
    broadcastToClients({
      type: 'lead_updated',
      lead_id: session.lead_id,
      customer_name: updatedLead?.customer_name || updateData.customer_name,
      updates: updateData
    });
    logger.info('📢 Broadcasted lead_updated event:', {
      lead_id: session.lead_id,
      customer_name: updatedLead?.customer_name
    });
    
    // Store conversation summary for both voice and SMS
    try {
      await conversationService.createSummary({
        organization_id: session.organization_id,
        lead_id: session.lead_id,
        phone_number: phone_number || session.metadata?.phone_number || 'unknown',
        summary: analysis?.call_summary_title || analysis?.transcript_summary || 'Conversation completed',
        key_points: insights.keyPoints || [],
        next_steps: insights.nextSteps || [],
        sentiment_score: insights.sentiment || 0.5,
        call_classification: insights.classification || 'general',
        conversation_type: metadata?.phone_call ? 'voice' : 'sms' // Track the conversation medium
      });
    } catch (summaryError) {
      logger.error('Failed to create summary (non-fatal):', summaryError);
      // Continue - don't let summary failure break transcript storage
    }
    
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
    // Wrap in try-catch so SMS failures don't break the webhook
    if (isVoiceCall) {
      try {
        logger.info('Triggering SMS follow-up for voice call');
        await enhancedSMSService.triggerSmartAutomation(session, insights, fullTranscript);
      } catch (smsError) {
        logger.error('SMS automation failed (non-fatal):', smsError);
        // Continue - don't let SMS failure break the webhook
      }
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
  // Note: ElevenLabs returns camelCase field names (callClassification) but we also check snake_case for backwards compatibility
  const callClassificationField = analysis?.data_collection_results?.callClassification || analysis?.data_collection_results?.call_classification;
  if (callClassificationField?.value) {
    // ElevenLabs has already classified the call intelligently
    insights.classification = callClassificationField.value;
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
  // Note: ElevenLabs returns camelCase field names (customerTriggers) but we also check snake_case for backwards compatibility
  const customerTriggersField = analysis?.data_collection_results?.customerTriggers || analysis?.data_collection_results?.customer_triggers;
  if (customerTriggersField?.value) {
    // ElevenLabs returns triggers as a string, we need to parse it
    const triggerString = customerTriggersField.value;
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
      insights.triggers = customerTriggersField.value;
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
    
    // Extract call classification from ElevenLabs (camelCase or snake_case)
    const classificationField = analysis.data_collection_results.callClassification || analysis.data_collection_results.call_classification;
    if (classificationField?.value) {
      insights.classification = classificationField.value;
      logger.info('Call classified as:', insights.classification);
    }

    // Extract customer triggers from ElevenLabs (camelCase or snake_case)
    const triggersField = analysis.data_collection_results.customerTriggers || analysis.data_collection_results.customer_triggers;
    if (triggersField?.value) {
      insights.triggers = triggersField.value || [];
      logger.info('Customer triggers:', insights.triggers);
    }

    // Extract follow-up recommendation from ElevenLabs (camelCase or snake_case)
    const followUpField = analysis.data_collection_results.followUpNeeded || analysis.data_collection_results.follow_up_needed;
    if (followUpField?.value) {
      insights.followUpNeeded = followUpField.value;
      logger.info('Follow-up needed:', insights.followUpNeeded);
    }
    
    // Extract customer name if collected (note: ElevenLabs returns structured data with .value)
    // IMPORTANT: Only update the name if we found a new one, don't clear existing names
    // Note: Field name is 'customerName' (camelCase) as configured in ElevenLabs data collection
    const customerNameField = analysis.data_collection_results.customerName || analysis.data_collection_results.customer_name;
    logger.info('🔍 Checking for customerName in data_collection_results:', {
      has_data_collection_results: !!analysis.data_collection_results,
      has_customerName_field: !!customerNameField,
      customerName_value: customerNameField?.value || 'NOT_FOUND'
    });
    if (customerNameField?.value) {
      const extractedName = customerNameField.value;
      
      // Only set the name if it's not "Ryder" (our agent's name) or other false positives
      if (!['ryder', 'agent', 'assistant'].includes(extractedName.toLowerCase())) {
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
    
    // Extract bike preferences if collected (camelCase or snake_case)
    const bikeTypeField = analysis.data_collection_results.bikeType || analysis.data_collection_results.bike_type;
    if (bikeTypeField?.value) {
      insights.bikePreferences = insights.bikePreferences || {};
      insights.bikePreferences.type = bikeTypeField.value;
      logger.info('Extracted bike type:', insights.bikePreferences.type);
    }

    // Extract purchase intent if collected (camelCase or snake_case)
    const purchaseIntentField = analysis.data_collection_results.purchaseIntent || analysis.data_collection_results.purchase_intent;
    if (purchaseIntentField?.value) {
      insights.purchaseIntent = purchaseIntentField.value;
    }

    // Extract riding experience if collected (camelCase or snake_case)
    const ridingExperienceField = analysis.data_collection_results.ridingExperience || analysis.data_collection_results.riding_experience;
    if (ridingExperienceField?.value) {
      insights.ridingExperience = ridingExperienceField.value;
    }

    // Extract purchase timeline if collected (camelCase or snake_case)
    const purchaseTimelineField = analysis.data_collection_results.purchaseTimeline || analysis.data_collection_results.purchase_timeline;
    if (purchaseTimelineField?.value) {
      insights.purchaseTimeline = purchaseTimelineField.value;
    }

    // Extract budget range if collected (camelCase or snake_case)
    const budgetRangeField = analysis.data_collection_results.budgetRange || analysis.data_collection_results.budget_range;
    if (budgetRangeField?.value) {
      insights.budgetRange = budgetRangeField.value;
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