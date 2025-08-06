/**
 * Human Control API Routes
 * Complete human-in-the-loop system for seamless AI conversation takeover
 * Integrates with conversation streaming infrastructure and Twilio SMS
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateParams, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const TwilioService = require('../services/twilioService');

const router = express.Router();

// Initialize Twilio service for SMS sending
const twilioService = new TwilioService();
twilioService.initialize().catch(console.error);

// Import conversation system functions for integration
let conversationRouter;
try {
  conversationRouter = require('./conversations');
} catch (error) {
  console.error('Failed to import conversation router:', error);
}

// Human control session state management
const humanControlSessions = new Map(); // organization:phoneNumber -> session data
const messageQueues = new Map(); // organization:phoneNumber -> queued messages during handoff
const agentConnections = new Map(); // agentId -> Set of active sessions

// Helper functions
function createOrgSessionKey(organizationId, phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return `${organizationId}:${normalized}`;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/[^\d]/g, '');
}

function validateOrganizationAccess(sessionOrganizationId, requestOrganizationId) {
  return sessionOrganizationId === requestOrganizationId;
}

// Advanced session management functions
function createHumanControlSession(phoneNumber, organizationId, agentData, leadId) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session = {
    sessionId,
    phoneNumber: normalizePhoneNumber(phoneNumber),
    organizationId,
    leadId,
    agentId: agentData.id,
    agentName: agentData.name || agentData.email,
    agentEmail: agentData.email,
    startTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    status: 'active',
    messageCount: 0,
    customerResponsesPending: 0,
    handoffReason: agentData.handoffReason || 'manual_takeover',
    customMessage: agentData.customMessage || null,
    metadata: {
      aiConversationPaused: true,
      lastAIMessage: null,
      conversationContext: null
    }
  };
  
  humanControlSessions.set(sessionKey, session);
  
  // Track agent connections
  if (!agentConnections.has(agentData.id)) {
    agentConnections.set(agentData.id, new Set());
  }
  agentConnections.get(agentData.id).add(sessionKey);
  
  // Initialize message queue for this session
  messageQueues.set(sessionKey, []);
  
  console.log(`🧑‍💼 Human control session started: ${sessionId} for ${phoneNumber} by ${agentData.name}`);
  
  return session;
}

function getHumanControlSession(phoneNumber, organizationId) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  return humanControlSessions.get(sessionKey) || null;
}

function updateSessionActivity(phoneNumber, organizationId, activityData = {}) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  const session = humanControlSessions.get(sessionKey);
  
  if (session) {
    session.lastActivity = new Date().toISOString();
    if (activityData.messageCount) {
      session.messageCount += activityData.messageCount;
    }
    if (activityData.customerResponsesPending !== undefined) {
      session.customerResponsesPending = activityData.customerResponsesPending;
    }
    humanControlSessions.set(sessionKey, session);
    return session;
  }
  
  return null;
}

function endHumanControlSession(phoneNumber, organizationId, endData = {}) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  const session = humanControlSessions.get(sessionKey);
  
  if (!session) {
    return false;
  }
  
  // Update session with end data
  session.status = 'ended';
  session.endTime = new Date().toISOString();
  session.duration = Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000);
  session.summary = endData.summary || null;
  session.nextSteps = endData.nextSteps || [];
  session.handoffSuccess = endData.handoffSuccess !== false;
  
  // Remove from active sessions
  humanControlSessions.delete(sessionKey);
  
  // Clean up agent connections
  if (agentConnections.has(session.agentId)) {
    agentConnections.get(session.agentId).delete(sessionKey);
    if (agentConnections.get(session.agentId).size === 0) {
      agentConnections.delete(session.agentId);
    }
  }
  
  // Clear message queue
  messageQueues.delete(sessionKey);
  
  console.log(`🧑‍💼 Human control session ended: ${session.sessionId} (${session.duration}s)`);
  
  return session;
}

function queueMessage(phoneNumber, organizationId, message, messageType = 'customer') {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  
  if (!messageQueues.has(sessionKey)) {
    messageQueues.set(sessionKey, []);
  }
  
  const queuedMessage = {
    id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    content: message,
    type: messageType,
    timestamp: new Date().toISOString(),
    processed: false
  };
  
  messageQueues.get(sessionKey).push(queuedMessage);
  
  // Update session with pending customer responses
  if (messageType === 'customer') {
    updateSessionActivity(phoneNumber, organizationId, {
      customerResponsesPending: getQueuedMessagesCount(phoneNumber, organizationId, 'customer')
    });
  }
  
  return queuedMessage;
}

function getQueuedMessages(phoneNumber, organizationId, markAsProcessed = false) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  const messages = messageQueues.get(sessionKey) || [];
  
  if (markAsProcessed) {
    messages.forEach(msg => msg.processed = true);
  }
  
  return messages;
}

function getQueuedMessagesCount(phoneNumber, organizationId, messageType = null) {
  const messages = getQueuedMessages(phoneNumber, organizationId);
  
  if (messageType) {
    return messages.filter(msg => !msg.processed && msg.type === messageType).length;
  }
  
  return messages.filter(msg => !msg.processed).length;
}

function isUnderHumanControl(phoneNumber, organizationId) {
  const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
  return humanControlSessions.has(sessionKey);
}

// Integration with conversation streaming system
async function broadcastHumanControlUpdate(data) {
  if (conversationRouter && conversationRouter.broadcastConversationUpdate) {
    await conversationRouter.broadcastConversationUpdate(data);
  } else {
    console.warn('Conversation broadcast not available, update not sent:', data.type);
  }
}

async function addToConversationHistory(phoneNumber, message, sentBy, messageType, organizationId) {
  if (conversationRouter && conversationRouter.addToConversationHistory) {
    return conversationRouter.addToConversationHistory(phoneNumber, message, sentBy, messageType, organizationId);
  } else {
    console.warn('Conversation history not available, message not stored');
    return null;
  }
}

// SMS Integration with Twilio
async function sendSMSAsHumanAgent(phoneNumber, message, organizationId, agentData) {
  try {
    // Send via Twilio (raw message, not template)
    const result = await twilioService.client.messages.create({
      body: message,
      from: twilioService.phoneNumber,
      to: phoneNumber
    });
    
    console.log(`📱 Human agent SMS sent to ${phoneNumber}: ${result.sid}`);
    
    return {
      success: true,
      messageId: result.sid,
      status: result.status,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Failed to send human agent SMS to ${phoneNumber}:`, error.message);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * @route POST /api/human-control/join
 * @desc Agent joins conversation and takes control from AI
 * @access Private (conversations:manage)
 */
router.post('/join',
  authMiddleware.requirePermission('conversations:manage'),
  validateBody('humanControlJoin'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, agentName, leadId, handoffReason, customMessage } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    // Normalize and validate phone number
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
      const existingSession = getHumanControlSession(phoneNumber, organizationId);
      
      // Security: Ensure organization isolation
      if (!validateOrganizationAccess(existingSession.organizationId, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this conversation',
          code: 'ORGANIZATION_ACCESS_DENIED'
        });
      }
      
      return res.status(409).json({
        success: false,
        error: 'Conversation is already under human control',
        code: 'ALREADY_UNDER_HUMAN_CONTROL',
        data: {
          currentAgent: existingSession.agentName,
          agentId: existingSession.agentId,
          startTime: existingSession.startTime,
          duration: Math.floor((Date.now() - new Date(existingSession.startTime)) / 1000)
        }
      });
    }
    
    // Create human control session
    const agentData = {
      id: userId,
      name: agentName || userEmail,
      email: userEmail,
      handoffReason: handoffReason || 'manual_takeover',
      customMessage: customMessage
    };
    
    const session = createHumanControlSession(phoneNumber, organizationId, agentData, leadId);
    
    // Add system message to conversation history
    const systemMessage = customMessage || 
      `Human agent ${agentData.name} has joined the conversation and taken control from AI`;
    
    const conversationMessage = await addToConversationHistory(
      phoneNumber,
      systemMessage,
      'system',
      'system',
      organizationId
    );
    
    // Broadcast to UI via streaming system
    await broadcastHumanControlUpdate({
      type: 'human_control_started',
      leadId,
      phoneNumber,
      organizationId,
      session: {
        sessionId: session.sessionId,
        agentName: session.agentName,
        agentId: session.agentId,
        startTime: session.startTime,
        handoffReason: session.handoffReason,
        customMessage: session.customMessage
      },
      systemMessage: conversationMessage
    });
    
    // If there's a custom message, send it as first message
    if (customMessage) {
      try {
        const smsResult = await sendSMSAsHumanAgent(phoneNumber, customMessage, organizationId, agentData);
        
        if (smsResult.success) {
          const messageInHistory = await addToConversationHistory(
            phoneNumber,
            customMessage,
            'human_agent',
            'text',
            organizationId
          );
          
          updateSessionActivity(phoneNumber, organizationId, { messageCount: 1 });
          
          await broadcastHumanControlUpdate({
            type: 'human_message_sent',
            leadId,
            phoneNumber,
            organizationId,
            message: messageInHistory,
            agentName: session.agentName,
            smsResult
          });
        }
      } catch (error) {
        console.error('Failed to send custom handoff message:', error);
        // Continue with successful handoff even if custom message fails
      }
    }
    
    res.json({
      success: true,
      message: 'Human control session started successfully',
      data: {
        session: {
          sessionId: session.sessionId,
          phoneNumber: session.phoneNumber,
          leadId: session.leadId,
          agentName: session.agentName,
          agentId: session.agentId,
          organizationId: session.organizationId,
          startTime: session.startTime,
          handoffReason: session.handoffReason,
          customMessage: session.customMessage,
          status: session.status
        },
        queuedMessages: getQueuedMessagesCount(phoneNumber, organizationId),
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/human-control/send-message
 * @desc Send message as human agent (SMS or voice continuation)
 * @access Private (conversations:write)
 */
router.post('/send-message',
  authMiddleware.requirePermission('conversations:write'),
  validateBody('humanControlMessage'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { phoneNumber, message, leadId, messageType = 'text', priority = 'normal' } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    // Validate message content
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
        code: 'EMPTY_MESSAGE'
      });
    }
    
    if (message.length > 1600) { // SMS limit
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 1600 characters for SMS)',
        code: 'MESSAGE_TOO_LONG'
      });
    }
    
    // Check if under human control
    const session = getHumanControlSession(phoneNumber, organizationId);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Conversation is not under human control',
        code: 'NOT_UNDER_HUMAN_CONTROL'
      });
    }
    
    // Security: Verify agent has access to this session
    if (!validateOrganizationAccess(session.organizationId, organizationId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this conversation',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }
    
    // Verify agent is the one controlling this session (optional: can be removed to allow team takeover)
    if (session.agentId !== userId) {
      console.warn(`Agent ${userId} trying to send message in session controlled by ${session.agentId}`);
      // Allow for now, but log for security audit
    }
    
    try {
      // Send SMS via Twilio
      const smsResult = await sendSMSAsHumanAgent(phoneNumber, message, organizationId, {
        id: userId,
        name: session.agentName,
        email: userEmail
      });
      
      if (!smsResult.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to send SMS message',
          code: 'SMS_SEND_FAILED',
          details: smsResult.error
        });
      }
      
      // Store message in conversation history
      const conversationMessage = await addToConversationHistory(
        phoneNumber,
        message,
        'human_agent',
        messageType,
        organizationId
      );
      
      // Update session activity
      updateSessionActivity(phoneNumber, organizationId, { messageCount: 1 });
      
      // Broadcast to UI via streaming system
      await broadcastHumanControlUpdate({
        type: 'human_message_sent',
        leadId,
        phoneNumber,
        organizationId,
        message: conversationMessage,
        agentName: session.agentName,
        agentId: session.agentId,
        smsResult: smsResult,
        priority
      });
      
      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: conversationMessage?.id,
          smsId: smsResult.messageId,
          phoneNumber,
          leadId,
          messageType,
          priority,
          agentName: session.agentName,
          agentId: session.agentId,
          timestamp: conversationMessage?.timestamp || new Date().toISOString(),
          smsStatus: smsResult.status,
          sessionInfo: {
            sessionId: session.sessionId,
            messageCount: session.messageCount + 1,
            duration: Math.floor((Date.now() - new Date(session.startTime)) / 1000)
          }
        }
      });
      
    } catch (error) {
      console.error('Error sending human control message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        code: 'MESSAGE_SEND_FAILED',
        details: error.message
      });
    }
  })
);

/**
 * @route POST /api/human-control/leave
 * @desc Agent leaves conversation and returns control to AI
 * @access Private (conversations:manage)
 */
router.post('/leave',
  authMiddleware.requirePermission('conversations:manage'),
  validateBody('humanControlLeave'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, leadId, summary, nextSteps, handoffSuccess = true } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    // Check if under human control
    const session = getHumanControlSession(phoneNumber, organizationId);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Conversation is not under human control',
        code: 'NOT_UNDER_HUMAN_CONTROL'
      });
    }
    
    // Security: Verify organization access
    if (!validateOrganizationAccess(session.organizationId, organizationId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this conversation',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }
    
    // Get any queued messages before ending session
    const queuedMessages = getQueuedMessages(phoneNumber, organizationId, true);
    
    // End human control session
    const endedSession = endHumanControlSession(phoneNumber, organizationId, {
      summary: summary,
      nextSteps: nextSteps || [],
      handoffSuccess: handoffSuccess,
      endedBy: userId
    });
    
    if (!endedSession) {
      return res.status(500).json({
        success: false,
        error: 'Failed to end human control session',
        code: 'SESSION_END_FAILED'
      });
    }
    
    // Store conversation summary if provided
    if (summary && conversationRouter && conversationRouter.storeConversationSummary) {
      await conversationRouter.storeConversationSummary(phoneNumber, summary, organizationId);
    }
    
    // Add system message to conversation history
    const systemMessage = summary ? 
      `Human agent ${endedSession.agentName} has ended the session. Summary: ${summary}. AI agent resumed.` :
      `Human agent ${endedSession.agentName} has ended the session. AI agent resumed.`;
      
    const conversationMessage = await addToConversationHistory(
      phoneNumber,
      systemMessage,
      'system',
      'system',
      organizationId
    );
    
    // Broadcast to UI via streaming system
    await broadcastHumanControlUpdate({
      type: 'human_control_ended',
      leadId,
      phoneNumber,
      organizationId,
      session: {
        sessionId: endedSession.sessionId,
        agentName: endedSession.agentName,
        agentId: endedSession.agentId,
        duration: endedSession.duration,
        messageCount: endedSession.messageCount,
        summary: endedSession.summary,
        nextSteps: endedSession.nextSteps,
        handoffSuccess: endedSession.handoffSuccess
      },
      queuedMessages: queuedMessages,
      systemMessage: conversationMessage
    });
    
    // Process any queued customer messages with AI
    if (queuedMessages.length > 0 && conversationRouter && conversationRouter.continueConversationWithSMS) {
      try {
        for (const queuedMsg of queuedMessages.filter(msg => msg.type === 'customer')) {
          await conversationRouter.continueConversationWithSMS(phoneNumber, queuedMsg.content, organizationId);
        }
      } catch (error) {
        console.error('Failed to process queued messages with AI:', error);
      }
    }
    
    res.json({
      success: true,
      message: 'Human control session ended successfully',
      data: {
        session: {
          sessionId: endedSession.sessionId,
          phoneNumber: endedSession.phoneNumber,
          leadId: endedSession.leadId,
          agentName: endedSession.agentName,
          agentId: endedSession.agentId,
          organizationId: endedSession.organizationId,
          startTime: endedSession.startTime,
          endTime: endedSession.endTime,
          duration: endedSession.duration,
          messageCount: endedSession.messageCount,
          summary: endedSession.summary,
          nextSteps: endedSession.nextSteps,
          handoffSuccess: endedSession.handoffSuccess,
          status: endedSession.status
        },
        queuedMessages: {
          total: queuedMessages.length,
          customerMessages: queuedMessages.filter(msg => msg.type === 'customer').length,
          processed: true
        },
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/human-control/status
 * @desc Check human control status for phone number or get agent's active sessions
 * @access Private (conversations:read)
 */
router.get('/status',
  authMiddleware.requirePermission('conversations:read'),
  validateQuery('humanControlStatus'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, includeAgentSessions = false } = req.query;
    const { organizationId, id: userId } = req.user;
    
    let statusData = {};
    
    // Get status for specific phone number
    if (phoneNumber) {
      const session = getHumanControlSession(phoneNumber, organizationId);
      const isUnderControl = !!session;
      
      // Security: Only return session data if user has access
      let sessionData = null;
      if (session && validateOrganizationAccess(session.organizationId, organizationId)) {
        sessionData = {
          sessionId: session.sessionId,
          agentName: session.agentName,
          agentId: session.agentId,
          startTime: session.startTime,
          lastActivity: session.lastActivity,
          duration: Math.floor((Date.now() - new Date(session.startTime)) / 1000),
          messageCount: session.messageCount,
          customerResponsesPending: session.customerResponsesPending,
          handoffReason: session.handoffReason,
          status: session.status
        };
      }
      
      statusData.phoneNumber = phoneNumber;
      statusData.isUnderHumanControl = isUnderControl;
      statusData.session = sessionData;
      statusData.queuedMessages = isUnderControl ? getQueuedMessagesCount(phoneNumber, organizationId) : 0;
    }
    
    // Get agent's active sessions if requested
    if (includeAgentSessions || !phoneNumber) {
      const agentSessions = [];
      
      if (agentConnections.has(userId)) {
        for (const sessionKey of agentConnections.get(userId)) {
          const session = humanControlSessions.get(sessionKey);
          if (session && validateOrganizationAccess(session.organizationId, organizationId)) {
            agentSessions.push({
              sessionId: session.sessionId,
              phoneNumber: session.phoneNumber,
              leadId: session.leadId,
              startTime: session.startTime,
              lastActivity: session.lastActivity,
              duration: Math.floor((Date.now() - new Date(session.startTime)) / 1000),
              messageCount: session.messageCount,
              customerResponsesPending: session.customerResponsesPending,
              handoffReason: session.handoffReason,
              status: session.status
            });
          }
        }
      }
      
      statusData.agentSessions = {
        total: agentSessions.length,
        active: agentSessions.filter(s => s.status === 'active').length,
        sessions: agentSessions
      };
    }
    
    // Global organization stats (admin only)
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      const orgSessions = [];
      for (const [key, session] of humanControlSessions.entries()) {
        if (session.organizationId === organizationId) {
          orgSessions.push(session);
        }
      }
      
      statusData.organizationStats = {
        totalActiveSessions: orgSessions.length,
        totalAgentsActive: new Set(orgSessions.map(s => s.agentId)).size,
        averageSessionDuration: orgSessions.length > 0 ? 
          Math.floor(orgSessions.reduce((sum, s) => sum + (Date.now() - new Date(s.startTime)) / 1000, 0) / orgSessions.length) : 0
      };
    }
    
    res.json({
      success: true,
      data: {
        organizationId,
        userId,
        timestamp: new Date().toISOString(),
        ...statusData
      }
    });
  })
);

/**
 * @route GET /api/human-control/queue/:phoneNumber
 * @desc Get queued messages for a conversation under human control
 * @access Private (conversations:read)
 */
router.get('/queue/:phoneNumber',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ phoneNumber: require('../middleware/validation').schemas.phoneNumber }),
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.params;
    const { organizationId } = req.user;
    const { includeProcessed = false } = req.query;
    
    // Check if under human control
    const session = getHumanControlSession(phoneNumber, organizationId);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Conversation is not under human control',
        code: 'NOT_UNDER_HUMAN_CONTROL'
      });
    }
    
    // Security: Verify organization access
    if (!validateOrganizationAccess(session.organizationId, organizationId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this conversation',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }
    
    const allMessages = getQueuedMessages(phoneNumber, organizationId);
    const messages = includeProcessed ? allMessages : allMessages.filter(msg => !msg.processed);
    
    res.json({
      success: true,
      data: {
        phoneNumber,
        sessionId: session.sessionId,
        agentName: session.agentName,
        messages: messages,
        stats: {
          total: allMessages.length,
          unprocessed: allMessages.filter(msg => !msg.processed).length,
          customerMessages: allMessages.filter(msg => !msg.processed && msg.type === 'customer').length,
          systemMessages: allMessages.filter(msg => !msg.processed && msg.type === 'system').length
        },
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/human-control/queue/:phoneNumber/process
 * @desc Mark queued messages as processed
 * @access Private (conversations:write)
 */
router.post('/queue/:phoneNumber/process',
  authMiddleware.requirePermission('conversations:write'),
  validateParams({ phoneNumber: require('../middleware/validation').schemas.phoneNumber }),
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.params;
    const { organizationId, id: userId } = req.user;
    const { messageIds = [] } = req.body; // Process specific messages or all if empty
    
    // Check if under human control
    const session = getHumanControlSession(phoneNumber, organizationId);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Conversation is not under human control',
        code: 'NOT_UNDER_HUMAN_CONTROL'
      });
    }
    
    // Security: Verify organization access
    if (!validateOrganizationAccess(session.organizationId, organizationId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this conversation',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }
    
    const sessionKey = createOrgSessionKey(organizationId, phoneNumber);
    const messages = messageQueues.get(sessionKey) || [];
    
    let processedCount = 0;
    
    messages.forEach(msg => {
      if (!msg.processed) {
        if (messageIds.length === 0 || messageIds.includes(msg.id)) {
          msg.processed = true;
          msg.processedBy = userId;
          msg.processedAt = new Date().toISOString();
          processedCount++;
        }
      }
    });
    
    // Update session activity
    updateSessionActivity(phoneNumber, organizationId, {
      customerResponsesPending: messages.filter(msg => !msg.processed && msg.type === 'customer').length
    });
    
    res.json({
      success: true,
      message: `${processedCount} messages marked as processed`,
      data: {
        phoneNumber,
        sessionId: session.sessionId,
        processedCount,
        remainingUnprocessed: messages.filter(msg => !msg.processed).length,
        processedBy: userId,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/human-control/sessions
 * @desc Get all active human control sessions for organization (admin/manager only)
 * @access Private (admin/manager)
 */
router.get('/sessions',
  authMiddleware.requireRole(['admin', 'manager']),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { page = 1, limit = 20, status = 'active' } = req.query;
    
    const allSessions = [];
    
    for (const [key, session] of humanControlSessions.entries()) {
      if (session.organizationId === organizationId) {
        if (status === 'all' || session.status === status) {
          allSessions.push({
            ...session,
            duration: Math.floor((Date.now() - new Date(session.startTime)) / 1000),
            queuedMessages: getQueuedMessagesCount(session.phoneNumber, session.organizationId),
            customerResponsesPending: getQueuedMessagesCount(session.phoneNumber, session.organizationId, 'customer')
          });
        }
      }
    }
    
    // Sort by start time (most recent first)
    allSessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedSessions = allSessions.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        sessions: paginatedSessions,
        stats: {
          total: allSessions.length,
          active: allSessions.filter(s => s.status === 'active').length,
          totalAgents: new Set(allSessions.map(s => s.agentId)).size,
          averageDuration: allSessions.length > 0 ? 
            Math.floor(allSessions.reduce((sum, s) => sum + s.duration, 0) / allSessions.length) : 0,
          totalMessages: allSessions.reduce((sum, s) => sum + s.messageCount, 0)
        }
      },
      pagination: {
        page,
        limit,
        total: allSessions.length,
        pages: Math.ceil(allSessions.length / limit),
        hasMore: startIndex + limit < allSessions.length
      }
    });
  })
);

// Webhook handler for incoming SMS during human control
async function handleIncomingSMSDuringHumanControl(phoneNumber, messageBody, organizationId) {
  if (isUnderHumanControl(phoneNumber, organizationId)) {
    // Queue the customer message for the human agent
    const queuedMessage = queueMessage(phoneNumber, organizationId, messageBody, 'customer');
    
    // Store in conversation history
    const conversationMessage = await addToConversationHistory(
      phoneNumber,
      messageBody,
      'user',
      'text',
      organizationId
    );
    
    // Get session info
    const session = getHumanControlSession(phoneNumber, organizationId);
    
    // Broadcast to agent UI
    await broadcastHumanControlUpdate({
      type: 'customer_message_received',
      phoneNumber,
      organizationId,
      leadId: session?.leadId,
      message: conversationMessage,
      queuedMessage: queuedMessage,
      session: session ? {
        sessionId: session.sessionId,
        agentName: session.agentName,
        agentId: session.agentId,
        customerResponsesPending: session.customerResponsesPending
      } : null
    });
    
    console.log(`📱 Customer SMS queued during human control: ${phoneNumber} -> ${session?.agentName}`);
    
    return {
      handled: true,
      queuedMessage,
      session
    };
  }
  
  return {
    handled: false
  };
}

// Session cleanup and monitoring
setInterval(() => {
  // Clean up stale sessions (sessions inactive for more than 2 hours)
  const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();
  
  for (const [key, session] of humanControlSessions.entries()) {
    const lastActivity = new Date(session.lastActivity).getTime();
    
    if (now - lastActivity > staleThreshold) {
      console.warn(`🧹 Cleaning up stale human control session: ${session.sessionId} (${session.agentName})`);
      
      // End the session automatically
      endHumanControlSession(session.phoneNumber, session.organizationId, {
        summary: 'Session automatically ended due to inactivity',
        handoffSuccess: false,
        endReason: 'timeout'
      });
      
      // Notify via broadcast
      broadcastHumanControlUpdate({
        type: 'human_control_timeout',
        phoneNumber: session.phoneNumber,
        organizationId: session.organizationId,
        leadId: session.leadId,
        session: session
      }).catch(console.error);
    }
  }
}, 15 * 60 * 1000); // Check every 15 minutes

// Export functions for integration with other modules
router.isUnderHumanControl = isUnderHumanControl;
router.getHumanControlSession = getHumanControlSession;
router.handleIncomingSMSDuringHumanControl = handleIncomingSMSDuringHumanControl;
router.queueMessage = queueMessage;
router.getQueuedMessages = getQueuedMessages;

module.exports = router;