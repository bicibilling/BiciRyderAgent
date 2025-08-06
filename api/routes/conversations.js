/**
 * Conversation Routes
 * Manage conversations, chat interface, and human takeover
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateParams, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Import ElevenLabs service integration
const ElevenLabsService = require('../services/elevenLabsService');
const elevenLabsService = new ElevenLabsService();

// Conversation memory and SSE connection management
const conversationHistory = new Map(); // organization:phoneNumber -> messages[]
const conversationSummaries = new Map(); // organization:phoneNumber -> summary data
const activeConnections = new Map(); // leadId -> Map(connectionId -> {res, organizationId, phoneNumber})
const humanControlSessions = new Map(); // organization:phoneNumber -> {agentName, leadId, startTime}

// Helper functions for organization-scoped memory keys
function createOrgMemoryKey(organizationId, phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return `${organizationId}:${normalized}`;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/[^\d]/g, '');
}

/**
 * Special authentication middleware for SSE (Server-Sent Events)
 * EventSource doesn't support custom headers, so we accept token via query parameter
 */
const sseAuthMiddleware = async (req, res, next) => {
  try {
    // First try standard Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authMiddleware.verifyToken(req, res, next);
    }
    
    // If no header, try token from query parameter
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token required',
        code: 'MISSING_TOKEN'
      });
    }
    
    // Set the authorization header from query param and verify
    req.headers.authorization = `Bearer ${token}`;
    return authMiddleware.verifyToken(req, res, next);
    
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * @route GET /api/stream/conversation/:leadId
 * @desc Server-Sent Events endpoint for real-time conversation streaming
 * @access Private (conversations:read)
 */
router.get('/conversation/:leadId',
  sseAuthMiddleware,
  authMiddleware.requirePermission('conversations:read'),
  asyncHandler(async (req, res) => {
    const { leadId } = req.params;
    const { organizationId } = req.user;
    const phoneNumber = req.query.phoneNumber;
    const loadHistory = req.query.load === 'true';
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
        code: 'MISSING_PHONE_NUMBER'
      });
    }
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Store connection with organization context
    const connectionId = `${leadId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (!activeConnections.has(leadId)) {
      activeConnections.set(leadId, new Map());
    }
    activeConnections.get(leadId).set(connectionId, { 
      res, 
      organizationId,
      phoneNumber,
      connectedAt: new Date().toISOString()
    });
    
    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      leadId: leadId,
      organizationId: organizationId,
      connectionId: connectionId,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    // Load and send conversation history if requested
    if (loadHistory && phoneNumber) {
      await loadAndSendConversationHistory(leadId, phoneNumber, organizationId, res);
    }
    
    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        })}\n\n`);
      } catch (error) {
        clearInterval(heartbeat);
        cleanupConnection(leadId, connectionId);
      }
    }, 30000); // Every 30 seconds
    
    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      cleanupConnection(leadId, connectionId);
    });
    
    req.on('error', () => {
      clearInterval(heartbeat);
      cleanupConnection(leadId, connectionId);
    });
  })
);

// Conversation memory management functions
function addToConversationHistory(phoneNumber, message, sentBy, messageType, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  
  if (!conversationHistory.has(key)) {
    conversationHistory.set(key, []);
  }
  
  const conversationMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content: message,
    sentBy: sentBy, // 'user', 'agent', 'human_agent', 'system'
    timestamp: new Date().toISOString(),
    type: messageType, // 'text', 'voice', 'system'
    phoneNumber: normalizePhoneNumber(phoneNumber)
  };
  
  conversationHistory.get(key).push(conversationMessage);
  
  // Limit to last 50 messages to prevent memory issues
  const history = conversationHistory.get(key);
  if (history.length > 50) {
    conversationHistory.set(key, history.slice(-50));
  }
  
  return conversationMessage;
}

function getConversationHistory(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  return conversationHistory.get(key) || [];
}

function getConversationSummary(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  return conversationSummaries.get(key) || null;
}

function storeConversationSummary(phoneNumber, summary, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  conversationSummaries.set(key, {
    summary,
    timestamp: new Date().toISOString(),
    phoneNumber: normalizePhoneNumber(phoneNumber),
    organizationId
  });
}

async function loadAndSendConversationHistory(leadId, phoneNumber, organizationId, res) {
  try {
    const history = getConversationHistory(phoneNumber, organizationId);
    const summary = getConversationSummary(phoneNumber, organizationId);
    
    // Send conversation history
    res.write(`data: ${JSON.stringify({
      type: 'conversation_history',
      leadId,
      phoneNumber,
      organizationId,
      messages: history,
      summary: summary,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
  } catch (error) {
    console.error('Error loading conversation history:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'Failed to load conversation history',
      timestamp: new Date().toISOString()
    })}\n\n`);
  }
}

function cleanupConnection(leadId, connectionId) {
  const leadConnections = activeConnections.get(leadId);
  if (leadConnections) {
    leadConnections.delete(connectionId);
    if (leadConnections.size === 0) {
      activeConnections.delete(leadId);
    }
  }
}

// Broadcasting system for real-time updates
function broadcastConversationUpdate(data) {
  const { leadId, organizationId, phoneNumber } = data;
  
  // Find all connections for this lead
  const leadConnections = activeConnections.get(leadId);
  if (!leadConnections) return;
  
  leadConnections.forEach((connection, connectionId) => {
    // Security: Only send to same organization
    if (connection.organizationId !== organizationId) {
      console.warn('🚨 Blocked cross-org broadcast attempt', {
        requestedOrg: organizationId,
        connectionOrg: connection.organizationId,
        leadId,
        phoneNumber
      });
      return;
    }
    
    // Additional phone number validation if provided
    if (phoneNumber && connection.phoneNumber && 
        normalizePhoneNumber(phoneNumber) !== normalizePhoneNumber(connection.phoneNumber)) {
      return;
    }
    
    try {
      connection.res.write(`data: ${JSON.stringify({
        ...data,
        timestamp: new Date().toISOString()
      })}\n\n`);
    } catch (error) {
      console.error('Error broadcasting to connection:', error);
      // Remove dead connection
      leadConnections.delete(connectionId);
    }
  });
}

// Human control session management
function startHumanControlSession(phoneNumber, organizationId, agentName, leadId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  humanControlSessions.set(key, {
    agentName,
    leadId,
    organizationId,
    startTime: new Date().toISOString(),
    phoneNumber: normalizePhoneNumber(phoneNumber)
  });
  return true;
}

function endHumanControlSession(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  return humanControlSessions.delete(key);
}

function isUnderHumanControl(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  return humanControlSessions.has(key);
}

function getHumanControlSession(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  return humanControlSessions.get(key) || null;
}

// Context building functions for ElevenLabs dynamic variables
async function buildConversationContext(phoneNumber, organizationId) {
  try {
    // Get recent conversation history (last 6 messages)
    const history = getConversationHistory(phoneNumber, organizationId);
    const recentMessages = history.slice(-6);
    
    if (!recentMessages || recentMessages.length === 0) {
      return "No previous conversation";
    }
    
    // Build context string from recent messages
    const contextMessages = recentMessages.map(msg => {
      const speaker = msg.sentBy === 'user' ? 'Customer' : 
                     msg.sentBy === 'human_agent' ? 'Human Agent' : 'AI Agent';
      return `${speaker}: ${msg.content}`;
    });
    
    return contextMessages.join('\n');
  } catch (error) {
    console.error('Error building conversation context:', error);
    return "No previous conversation";
  }
}

async function generateComprehensiveSummary(phoneNumber, organizationId) {
  try {
    const history = getConversationHistory(phoneNumber, organizationId);
    const summary = getConversationSummary(phoneNumber, organizationId);
    
    if (!history || history.length === 0) {
      return summary?.summary || "No previous calls";
    }
    
    // Combine voice call summary with SMS context
    let comprehensiveSummary = "";
    
    if (summary && summary.summary) {
      comprehensiveSummary += `Previous Call Summary: ${summary.summary}\n\n`;
    }
    
    // Add recent SMS/text interactions
    const textMessages = history.filter(msg => msg.type === 'text').slice(-3);
    if (textMessages.length > 0) {
      comprehensiveSummary += "Recent Text Messages:\n";
      textMessages.forEach(msg => {
        const speaker = msg.sentBy === 'user' ? 'Customer' : 'Agent';
        comprehensiveSummary += `${speaker}: ${msg.content}\n`;
      });
    }
    
    return comprehensiveSummary || "No previous calls";
  } catch (error) {
    console.error('Error generating comprehensive summary:', error);
    return "No previous calls";
  }
}

async function buildDynamicVariables(phoneNumber, organizationId, leadData = null) {
  try {
    // Build conversation context from recent messages
    const conversationContext = await buildConversationContext(phoneNumber, organizationId);
    
    // Generate comprehensive summary combining voice + SMS
    const previousSummary = await generateComprehensiveSummary(phoneNumber, organizationId);
    
    // Determine caller type and lead status
    const hasHistory = conversationContext !== "No previous conversation";
    const hasPreviousCalls = previousSummary !== "No previous calls";
    
    // Get organization name (in production, fetch from database)
    const organizationName = await getOrganizationName(organizationId);
    
    return {
      conversation_context: conversationContext,
      customer_name: leadData?.customerName || "Customer",
      organization_name: organizationName,
      lead_status: hasPreviousCalls ? "Returning Customer" : "New Inquiry",
      previous_summary: previousSummary,
      organization_id: organizationId,
      caller_type: leadData ? "existing_lead" : "new_caller",
      has_conversation_history: hasHistory.toString(),
      total_messages: getConversationHistory(phoneNumber, organizationId).length.toString()
    };
  } catch (error) {
    console.error('Error building dynamic variables:', error);
    // Return safe defaults if context building fails
    return {
      conversation_context: "No previous conversation",
      customer_name: "Customer",
      organization_name: "BICI Bike Store",
      lead_status: "New Inquiry",
      previous_summary: "No previous calls",
      organization_id: organizationId,
      caller_type: "new_caller",
      has_conversation_history: "false",
      total_messages: "0"
    };
  }
}

async function getOrganizationName(organizationId) {
  // In production, this would query the database
  // For now, return a default or lookup from environment
  if (organizationId === 'bici-demo') {
    return 'BICI Bike Store';
  }
  return process.env.DEFAULT_ORGANIZATION_NAME || 'BICI Bike Store';
}

// Continue conversation with ElevenLabs after SMS
async function continueConversationWithSMS(phoneNumber, message, organizationId, options = {}) {
  try {
    const { leadData, conversationMessage, hasMedia } = options;
    
    // Store the SMS in conversation history if not already done
    let storedMessage = conversationMessage;
    if (!storedMessage) {
      storedMessage = addToConversationHistory(phoneNumber, message, 'user', 'text', organizationId);
    }
    
    // Check if under human control
    if (isUnderHumanControl(phoneNumber, organizationId)) {
      console.log('SMS received during human control, not forwarding to ElevenLabs');
      return {
        success: false,
        reason: 'under_human_control',
        conversationMessage: storedMessage
      };
    }
    
    // Analyze SMS content for intent and urgency
    const smsAnalysis = await analyzeSMSContent(message, leadData);
    
    // Build updated dynamic variables with new SMS context
    const dynamicVariables = await buildDynamicVariables(phoneNumber, organizationId, leadData);
    
    // Enhance context with SMS-specific information
    const enhancedContext = await buildSMSConversationContext(phoneNumber, message, organizationId, {
      leadData,
      smsAnalysis,
      hasMedia,
      previousContext: dynamicVariables.conversation_context
    });
    
    // Update dynamic variables with enhanced SMS context
    dynamicVariables.conversation_context = enhancedContext;
    dynamicVariables.latest_sms_message = message;
    dynamicVariables.sms_intent = smsAnalysis.intent;
    dynamicVariables.sms_urgency = smsAnalysis.urgency;
    dynamicVariables.has_media = hasMedia.toString();
    dynamicVariables.response_mode = 'sms_continuation';
    
    // Determine if SMS warrants immediate response or call
    const responseStrategy = determineResponseStrategy(smsAnalysis, leadData);
    
    console.log('SMS continuation context built:', {
      phoneNumber,
      organizationId,
      messageLength: message.length,
      contextLength: enhancedContext.length,
      intent: smsAnalysis.intent,
      urgency: smsAnalysis.urgency,
      responseStrategy: responseStrategy.type,
      hasMedia
    });
    
    // In production, this would:
    // 1. Find active ElevenLabs conversation for this phone number
    // 2. Send message continuation request with updated context
    // 3. Or initiate new conversation if none active
    // 4. Handle different response strategies (SMS reply, call initiation, etc.)
    
    if (responseStrategy.type === 'immediate_call') {
      console.log(`📞 SMS analysis suggests immediate call for ${phoneNumber}`);
      
      // Broadcast call suggestion to dashboard
      broadcastConversationUpdate({
        type: 'sms_suggests_call',
        leadId: leadData?.id,
        phoneNumber,
        organizationId,
        reason: responseStrategy.reason,
        priority: 'high',
        smsAnalysis,
        suggestedAction: 'initiate_outbound_call',
        timestamp: new Date().toISOString()
      });
    } else if (responseStrategy.type === 'sms_response') {
      console.log(`💬 SMS analysis suggests SMS response for ${phoneNumber}`);
      
      // In production, this would trigger ElevenLabs SMS response generation
      // For now, we'll broadcast to UI for potential automated response
      broadcastConversationUpdate({
        type: 'sms_response_suggested',
        leadId: leadData?.id,
        phoneNumber,
        organizationId,
        suggestedResponseType: responseStrategy.responseType,
        suggestedTemplate: responseStrategy.template,
        priority: responseStrategy.urgency === 'high' ? 'high' : 'normal',
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      conversationMessage: storedMessage,
      dynamicVariables,
      enhancedContext,
      smsAnalysis,
      responseStrategy
    };
  } catch (error) {
    console.error('Error continuing conversation with SMS:', error);
    throw error;
  }
}

// Analyze SMS content for intent and urgency
async function analyzeSMSContent(message, leadData = null) {
  try {
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(' ');
    
    // Intent detection
    let intent = 'general_inquiry';
    let urgency = 'normal';
    let keywords = [];
    let sentiment = 'neutral';
    
    // Urgency indicators
    const urgentWords = ['urgent', 'emergency', 'asap', 'immediately', 'help', 'problem', 'broken', 'stuck'];
    const highPriorityWords = ['appointment', 'reschedule', 'cancel', 'today', 'tomorrow'];
    
    if (urgentWords.some(word => lowerMessage.includes(word))) {
      urgency = 'high';
    } else if (highPriorityWords.some(word => lowerMessage.includes(word))) {
      urgency = 'medium';
    }
    
    // Intent classification
    if (lowerMessage.includes('appointment') || lowerMessage.includes('schedule') || lowerMessage.includes('book')) {
      intent = 'appointment_request';
      keywords.push('appointment');
    } else if (lowerMessage.includes('cancel') || lowerMessage.includes('reschedule')) {
      intent = 'appointment_modification';
      keywords.push('appointment_change');
    } else if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
      intent = 'price_inquiry';
      keywords.push('pricing');
    } else if (lowerMessage.includes('repair') || lowerMessage.includes('service') || lowerMessage.includes('fix')) {
      intent = 'service_request';
      keywords.push('service');
    } else if (lowerMessage.includes('bike') || lowerMessage.includes('bicycle')) {
      intent = 'product_inquiry';
      keywords.push('product');
    } else if (lowerMessage.includes('hours') || lowerMessage.includes('open') || lowerMessage.includes('closed')) {
      intent = 'store_hours';
      keywords.push('hours');
    } else if (lowerMessage.includes('location') || lowerMessage.includes('address') || lowerMessage.includes('directions')) {
      intent = 'store_location';
      keywords.push('location');
    }
    
    // Sentiment analysis (basic)
    const positiveWords = ['thanks', 'great', 'good', 'excellent', 'yes', 'perfect', 'love'];
    const negativeWords = ['bad', 'terrible', 'no', 'wrong', 'disappointed', 'frustrated', 'angry'];
    
    const positiveScore = positiveWords.filter(word => lowerMessage.includes(word)).length;
    const negativeScore = negativeWords.filter(word => lowerMessage.includes(word)).length;
    
    if (positiveScore > negativeScore) {
      sentiment = 'positive';
    } else if (negativeScore > positiveScore) {
      sentiment = 'negative';
    }
    
    // Question detection
    const isQuestion = message.includes('?') || 
                      lowerMessage.startsWith('what') || 
                      lowerMessage.startsWith('when') || 
                      lowerMessage.startsWith('where') || 
                      lowerMessage.startsWith('how') || 
                      lowerMessage.startsWith('why') ||
                      lowerMessage.startsWith('can ') ||
                      lowerMessage.startsWith('do you');
    
    return {
      intent,
      urgency,
      keywords,
      sentiment,
      isQuestion,
      wordCount: words.length,
      hasNumbers: /\d/.test(message),
      hasTime: /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i.test(message),
      hasDate: /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message),
      confidence: 0.8 // Mock confidence score
    };
  } catch (error) {
    console.error('Error analyzing SMS content:', error);
    return {
      intent: 'general_inquiry',
      urgency: 'normal',
      keywords: [],
      sentiment: 'neutral',
      isQuestion: false,
      confidence: 0.5
    };
  }
}

// Build SMS-specific conversation context
async function buildSMSConversationContext(phoneNumber, message, organizationId, options = {}) {
  try {
    const { leadData, smsAnalysis, hasMedia, previousContext } = options;
    
    // Get recent conversation history
    const history = getConversationHistory(phoneNumber, organizationId);
    const recentMessages = history.slice(-8); // Last 8 messages for context
    
    // Build context with SMS-specific enhancements
    let context = '';
    
    // Add previous conversation context if available
    if (previousContext && previousContext !== "No previous conversation") {
      context += `Previous conversation context:\n${previousContext}\n\n`;
    }
    
    // Add recent message history with SMS indicators
    if (recentMessages && recentMessages.length > 0) {
      context += `Recent conversation history:\n`;
      recentMessages.forEach(msg => {
        const speaker = msg.sentBy === 'user' ? 'Customer' : 
                       msg.sentBy === 'human_agent' ? 'Human Agent' : 'AI Assistant';
        const channel = msg.type === 'text' ? ' (SMS)' : msg.type === 'voice' ? ' (Voice)' : '';
        context += `${speaker}${channel}: ${msg.content}\n`;
      });
      context += '\n';
    }
    
    // Add SMS analysis context
    context += `Current SMS Analysis:\n`;
    context += `- Intent: ${smsAnalysis.intent}\n`;
    context += `- Urgency: ${smsAnalysis.urgency}\n`;
    context += `- Sentiment: ${smsAnalysis.sentiment}\n`;
    context += `- Contains question: ${smsAnalysis.isQuestion ? 'Yes' : 'No'}\n`;
    if (smsAnalysis.keywords.length > 0) {
      context += `- Keywords: ${smsAnalysis.keywords.join(', ')}\n`;
    }
    if (hasMedia) {
      context += `- Contains media: Yes\n`;
    }
    context += '\n';
    
    // Add lead context if available
    if (leadData) {
      context += `Lead Information:\n`;
      context += `- Status: ${leadData.leadStatus || 'New'}\n`;
      context += `- Quality Score: ${leadData.leadQualityScore || 'N/A'}\n`;
      context += `- Previous Interactions: ${leadData.interactionCount || 0}\n`;
      if (leadData.bikeInterest) {
        context += `- Bike Interest: ${leadData.bikeInterest.type || 'Unknown'}\n`;
        if (leadData.bikeInterest.budget) {
          context += `- Budget Range: $${leadData.bikeInterest.budget.min}-${leadData.bikeInterest.budget.max}\n`;
        }
      }
      context += '\n';
    }
    
    // Add current message with emphasis
    context += `CURRENT SMS MESSAGE TO RESPOND TO:\n`;
    context += `"${message}"\n\n`;
    
    // Add response guidelines based on analysis
    context += `Response Guidelines:\n`;
    if (smsAnalysis.urgency === 'high') {
      context += `- This is a HIGH PRIORITY message requiring immediate attention\n`;
    }
    if (smsAnalysis.isQuestion) {
      context += `- This is a direct question that needs a specific answer\n`;
    }
    if (smsAnalysis.intent === 'appointment_request') {
      context += `- Customer wants to book an appointment - provide available times\n`;
    } else if (smsAnalysis.intent === 'appointment_modification') {
      context += `- Customer wants to modify existing appointment - be flexible and helpful\n`;
    }
    context += `- Keep SMS responses concise (under 160 characters if possible)\n`;
    context += `- Use friendly, conversational tone appropriate for text messaging\n`;
    
    return context.trim();
    
  } catch (error) {
    console.error('Error building SMS conversation context:', error);
    return `Customer sent SMS: "${message}"\n\nPlease provide a helpful response.`;
  }
}

// Determine response strategy based on SMS analysis
function determineResponseStrategy(smsAnalysis, leadData = null) {
  const { intent, urgency, isQuestion, sentiment } = smsAnalysis;
  
  // High urgency messages might need immediate call
  if (urgency === 'high' && (intent === 'service_request' || sentiment === 'negative')) {
    return {
      type: 'immediate_call',
      reason: 'urgent_service_issue',
      priority: 'high'
    };
  }
  
  // Appointment requests with immediate timeline
  if (intent === 'appointment_request' && (smsAnalysis.hasDate || smsAnalysis.hasTime)) {
    return {
      type: 'immediate_call',
      reason: 'appointment_booking',
      priority: 'medium'
    };
  }
  
  // Complex product inquiries from qualified leads
  if (intent === 'product_inquiry' && leadData?.leadQualityScore > 70) {
    return {
      type: 'immediate_call',
      reason: 'qualified_lead_inquiry',
      priority: 'medium'
    };
  }
  
  // Simple informational responses can be SMS
  if (intent === 'store_hours' || intent === 'store_location') {
    return {
      type: 'sms_response',
      responseType: 'informational',
      template: intent === 'store_hours' ? 'store_hours' : 'directions',
      priority: 'low'
    };
  }
  
  // Questions usually deserve quick SMS responses
  if (isQuestion && urgency !== 'high') {
    return {
      type: 'sms_response',
      responseType: 'answer_question',
      template: null,
      priority: urgency === 'medium' ? 'medium' : 'low'
    };
  }
  
  // Default to SMS response for most cases
  return {
    type: 'sms_response',
    responseType: 'general_response',
    template: null,
    priority: urgency === 'medium' ? 'medium' : 'low'
  };
}

/**
 * @route GET /api/conversations
 * @desc Get conversations with filters and pagination
 * @access Private (conversations:read)
 */
router.get('/',
  authMiddleware.requirePermission('conversations:read'),
  validateQuery('conversationSearch'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { phoneNumber, startDate, endDate, status, humanTakeover, limit, offset } = req.query;
    
    // Mock conversation data - in production, query database
    const mockConversations = [
      {
        id: 'conv_1',
        customerPhone: '+1234567890',
        customerName: 'John Doe',
        status: 'completed',
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        endedAt: new Date(Date.now() - 3300000).toISOString(),
        duration: 300,
        isHumanTakeover: false,
        agentName: null,
        leadId: 'lead_1',
        callReason: 'product_inquiry',
        outcome: 'lead_created',
        sentiment: 'positive',
        leadQualityScore: 85,
        notes: 'Customer interested in mountain bikes. Budget $800-1200.',
        tags: ['mountain_bike', 'high_priority']
      },
      {
        id: 'conv_2',
        customerPhone: '+1987654321',
        customerName: 'Jane Smith',
        status: 'completed',
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        endedAt: new Date(Date.now() - 6900000).toISOString(),
        duration: 300,
        isHumanTakeover: true,
        agentName: 'Mike Johnson',
        leadId: 'lead_2',
        callReason: 'service_inquiry',
        outcome: 'appointment_booked',
        sentiment: 'positive',
        leadQualityScore: 92,
        notes: 'Booked tune-up appointment for next week.',
        tags: ['service', 'appointment']
      },
      // Add more mock conversations...
    ];
    
    // Apply filters (in production, this would be SQL WHERE clauses)
    let filteredConversations = mockConversations;
    
    if (phoneNumber) {
      filteredConversations = filteredConversations.filter(c => c.customerPhone === phoneNumber);
    }
    
    if (status) {
      filteredConversations = filteredConversations.filter(c => c.status === status);
    }
    
    if (humanTakeover !== undefined) {
      filteredConversations = filteredConversations.filter(c => c.isHumanTakeover === humanTakeover);
    }
    
    // Apply pagination
    const paginatedConversations = filteredConversations.slice(offset, offset + limit);
    
    res.json({
      success: true,
      data: {
        conversations: paginatedConversations,
        total: filteredConversations.length,
        filters: {
          phoneNumber,
          startDate,
          endDate,
          status,
          humanTakeover
        }
      },
      pagination: {
        limit,
        offset,
        total: filteredConversations.length,
        hasMore: offset + limit < filteredConversations.length
      }
    });
  })
);

/**
 * @route GET /api/conversations/:conversationId
 * @desc Get detailed conversation information
 * @access Private (conversations:read)
 */
router.get('/:conversationId',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { organizationId } = req.user;
    
    // Mock detailed conversation - in production, fetch from database
    const conversation = {
      id: conversationId,
      organizationId,
      customerPhone: '+1234567890',
      customerName: 'John Doe',
      customerEmail: 'john.doe@email.com',
      status: 'completed',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      endedAt: new Date(Date.now() - 3300000).toISOString(),
      duration: 300,
      isHumanTakeover: false,
      agentName: null,
      leadId: 'lead_1',
      callReason: 'product_inquiry',
      outcome: 'lead_created',
      sentiment: 'positive',
      leadQualityScore: 85,
      notes: 'Customer interested in mountain bikes. Budget $800-1200.',
      tags: ['mountain_bike', 'high_priority'],
      
      // Conversation transcript
      transcript: [
        {
          id: 'msg_1',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          speaker: 'ai',
          message: 'Hello! Thank you for calling Bici Bike Store. How can I help you today?',
          confidence: 0.98
        },
        {
          id: 'msg_2',
          timestamp: new Date(Date.now() - 3590000).toISOString(),
          speaker: 'customer',
          message: 'Hi, I am looking for a mountain bike for weekend rides.',
          confidence: 0.95
        },
        {
          id: 'msg_3',
          timestamp: new Date(Date.now() - 3580000).toISOString(),
          speaker: 'ai',
          message: 'Great choice! Mountain biking is fantastic for weekend adventures. What is your budget range and experience level?',
          confidence: 0.97
        }
        // More transcript entries...
      ],
      
      // Conversation events
      events: [
        {
          id: 'event_1',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'call_started',
          details: { phoneNumber: '+1234567890' }
        },
        {
          id: 'event_2',
          timestamp: new Date(Date.now() - 3550000).toISOString(),
          type: 'customer_identified',
          details: { customerName: 'John Doe', leadId: 'lead_1' }
        },
        {
          id: 'event_3',
          timestamp: new Date(Date.now() - 3300000).toISOString(),
          type: 'call_ended',
          details: { duration: 300, outcome: 'lead_created' }
        }
      ],
      
      // Analytics
      analytics: {
        talkTime: 240,
        silenceTime: 60,
        interruptionCount: 2,
        keywordsMentioned: ['mountain bike', 'weekend', 'budget'],
        sentimentAnalysis: {
          overall: 'positive',
          confidence: 0.89,
          emotions: {
            joy: 0.3,
            satisfaction: 0.6,
            interest: 0.8
          }
        },
        intentAnalysis: {
          primary: 'product_inquiry',
          secondary: 'price_comparison',
          confidence: 0.92
        }
      }
    };
    
    res.json({
      success: true,
      data: conversation
    });
  })
);

/**
 * @route GET /api/conversations/:conversationId/transcript
 * @desc Get conversation transcript with optional filtering
 * @access Private (conversations:read)
 */
router.get('/:conversationId/transcript',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { page, limit } = req.query;
    
    // Mock transcript - in production, fetch from database
    const fullTranscript = [
      {
        id: 'msg_1',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        speaker: 'ai',
        message: 'Hello! Thank you for calling Bici Bike Store. How can I help you today?',
        confidence: 0.98,
        duration: 3.2
      },
      {
        id: 'msg_2',
        timestamp: new Date(Date.now() - 3590000).toISOString(),
        speaker: 'customer',
        message: 'Hi, I am looking for a mountain bike for weekend rides.',
        confidence: 0.95,
        duration: 2.8
      }
      // More transcript entries...
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedTranscript = fullTranscript.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        conversationId,
        transcript: paginatedTranscript,
        summary: {
          totalMessages: fullTranscript.length,
          aiMessages: fullTranscript.filter(m => m.speaker === 'ai').length,
          customerMessages: fullTranscript.filter(m => m.speaker === 'customer').length,
          humanMessages: fullTranscript.filter(m => m.speaker === 'human').length
        }
      },
      pagination: {
        page,
        limit,
        total: fullTranscript.length,
        pages: Math.ceil(fullTranscript.length / limit)
      }
    });
  })
);

/**
 * @route POST /api/conversations/:conversationId/messages
 * @desc Send message to active conversation (human intervention)
 * @access Private (conversations:write)
 */
router.post('/:conversationId/messages',
  authMiddleware.requirePermission('conversations:write'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  validateBody('conversationMessage'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { message, messageType } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    // In production, send message through WebSocket to ElevenLabs
    const messageId = `msg_${Date.now()}`;
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        messageId,
        conversationId,
        sentBy: userId,
        sentByEmail: userEmail,
        messageType,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/conversations/:conversationId/takeover
 * @desc Take over conversation from AI
 * @access Private (conversations:manage)
 */
router.post('/:conversationId/takeover',
  authMiddleware.requirePermission('conversations:manage'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { reason, message } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    // In production, initiate human takeover through WebSocket
    res.json({
      success: true,
      message: 'Conversation takeover initiated',
      data: {
        conversationId,
        takenOverBy: userId,
        agentEmail: userEmail,
        reason: reason || 'manual_takeover',
        customMessage: message,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/conversations/:conversationId/release
 * @desc Release conversation back to AI
 * @access Private (conversations:manage)
 */
router.post('/:conversationId/release',
  authMiddleware.requirePermission('conversations:manage'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { summary, nextSteps } = req.body;
    const { organizationId, id: userId } = req.user;
    
    // In production, release conversation back to AI
    res.json({
      success: true,
      message: 'Conversation released to AI',
      data: {
        conversationId,
        releasedBy: userId,
        summary: summary || 'Conversation handled by human agent',
        nextSteps: nextSteps || [],
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route PATCH /api/conversations/:conversationId/notes
 * @desc Update conversation notes
 * @access Private (conversations:write)
 */
router.patch('/:conversationId/notes',
  authMiddleware.requirePermission('conversations:write'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  validateBody('conversationNotes'),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { notes } = req.body;
    const { organizationId, id: userId } = req.user;
    
    // In production, update notes in database
    res.json({
      success: true,
      message: 'Notes updated successfully',
      data: {
        conversationId,
        updatedBy: userId,
        notesLength: notes.length,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route PATCH /api/conversations/:conversationId/tags
 * @desc Update conversation tags
 * @access Private (conversations:write)
 */
router.patch('/:conversationId/tags',
  authMiddleware.requirePermission('conversations:write'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { tags, action = 'replace' } = req.body; // 'add', 'remove', or 'replace'
    const { organizationId, id: userId } = req.user;
    
    if (!Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags must be an array',
        code: 'INVALID_TAGS_FORMAT'
      });
    }
    
    res.json({
      success: true,
      message: `Tags ${action}d successfully`,
      data: {
        conversationId,
        action,
        tags,
        updatedBy: userId,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/conversations/:conversationId/analytics
 * @desc Get conversation analytics
 * @access Private (conversations:read)
 */
router.get('/:conversationId/analytics',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    
    // Mock analytics data
    const analytics = {
      conversationId,
      
      // Duration metrics
      duration: {
        total: 300,
        talkTime: 240,
        silenceTime: 60,
        avgResponseTime: 2.1
      },
      
      // Interaction metrics
      interactions: {
        totalExchanges: 15,
        customerMessages: 8,
        aiMessages: 7,
        humanMessages: 0,
        interruptions: 2
      },
      
      // Sentiment analysis
      sentiment: {
        overall: 'positive',
        confidence: 0.89,
        timeline: [
          { timestamp: new Date(Date.now() - 3600000).toISOString(), sentiment: 'neutral', score: 0.0 },
          { timestamp: new Date(Date.now() - 3400000).toISOString(), sentiment: 'positive', score: 0.6 },
          { timestamp: new Date(Date.now() - 3300000).toISOString(), sentiment: 'positive', score: 0.8 }
        ]
      },
      
      // Intent analysis
      intents: [
        { intent: 'product_inquiry', confidence: 0.92 },
        { intent: 'price_comparison', confidence: 0.67 },
        { intent: 'availability_check', confidence: 0.45 }
      ],
      
      // Keywords and entities
      keywords: [
        { word: 'mountain bike', count: 5, relevance: 0.95 },
        { word: 'budget', count: 3, relevance: 0.87 },
        { word: 'weekend', count: 2, relevance: 0.72 }
      ],
      
      entities: [
        { type: 'product', value: 'mountain bike', confidence: 0.98 },
        { type: 'budget_range', value: '$800-1200', confidence: 0.85 },
        { type: 'usage', value: 'weekend rides', confidence: 0.78 }
      ],
      
      // Quality metrics
      quality: {
        aiAccuracy: 0.94,
        customerSatisfaction: 4.2,
        resolutionScore: 0.88,
        leadQualityScore: 85
      }
    };
    
    res.json({
      success: true,
      data: analytics
    });
  })
);

/**
 * @route POST /api/conversations/:conversationId/export
 * @desc Export conversation data
 * @access Private (conversations:read)
 */
router.post('/:conversationId/export',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  rateLimitConfig.heavyOperations,
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { format = 'json', includeAnalytics = true } = req.body;
    const { id: userId } = req.user;
    
    // In production, generate export file
    const exportId = `export_${Date.now()}`;
    
    res.json({
      success: true,
      message: 'Export initiated',
      data: {
        exportId,
        conversationId,
        format,
        includeAnalytics,
        requestedBy: userId,
        status: 'processing',
        estimatedCompletion: new Date(Date.now() + 30000).toISOString()
      }
    });
  })
);

/**
 * @route DELETE /api/conversations/:conversationId
 * @desc Delete conversation (admin only)
 * @access Private (admin)
 */
router.delete('/:conversationId',
  authMiddleware.requireRole('admin'),
  validateParams({ conversationId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { reason } = req.body;
    const { id: userId } = req.user;
    
    // In production, soft delete conversation
    res.json({
      success: true,
      message: 'Conversation deleted successfully',
      data: {
        conversationId,
        deletedBy: userId,
        reason: reason || 'Admin deletion',
        timestamp: new Date().toISOString()
      }
    });
  })
);

// Note: Human control routes have been moved to /api/human-control/
// These were duplicate routes that could cause conflicts

/**
 * @route POST /api/conversations/outbound-call
 * @desc Initiate outbound call via ElevenLabs
 * @access Private (conversations:write)
 */
router.post('/outbound-call',
  authMiddleware.requirePermission('conversations:write'),
  validateBody('outboundCall'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { phoneNumber, leadId, customMessage, callReason, priority, scheduledTime, serviceDetails } = req.body;
    const { organizationId, id: userId } = req.user;
    
    try {
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          error: 'Valid phone number is required',
          code: 'INVALID_PHONE_NUMBER'
        });
      }
      
      // Check if already under human control
      if (isUnderHumanControl(phoneNumber, organizationId)) {
        return res.status(409).json({
          success: false,
          error: 'Conversation is under human control. Cannot initiate AI call.',
          code: 'UNDER_HUMAN_CONTROL'
        });
      }
      
      // Get lead data for context (in production, fetch from database)
      const leadData = leadId ? { 
        id: leadId, 
        customerName: 'Customer', // Would be fetched from DB
        phoneNumber: phoneNumber 
      } : null;
      
      // Build dynamic variables with conversation context
      const dynamicVariables = await buildDynamicVariables(phoneNumber, organizationId, leadData);
      
      // Add call context to dynamic variables
      if (customMessage) {
        dynamicVariables.custom_message = customMessage;
      }
      if (callReason) {
        dynamicVariables.call_reason = callReason;
      }
      if (priority) {
        dynamicVariables.call_priority = priority;
      }
      if (serviceDetails) {
        dynamicVariables.service_details = JSON.stringify(serviceDetails);
      }
      
      // Call ElevenLabs API with correct endpoint and payload format
      const callPayload = {
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: phoneNumber,
        conversation_initiation_client_data: {
          lead_id: leadId,
          customer_phone: phoneNumber,
          organization_id: organizationId,
          call_reason: callReason,
          priority: priority || 'medium',
          scheduled_time: scheduledTime,
          service_details: serviceDetails,
          call_type: 'outbound',
          initiated_by: userId || 'api',
          timestamp: new Date().toISOString(),
          dynamic_variables: dynamicVariables
        }
      };
      
      // Make actual ElevenLabs API call using the correct endpoint
      let callResult;
      if (process.env.NODE_ENV === 'production' && process.env.ELEVENLABS_API_KEY) {
        try {
          const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
            method: 'POST',
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(callPayload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API Error:', response.status, errorText);
            throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
          }

          callResult = await response.json();
          console.log('✅ ElevenLabs outbound call initiated:', callResult);
        } catch (error) {
          console.error('❌ Failed to initiate ElevenLabs outbound call:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to initiate outbound call',
            details: error.message,
            code: 'ELEVENLABS_API_FAILED'
          });
        }
      } else {
        // Development/mock mode
        console.log('📞 Outbound call payload prepared (mock mode):', {
          phoneNumber,
          organizationId,
          leadId,
          variablesCount: Object.keys(dynamicVariables).length
        });
        
        // Mock successful response for development
        callResult = {
          conversation_id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          call_id: `call_${Date.now().toString(36).toUpperCase()}`,
          status: 'initiated'
        };
      }
      
      // Store call initiation in conversation history
      const callMessage = customMessage || `Outbound AI call initiated - Reason: ${callReason || 'general'}`;
      addToConversationHistory(
        phoneNumber,
        callMessage,
        'system',
        'voice',
        organizationId
      );
      
      // Broadcast call initiation to UI
      broadcastConversationUpdate({
        type: 'call_initiated',
        leadId,
        phoneNumber,
        organizationId,
        callType: 'outbound',
        callReason,
        priority: priority || 'medium',
        scheduledTime,
        initiatedBy: userId,
        dynamicVariables: dynamicVariables
      });
      
      res.json({
        success: true,
        message: 'Outbound call initiated successfully',
        data: {
          phoneNumber,
          leadId,
          organizationId,
          callType: 'outbound',
          callReason,
          priority: priority || 'medium',
          scheduledTime,
          customMessage,
          initiatedBy: userId,
          timestamp: new Date().toISOString(),
          conversationId: callResult.conversation_id,
          callId: callResult.call_id,
          status: callResult.status,
          mock: process.env.NODE_ENV !== 'production' || !process.env.ELEVENLABS_API_KEY
        }
      });
    } catch (error) {
      console.error('Error initiating outbound call:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate outbound call',
        code: 'OUTBOUND_CALL_FAILED'
      });
    }
  })
);

// Export functions for use in webhooks and other modules
router.addToConversationHistory = addToConversationHistory;
router.getConversationHistory = getConversationHistory;
router.broadcastConversationUpdate = broadcastConversationUpdate;
router.buildDynamicVariables = buildDynamicVariables;
router.continueConversationWithSMS = continueConversationWithSMS;
router.storeConversationSummary = storeConversationSummary;
router.isUnderHumanControl = isUnderHumanControl;
router.startHumanControlSession = startHumanControlSession;
router.endHumanControlSession = endHumanControlSession;

module.exports = router;