/**
 * Call Management Routes
 * Handle outbound calls, call control, and call status
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// This will be injected by the main server
let conversationBridge = null;

/**
 * Set ConversationBridge instance
 */
function setConversationBridge(bridge) {
  conversationBridge = bridge;
}

/**
 * Start outbound call
 */
router.post('/outbound/start', authMiddleware, asyncHandler(async (req, res) => {
  const { phoneNumber, leadId, dynamicVariables, priority } = req.body;
  const organizationId = req.user.organizationId;
  
  // Validation
  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required',
      code: 'PHONE_NUMBER_REQUIRED'
    });
  }
  
  if (!leadId) {
    return res.status(400).json({
      success: false,
      error: 'Lead ID is required',
      code: 'LEAD_ID_REQUIRED'
    });
  }
  
  // Validate phone number format (basic)
  const phoneRegex = /^\+?[1-9]\d{10,14}$/;
  if (!phoneRegex.test(phoneNumber.replace(/[^\d+]/g, ''))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format',
      code: 'INVALID_PHONE_FORMAT'
    });
  }
  
  try {
    console.log(`📞 Outbound call request: ${phoneNumber} (Lead: ${leadId})`);
    
    // Check if ConversationBridge is available
    if (!conversationBridge) {
      return res.status(503).json({
        success: false,
        error: 'Conversation service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    // Start outbound call
    const result = await conversationBridge.startOutboundCall(
      phoneNumber,
      leadId,
      organizationId,
      {
        dynamicVariables: dynamicVariables || {},
        priority: priority || 'normal',
        initiatedBy: req.user.id,
        initiatedByEmail: req.user.email
      }
    );
    
    console.log(`✅ Outbound call initiated:`, result);
    
    res.json({
      success: true,
      data: {
        conversationId: result.conversationId,
        callId: result.callId,
        leadId: result.leadId,
        phoneNumber: phoneNumber,
        organizationId: organizationId,
        status: 'initiated',
        message: 'Call initiated successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start outbound call:', error);
    
    // Handle specific error types
    let statusCode = 500;
    let errorCode = 'CALL_INITIATION_FAILED';
    
    if (error.message.includes('agent ID not configured')) {
      statusCode = 503;
      errorCode = 'AGENT_NOT_CONFIGURED';
    } else if (error.message.includes('ElevenLabs')) {
      statusCode = 503;
      errorCode = 'ELEVENLABS_SERVICE_ERROR';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorCode = 'RATE_LIMIT_EXCEEDED';
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * Get call status
 */
router.get('/status/:callId', authMiddleware, asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const organizationId = req.user.organizationId;
  
  try {
    // In production, this would query call status from database/service
    // For now, return mock status
    const status = {
      callId: callId,
      status: 'in_progress', // in_progress, completed, failed, cancelled
      duration: Math.floor(Math.random() * 300) + 30, // 30-330 seconds
      organizationId: organizationId,
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('❌ Failed to get call status:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve call status',
      code: 'CALL_STATUS_ERROR'
    });
  }
}));

/**
 * End/Cancel call
 */
router.post('/end/:callId', authMiddleware, asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { reason } = req.body;
  const organizationId = req.user.organizationId;
  
  try {
    console.log(`📞 Call end request: ${callId} (${reason})`);
    
    // Check if ConversationBridge is available
    if (!conversationBridge) {
      return res.status(503).json({
        success: false,
        error: 'Conversation service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    // In production, this would end the actual call via ElevenLabs
    // For now, just acknowledge the request
    
    res.json({
      success: true,
      data: {
        callId: callId,
        status: 'ended',
        reason: reason || 'manual_end',
        endedBy: req.user.email,
        endedAt: new Date().toISOString(),
        message: 'Call ended successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to end call:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to end call',
      code: 'CALL_END_ERROR'
    });
  }
}));

/**
 * Get conversation metrics
 */
router.get('/metrics', authMiddleware, asyncHandler(async (req, res) => {
  try {
    // Check if ConversationBridge is available
    if (!conversationBridge) {
      return res.status(503).json({
        success: false,
        error: 'Conversation service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    const metrics = conversationBridge.getMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
    
  } catch (error) {
    console.error('❌ Failed to get conversation metrics:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      code: 'METRICS_ERROR'
    });
  }
}));

/**
 * Get active conversations
 */
router.get('/active', authMiddleware, asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  
  try {
    // In production, this would query active conversations from database
    // For now, return mock data filtered by organization
    const activeConversations = [];
    
    if (conversationBridge) {
      const metrics = conversationBridge.getMetrics();
      
      // Mock active conversations for demonstration
      for (let i = 0; i < metrics.totalActiveConversations; i++) {
        activeConversations.push({
          conversationId: `conv_${Date.now()}_${i}`,
          leadId: `lead_${Date.now()}_${i}`,
          phoneNumber: `+1555000${String(i).padStart(4, '0')}`,
          organizationId: organizationId,
          status: i % 3 === 0 ? 'call_active' : 'sms_conversation',
          isUnderHumanControl: i % 4 === 0,
          lastActivity: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          agentId: i % 4 === 0 ? req.user.id : null
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        conversations: activeConversations,
        total: activeConversations.length,
        organizationId: organizationId
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get active conversations:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active conversations',
      code: 'ACTIVE_CONVERSATIONS_ERROR'
    });
  }
}));

module.exports = router;
module.exports.setConversationBridge = setConversationBridge;