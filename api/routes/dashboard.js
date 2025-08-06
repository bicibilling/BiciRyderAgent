/**
 * Dashboard Routes
 * Real-time dashboard data and management endpoints
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateParams, validateBody } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route GET /api/dashboard/overview
 * @desc Get dashboard overview data
 * @access Private (dashboard:read)
 */
router.get('/overview',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock data - in production, fetch from database and real-time services
    const overviewData = {
      activeConversations: 3,
      totalCallsToday: 45,
      totalCallsThisWeek: 287,
      totalCallsThisMonth: 1205,
      
      callStats: {
        answered: 42,
        missed: 3,
        humanTakeovers: 8,
        avgDuration: 245 // seconds
      },
      
      leadStats: {
        newLeads: 35,
        qualifiedLeads: 28,
        convertedLeads: 12,
        conversionRate: 42.9
      },
      
      systemHealth: {
        apiStatus: 'healthy',
        databaseStatus: 'healthy',
        elevenLabsStatus: 'healthy',
        twilioStatus: 'healthy',
        uptime: 99.98
      },
      
      recentActivity: [
        {
          id: 'activity_1',
          type: 'call_completed',
          message: 'Call completed with +1234567890',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          duration: 180,
          outcome: 'lead_created'
        },
        {
          id: 'activity_2',
          type: 'human_takeover',
          message: 'Agent took over conversation with +1987654321',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          agent: 'John Smith'
        },
        {
          id: 'activity_3',
          type: 'appointment_booked',
          message: 'Service appointment scheduled for customer',
          timestamp: new Date(Date.now() - 900000).toISOString(),
          service: 'bike_tune_up'
        }
      ]
    };
    
    res.json({
      success: true,
      data: overviewData,
      metadata: {
        organizationId,
        refreshedAt: new Date().toISOString(),
        nextRefresh: new Date(Date.now() + 30000).toISOString()
      }
    });
  })
);

/**
 * @route GET /api/dashboard/active-conversations
 * @desc Get currently active conversations
 * @access Private (dashboard:read)
 */
router.get('/active-conversations',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock active conversations
    const activeConversations = [
      {
        id: 'conv_1',
        customerPhone: '+1234567890',
        customerName: 'John Doe',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 120000).toISOString(),
        duration: 120,
        isHumanTakeover: false,
        agentName: null,
        lastMessage: 'I am looking for a mountain bike for weekend rides',
        sentiment: 'positive',
        leadQualityScore: 85
      },
      {
        id: 'conv_2',
        customerPhone: '+1987654321',
        customerName: 'Jane Smith',
        status: 'human_takeover',
        startedAt: new Date(Date.now() - 300000).toISOString(),
        duration: 300,
        isHumanTakeover: true,
        agentName: 'Mike Johnson',
        lastMessage: 'Let me check our inventory for that specific model',
        sentiment: 'neutral',
        leadQualityScore: 92
      },
      {
        id: 'conv_3',
        customerPhone: '+1555666777',
        customerName: null,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 60000).toISOString(),
        duration: 60,
        isHumanTakeover: false,
        agentName: null,
        lastMessage: 'Hello, I need help with my bike repair',
        sentiment: 'neutral',
        leadQualityScore: 45
      }
    ];
    
    res.json({
      success: true,
      data: {
        conversations: activeConversations,
        total: activeConversations.length,
        byStatus: {
          in_progress: activeConversations.filter(c => c.status === 'in_progress').length,
          human_takeover: activeConversations.filter(c => c.status === 'human_takeover').length,
          on_hold: 0,
          transferring: 0
        }
      },
      metadata: {
        organizationId,
        refreshedAt: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/dashboard/metrics/realtime
 * @desc Get real-time metrics
 * @access Private (dashboard:read)
 */
router.get('/metrics/realtime',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock real-time metrics
    const realtimeMetrics = {
      timestamp: new Date().toISOString(),
      
      calls: {
        active: 3,
        queued: 0,
        completed_last_hour: 12,
        missed_last_hour: 1
      },
      
      agents: {
        online: 2,
        busy: 1,
        available: 1,
        total: 4
      },
      
      system: {
        cpu_usage: 35.2,
        memory_usage: 68.7,
        api_response_time: 145,
        websocket_connections: 8
      },
      
      performance: {
        avg_response_time: 1.2,
        success_rate: 98.5,
        ai_accuracy: 94.2,
        customer_satisfaction: 4.6
      }
    };
    
    res.json({
      success: true,
      data: realtimeMetrics,
      metadata: {
        organizationId,
        interval: '30s',
        nextUpdate: new Date(Date.now() + 30000).toISOString()
      }
    });
  })
);

/**
 * @route GET /api/dashboard/alerts
 * @desc Get system alerts and notifications
 * @access Private (dashboard:read)
 */
router.get('/alerts',
  authMiddleware.requirePermission('dashboard:read'),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { page, limit } = req.query;
    
    // Mock alerts
    const alerts = [
      {
        id: 'alert_1',
        type: 'warning',
        category: 'system',
        title: 'High Call Volume',
        message: 'Receiving 30% more calls than usual today',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        acknowledged: false,
        severity: 'medium'
      },
      {
        id: 'alert_2',
        type: 'info',
        category: 'integration',
        title: 'Shopify Inventory Updated',
        message: 'Inventory data synchronized successfully',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        acknowledged: true,
        severity: 'low'
      },
      {
        id: 'alert_3',
        type: 'error',
        category: 'service',
        title: 'ElevenLabs API Timeout',
        message: 'Temporary timeout resolved automatically',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        acknowledged: true,
        severity: 'high'
      }
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedAlerts = alerts.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        alerts: paginatedAlerts,
        unacknowledged: alerts.filter(a => !a.acknowledged).length,
        bySeverity: {
          high: alerts.filter(a => a.severity === 'high').length,
          medium: alerts.filter(a => a.severity === 'medium').length,
          low: alerts.filter(a => a.severity === 'low').length
        }
      },
      pagination: {
        page,
        limit,
        total: alerts.length,
        pages: Math.ceil(alerts.length / limit),
        hasNext: startIndex + limit < alerts.length
      }
    });
  })
);

/**
 * @route PATCH /api/dashboard/alerts/:alertId/acknowledge
 * @desc Acknowledge an alert
 * @access Private (dashboard:write)
 */
router.patch('/alerts/:alertId/acknowledge',
  authMiddleware.requirePermission('dashboard:write'),
  validateParams({ alertId: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    const { id: userId } = req.user;
    
    // In production, update alert in database
    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      data: {
        alertId,
        acknowledgedBy: userId,
        acknowledgedAt: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/dashboard/agents
 * @desc Get agent status and availability
 * @access Private (dashboard:read)
 */
router.get('/agents',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock agent data
    const agents = [
      {
        id: 'agent_1',
        name: 'John Smith',
        email: 'john@bici.bike',
        status: 'available',
        currentConversation: null,
        totalCallsToday: 12,
        avgCallDuration: 185,
        lastActivity: new Date(Date.now() - 300000).toISOString(),
        skills: ['sales', 'technical_support']
      },
      {
        id: 'agent_2',
        name: 'Sarah Johnson',
        email: 'sarah@bici.bike',
        status: 'busy',
        currentConversation: 'conv_2',
        totalCallsToday: 18,
        avgCallDuration: 220,
        lastActivity: new Date().toISOString(),
        skills: ['sales', 'customer_service', 'french']
      },
      {
        id: 'agent_3',
        name: 'Mike Davis',
        email: 'mike@bici.bike',
        status: 'offline',
        currentConversation: null,
        totalCallsToday: 0,
        avgCallDuration: 0,
        lastActivity: new Date(Date.now() - 7200000).toISOString(),
        skills: ['technical_support', 'repairs']
      }
    ];
    
    res.json({
      success: true,
      data: {
        agents,
        summary: {
          total: agents.length,
          available: agents.filter(a => a.status === 'available').length,
          busy: agents.filter(a => a.status === 'busy').length,
          offline: agents.filter(a => a.status === 'offline').length
        }
      }
    });
  })
);

/**
 * @route GET /api/dashboard/queue
 * @desc Get call queue status
 * @access Private (dashboard:read)
 */
router.get('/queue',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock queue data
    const queueData = {
      waiting: [],
      avgWaitTime: 0,
      maxWaitTime: 0,
      totalProcessedToday: 45,
      abandonedCalls: 3,
      abandonmentRate: 6.7,
      
      historical: [
        { hour: new Date().getHours() - 1, calls: 8, avgWait: 15 },
        { hour: new Date().getHours(), calls: 12, avgWait: 8 }
      ]
    };
    
    res.json({
      success: true,
      data: queueData,
      metadata: {
        organizationId,
        refreshedAt: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/dashboard/settings
 * @desc Get dashboard settings
 * @access Private (dashboard:read)
 */
router.get('/settings',
  authMiddleware.requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const { organizationId, id: userId } = req.user;
    
    // Mock settings
    const settings = {
      userId,
      organizationId,
      
      display: {
        theme: 'light',
        density: 'comfortable',
        language: 'en',
        timezone: 'America/Toronto'
      },
      
      notifications: {
        newCalls: true,
        humanTakeovers: true,
        systemAlerts: true,
        emailDigest: false,
        soundEnabled: true
      },
      
      dashboard: {
        refreshInterval: 30000,
        autoSubscribeConversations: true,
        showCallTranscripts: true,
        showAnalytics: true,
        compactView: false
      },
      
      integrations: {
        shopifyEnabled: true,
        hubspotEnabled: true,
        calendarEnabled: true
      }
    };
    
    res.json({
      success: true,
      data: settings
    });
  })
);

/**
 * @route PATCH /api/dashboard/settings
 * @desc Update dashboard settings
 * @access Private (dashboard:write)
 */
router.patch('/settings',
  authMiddleware.requirePermission('dashboard:write'),
  asyncHandler(async (req, res) => {
    const { id: userId } = req.user;
    const updates = req.body;
    
    // In production, validate and save settings to database
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        userId,
        updatedFields: Object.keys(updates),
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/dashboard/broadcast
 * @desc Broadcast message to dashboard clients
 * @access Private (dashboard:write)
 */
router.post('/broadcast',
  authMiddleware.requirePermission('dashboard:write'),
  validateBody('broadcastMessage'),
  asyncHandler(async (req, res) => {
    const { message, type, targetUsers } = req.body;
    const { organizationId, id: userId } = req.user;
    
    // In production, broadcast via WebSocket manager
    const broadcastId = `broadcast_${Date.now()}`;
    
    res.json({
      success: true,
      message: 'Broadcast sent successfully',
      data: {
        broadcastId,
        sentBy: userId,
        messageType: type,
        targetUsers: targetUsers || 'all',
        timestamp: new Date().toISOString()
      }
    });
  })
);

module.exports = router;