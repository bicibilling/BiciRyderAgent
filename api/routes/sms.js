/**
 * SMS API Routes
 * Complete SMS management endpoints with templates, sending, and tracking
 */

const express = require('express');
const SMSService = require('../services/smsService');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateParams, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Initialize SMS service
const smsService = new SMSService();

// Import human control routes for integration
let humanControlRoutes;
try {
  humanControlRoutes = require('./human-control');
} catch (error) {
  console.error('Failed to import human control router:', error);
}

/**
 * @route POST /api/sms/send
 * @desc Send SMS message with template or custom content
 * @access Private (conversations:write)
 */
router.post('/send',
  authMiddleware.requirePermission('conversations:write'),
  validateBody('smsMessage'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { 
      phoneNumber, 
      templateId, 
      message, 
      variables = {}, 
      language = 'en',
      messageType = 'manual',
      priority = 'normal',
      scheduledTime,
      leadId
    } = req.body;
    
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    try {
      // Check if conversation is under human control
      let isHumanControlled = false;
      let humanSession = null;
      
      if (humanControlRoutes && humanControlRoutes.isUnderHumanControl) {
        isHumanControlled = humanControlRoutes.isUnderHumanControl(phoneNumber, organizationId);
        if (isHumanControlled) {
          humanSession = humanControlRoutes.getHumanControlSession(phoneNumber, organizationId);
        }
      }
      
      // If under human control and this isn't from the controlling agent, deny
      if (isHumanControlled && humanSession && humanSession.agentId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Conversation is under human control by another agent',
          code: 'CONVERSATION_CONTROLLED_BY_OTHER_AGENT',
          data: {
            controllingAgent: humanSession.agentName,
            agentId: humanSession.agentId
          }
        });
      }
      
      // Build message content
      const messageContent = templateId ? null : message;
      
      // Send SMS with comprehensive options
      const result = await smsService.sendSMS(phoneNumber, messageContent, {
        templateId,
        variables,
        language,
        organizationId,
        leadId,
        priority,
        scheduledTime,
        maxRetries: 3,
        messageType,
        agentId: isHumanControlled ? userId : null,
        conversationContext: {
          sentByUser: userEmail,
          sentByAgent: isHumanControlled,
          sessionId: humanSession?.sessionId || null
        }
      });
      
      if (result.success) {
        // Add to conversation history
        const conversationMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          phoneNumber,
          content: templateId ? 
            `Sent SMS template: ${templateId}` : 
            message,
          sentBy: isHumanControlled ? 'human_agent' : 'ai_agent',
          type: 'text',
          timestamp: new Date().toISOString(),
          organizationId,
          leadId,
          messageId: result.messageId,
          templateId,
          agentId: isHumanControlled ? userId : null,
          priority
        };
        
        // Store in conversation history (if available)
        if (typeof addToConversationHistory === 'function') {
          addToConversationHistory(phoneNumber, conversationMessage.content, conversationMessage.sentBy, 'text', organizationId);
        }
        
        // Broadcast to UI
        if (typeof broadcastConversationUpdate === 'function') {
          await broadcastConversationUpdate({
            type: 'sms_sent',
            leadId,
            phoneNumber,
            organizationId,
            message: conversationMessage,
            messageId: result.messageId,
            templateId,
            sentBy: isHumanControlled ? 'human_agent' : 'system',
            agentName: isHumanControlled ? userEmail : null,
            priority,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          success: true,
          message: 'SMS sent successfully',
          data: {
            messageId: result.messageId,
            phoneNumber,
            organizationId,
            leadId,
            templateId,
            sentBy: isHumanControlled ? 'human_agent' : 'system',
            priority,
            scheduledTime,
            conversationMessageId: conversationMessage.id,
            timestamp: result.sentAt
          }
        });
        
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send SMS',
          code: 'SMS_SEND_FAILED',
          details: result.error
        });
      }
      
    } catch (error) {
      console.error('Error in SMS send endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error sending SMS',
        code: 'INTERNAL_SERVER_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route POST /api/sms/bulk-send
 * @desc Send bulk SMS messages to multiple recipients
 * @access Private (conversations:write + admin/manager)
 */
router.post('/bulk-send',
  authMiddleware.requireRole(['admin', 'manager']),
  validateBody('smsBulkSend'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const {
      recipients,
      templateId,
      commonVariables = {},
      batchSize = 10,
      batchDelay = 1000
    } = req.body;
    
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    try {
      // Validate recipients array
      if (recipients.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Too many recipients (max 100 per batch)',
          code: 'BULK_RECIPIENT_LIMIT_EXCEEDED'
        });
      }
      
      console.log(`📱 Starting bulk SMS send to ${recipients.length} recipients using template ${templateId}`);
      
      const result = await smsService.sendBulkSMS(recipients, templateId, commonVariables, {
        batchSize,
        batchDelay,
        organizationId
      });
      
      // Log bulk send activity
      console.log(`📱 Bulk SMS completed: ${result.successful} sent, ${result.failed} failed`);
      
      // Broadcast bulk send completion to UI
      if (typeof broadcastConversationUpdate === 'function') {
        await broadcastConversationUpdate({
          type: 'bulk_sms_completed',
          organizationId,
          templateId,
          totalRecipients: recipients.length,
          successful: result.successful,
          failed: result.failed,
          sentBy: userEmail,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        message: 'Bulk SMS send completed',
        data: {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          templateId,
          organizationId,
          sentBy: userEmail,
          timestamp: new Date().toISOString(),
          // Include individual results for detailed tracking
          results: result.results.map(r => ({
            phoneNumber: r.phoneNumber,
            success: r.success,
            messageId: r.messageId,
            error: r.error
          }))
        }
      });
      
    } catch (error) {
      console.error('Error in bulk SMS send endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error in bulk SMS send',
        code: 'BULK_SMS_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route GET /api/sms/templates
 * @desc Get available SMS templates
 * @access Private (conversations:read)
 */
router.get('/templates',
  authMiddleware.requirePermission('conversations:read'),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { language, category, page = 1, limit = 50 } = req.query;
    
    try {
      const templates = smsService.getAvailableTemplates(language);
      
      let filteredTemplates = templates;
      
      // Filter by category if specified
      if (category) {
        Object.keys(filteredTemplates).forEach(lang => {
          filteredTemplates[lang] = Object.fromEntries(
            Object.entries(filteredTemplates[lang]).filter(
              ([id, template]) => template.category === category
            )
          );
        });
      }
      
      // Count total templates
      const totalTemplates = Object.values(filteredTemplates).reduce(
        (sum, langTemplates) => sum + Object.keys(langTemplates).length, 0
      );
      
      res.json({
        success: true,
        data: {
          templates: filteredTemplates,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalTemplates,
            pages: Math.ceil(totalTemplates / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Error fetching SMS templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch SMS templates',
        code: 'TEMPLATE_FETCH_ERROR'
      });
    }
  })
);

/**
 * @route GET /api/sms/delivery-stats
 * @desc Get SMS delivery statistics
 * @access Private (conversations:read)
 */
router.get('/delivery-stats',
  authMiddleware.requirePermission('conversations:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    try {
      const stats = smsService.getDeliveryStats();
      
      res.json({
        success: true,
        data: {
          organizationId,
          deliveryStats: stats,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Error fetching delivery stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch delivery statistics',
        code: 'DELIVERY_STATS_ERROR'
      });
    }
  })
);

/**
 * @route POST /api/sms/schedule
 * @desc Schedule SMS message for future delivery
 * @access Private (conversations:write)
 */
router.post('/schedule',
  authMiddleware.requirePermission('conversations:write'),
  validateBody('smsSchedule'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const {
      phoneNumber,
      templateId,
      message,
      variables = {},
      language = 'en',
      scheduledTime,
      messageType,
      leadId,
      repeatInterval = 'none',
      maxOccurrences = 1
    } = req.body;
    
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    try {
      // Validate scheduled time is in future
      const scheduleDate = new Date(scheduledTime);
      const now = new Date();
      
      if (scheduleDate <= now) {
        return res.status(400).json({
          success: false,
          error: 'Scheduled time must be in the future',
          code: 'INVALID_SCHEDULE_TIME'
        });
      }
      
      // Check if too far in the future (max 30 days)
      const maxFutureDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      if (scheduleDate > maxFutureDate) {
        return res.status(400).json({
          success: false,
          error: 'Cannot schedule SMS more than 30 days in advance',
          code: 'SCHEDULE_TOO_FAR_FUTURE'
        });
      }
      
      // For now, we'll use immediate sending with scheduled time
      // In production, this would integrate with a job queue system
      const messageContent = templateId ? null : message;
      
      const result = await smsService.sendSMS(phoneNumber, messageContent, {
        templateId,
        variables,
        language,
        organizationId,
        leadId,
        scheduledTime: scheduledTime,
        messageType: `scheduled_${messageType}`,
        priority: 'normal',
        maxRetries: 3,
        agentId: userId
      });
      
      if (result.success) {
        res.json({
          success: true,
          message: 'SMS scheduled successfully',
          data: {
            messageId: result.messageId,
            phoneNumber,
            scheduledTime,
            templateId,
            organizationId,
            leadId,
            repeatInterval,
            maxOccurrences,
            scheduledBy: userEmail,
            timestamp: new Date().toISOString()
          }
        });
        
        // Broadcast scheduled SMS info to UI
        if (typeof broadcastConversationUpdate === 'function') {
          await broadcastConversationUpdate({
            type: 'sms_scheduled',
            leadId,
            phoneNumber,
            organizationId,
            messageId: result.messageId,
            scheduledTime,
            templateId,
            scheduledBy: userEmail,
            timestamp: new Date().toISOString()
          });
        }
        
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to schedule SMS',
          code: 'SMS_SCHEDULE_FAILED',
          details: result.error
        });
      }
      
    } catch (error) {
      console.error('Error in SMS schedule endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error scheduling SMS',
        code: 'SCHEDULE_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route GET /api/sms/conversation/:phoneNumber
 * @desc Get SMS conversation history for a phone number
 * @access Private (conversations:read)
 */
router.get('/conversation/:phoneNumber',
  authMiddleware.requirePermission('conversations:read'),
  validateParams({ phoneNumber: require('../middleware/validation').schemas.phoneNumber }),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.params;
    const { organizationId } = req.user;
    const { limit = 50, offset = 0 } = req.query;
    
    try {
      // In production, this would fetch from database
      // For now, mock the response with SMS conversation data
      const smsHistory = [
        {
          id: 'sms_1',
          phoneNumber,
          direction: 'inbound',
          content: 'Hi, do you have mountain bikes in stock?',
          status: 'received',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          messageId: 'SM1234567890'
        },
        {
          id: 'sms_2',
          phoneNumber,
          direction: 'outbound',
          content: 'Yes! We have several mountain bikes available. What\'s your budget range?',
          status: 'delivered',
          timestamp: new Date(Date.now() - 3500000).toISOString(),
          messageId: 'SM0987654321',
          templateId: 'product_inquiry'
        }
      ];
      
      const total = smsHistory.length;
      const paginatedHistory = smsHistory.slice(offset, offset + limit);
      
      res.json({
        success: true,
        data: {
          phoneNumber,
          organizationId,
          messages: paginatedHistory,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (offset + limit) < total
          },
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Error fetching SMS conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch SMS conversation',
        code: 'SMS_CONVERSATION_FETCH_ERROR'
      });
    }
  })
);

/**
 * @route POST /api/sms/human-control-intro
 * @desc Send SMS when human agent takes control of conversation
 * @access Private (conversations:manage)
 */
router.post('/human-control-intro',
  authMiddleware.requirePermission('conversations:manage'),
  validateBody('humanControlMessage'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { phoneNumber, message: customMessage, leadId } = req.body;
    const { organizationId, id: userId, email: userEmail } = req.user;
    
    try {
      // Check if actually under human control
      let isHumanControlled = false;
      let humanSession = null;
      
      if (humanControlRoutes && humanControlRoutes.isUnderHumanControl) {
        isHumanControlled = humanControlRoutes.isUnderHumanControl(phoneNumber, organizationId);
        if (isHumanControlled) {
          humanSession = humanControlRoutes.getHumanControlSession(phoneNumber, organizationId);
        }
      }
      
      if (!isHumanControlled) {
        return res.status(400).json({
          success: false,
          error: 'Conversation is not under human control',
          code: 'NOT_UNDER_HUMAN_CONTROL'
        });
      }
      
      // Verify agent has control
      if (humanSession.agentId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'You do not control this conversation',
          code: 'NO_CONTROL_PERMISSION'
        });
      }
      
      // Send human control introduction SMS
      const result = await smsService.sendHumanControlIntroduction(phoneNumber, {
        agentName: humanSession.agentName,
        agentId: userId,
        customerName: leadId // In production, get from lead data
      }, {
        customMessage,
        organizationId,
        leadId,
        language: 'en' // In production, get from user preferences
      });
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Human control introduction SMS sent',
          data: {
            messageId: result.messageId,
            phoneNumber,
            agentName: humanSession.agentName,
            sessionId: humanSession.sessionId,
            customMessage,
            timestamp: result.sentAt
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send human control introduction',
          code: 'HUMAN_CONTROL_SMS_FAILED',
          details: result.error
        });
      }
      
    } catch (error) {
      console.error('Error in human control SMS endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: error.message
      });
    }
  })
);

// Event listeners for SMS service
smsService.on('sms_sent_success', (data) => {
  console.log(`📱 SMS sent successfully: ${data.messageId} to ${data.phoneNumber}`);
});

smsService.on('sms_send_error', (data) => {
  console.error(`📱 SMS send failed to ${data.phoneNumber}: ${data.error}`);
});

smsService.on('delivery_status_update', (data) => {
  console.log(`📱 SMS delivery update: ${data.messageId} -> ${data.status}`);
  
  // Broadcast delivery status to UI if available
  if (typeof broadcastConversationUpdate === 'function') {
    broadcastConversationUpdate({
      type: 'sms_delivery_update',
      messageId: data.messageId,
      status: data.status,
      errorCode: data.errorCode,
      timestamp: new Date().toISOString()
    }).catch(console.error);
  }
});

smsService.on('sms_permanently_failed', (data) => {
  console.error(`📱 SMS permanently failed: ${data.messageId}`);
  
  // Broadcast permanent failure to UI for attention
  if (typeof broadcastConversationUpdate === 'function') {
    broadcastConversationUpdate({
      type: 'sms_permanent_failure',
      messageId: data.messageId,
      phoneNumber: data.tracking.phoneNumber,
      organizationId: data.tracking.organizationId,
      priority: 'high',
      timestamp: new Date().toISOString()
    }).catch(console.error);
  }
});

module.exports = router;