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

module.exports = router;