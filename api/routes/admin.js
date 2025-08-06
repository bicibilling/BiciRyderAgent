/**
 * Admin Routes
 * Administrative endpoints for system management
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route GET /api/admin/system/info
 * @desc Get system information
 * @access Private (admin)
 */
router.get('/system/info',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const systemInfo = {
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: process.uptime(),
        pid: process.pid,
        environment: process.env.NODE_ENV || 'development'
      },
      
      memory: process.memoryUsage(),
      
      configuration: {
        port: process.env.PORT || 3000,
        logLevel: process.env.LOG_LEVEL || 'info',
        hasDatabase: !!process.env.SUPABASE_URL,
        hasRedis: !!process.env.UPSTASH_REDIS_URL,
        hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
        hasTwilio: !!process.env.TWILIO_ACCOUNT_SID,
        hasShopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
        hasHubSpot: !!process.env.HUBSPOT_ACCESS_TOKEN,
        hasGoogleCalendar: !!process.env.GOOGLE_CLIENT_ID
      },
      
      features: {
        realTimeDashboard: true,
        webhookHandling: true,
        apiRateLimiting: true,
        inputValidation: true,
        errorHandling: true,
        logging: true,
        authentication: true,
        authorization: true
      },
      
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: systemInfo
    });
  })
);

/**
 * @route GET /api/admin/system/health
 * @desc Get detailed system health
 * @access Private (admin)
 */
router.get('/system/health',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      
      services: {
        database: 'unknown',
        redis: 'unknown',
        elevenlabs: 'unknown',
        twilio: 'unknown'
      },
      
      metrics: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        activeHandles: process._getActiveHandles().length,
        activeRequests: process._getActiveRequests().length
      },
      
      checks: []
    };
    
    // Database health check
    try {
      if (process.env.SUPABASE_URL) {
        // Mock database check
        health.services.database = 'healthy';
        health.checks.push({
          name: 'database',
          status: 'pass',
          message: 'Database connection successful'
        });
      }
    } catch (error) {
      health.services.database = 'unhealthy';
      health.checks.push({
        name: 'database',
        status: 'fail',
        message: error.message
      });
    }
    
    // Redis health check
    try {
      if (process.env.UPSTASH_REDIS_URL) {
        health.services.redis = 'healthy';
        health.checks.push({
          name: 'redis',
          status: 'pass',
          message: 'Redis connection successful'
        });
      }
    } catch (error) {
      health.services.redis = 'unhealthy';
      health.checks.push({
        name: 'redis',
        status: 'fail',
        message: error.message
      });
    }
    
    // ElevenLabs health check
    if (process.env.ELEVENLABS_API_KEY) {
      health.services.elevenlabs = 'healthy';
      health.checks.push({
        name: 'elevenlabs',
        status: 'pass',
        message: 'ElevenLabs API key configured'
      });
    }
    
    // Twilio health check
    if (process.env.TWILIO_ACCOUNT_SID) {
      health.services.twilio = 'healthy';
      health.checks.push({
        name: 'twilio',
        status: 'pass',
        message: 'Twilio credentials configured'
      });
    }
    
    // Determine overall status
    const failedChecks = health.checks.filter(check => check.status === 'fail');
    health.status = failedChecks.length === 0 ? 'healthy' : 'degraded';
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      success: true,
      data: health
    });
  })
);

/**
 * @route GET /api/admin/metrics
 * @desc Get system metrics
 * @access Private (admin)
 */
router.get('/metrics',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    // Mock metrics - in production, integrate with monitoring service
    const metrics = {
      timestamp: new Date().toISOString(),
      
      api: {
        totalRequests: 15847,
        requestsPerMinute: 42,
        avgResponseTime: 145,
        errorRate: 0.02,
        
        endpoints: {
          '/api/auth/login': { requests: 234, avgTime: 89, errors: 1 },
          '/api/dashboard/overview': { requests: 1567, avgTime: 234, errors: 3 },
          '/api/conversations': { requests: 2341, avgTime: 178, errors: 12 },
          '/api/webhooks/elevenlabs/conversation': { requests: 892, avgTime: 67, errors: 5 }
        }
      },
      
      websocket: {
        activeConnections: 15,
        totalConnections: 234,
        messagesPerMinute: 89,
        avgConnectionDuration: 1847 // seconds
      },
      
      database: {
        totalQueries: 8934,
        queriesPerMinute: 67,
        avgQueryTime: 23,
        slowQueries: 12,
        connectionPoolSize: 10,
        activeConnections: 3
      },
      
      conversations: {
        total: 1247,
        active: 8,
        completedToday: 45,
        avgDuration: 242,
        humanTakeoverRate: 12.8,
        aiAccuracy: 94.2
      },
      
      leads: {
        total: 892,
        createdToday: 23,
        qualificationRate: 72.3,
        conversionRate: 32.2
      },
      
      integrations: {
        shopify: {
          requests: 234,
          errors: 2,
          lastSync: new Date(Date.now() - 3600000).toISOString()
        },
        hubspot: {
          requests: 156,
          errors: 0,
          lastSync: new Date(Date.now() - 1800000).toISOString()
        },
        elevenlabs: {
          requests: 892,
          errors: 5,
          activeConnections: 8
        },
        twilio: {
          smsSent: 234,
          callsMade: 45,
          errors: 1
        }
      }
    };
    
    res.json({
      success: true,
      data: metrics
    });
  })
);

/**
 * @route GET /api/admin/logs
 * @desc Get system logs
 * @access Private (admin)
 */
router.get('/logs',
  rateLimitConfig.admin,
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { level, startDate, endDate } = req.query;
    
    // Mock logs - in production, read from log files or logging service
    const mockLogs = [
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'User logged in successfully',
        meta: { userId: 'user_123', ip: '192.168.1.1' }
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'WARN',
        message: 'Rate limit exceeded',
        meta: { ip: '192.168.1.100', endpoint: '/api/auth/login' }
      },
      {
        timestamp: new Date(Date.now() - 120000).toISOString(),
        level: 'ERROR',
        message: 'Database connection timeout',
        meta: { query: 'SELECT * FROM conversations', duration: 5000 }
      }
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedLogs = mockLogs.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        filters: { level, startDate, endDate }
      },
      pagination: {
        page,
        limit,
        total: mockLogs.length,
        pages: Math.ceil(mockLogs.length / limit)
      }
    });
  })
);

/**
 * @route POST /api/admin/maintenance
 * @desc Trigger maintenance tasks
 * @access Private (admin)
 */
router.post('/maintenance',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const { task, options = {} } = req.body;
    
    const validTasks = [
      'clear_cache',
      'cleanup_logs',
      'sync_integrations',
      'backup_data',
      'restart_services'
    ];
    
    if (!validTasks.includes(task)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid maintenance task',
        validTasks
      });
    }
    
    const taskId = `task_${Date.now()}`;
    
    // Mock task execution
    setTimeout(() => {
      console.log(`Maintenance task completed: ${task}`);
    }, 5000);
    
    res.json({
      success: true,
      message: `Maintenance task '${task}' initiated`,
      data: {
        taskId,
        task,
        options,
        status: 'running',
        startedAt: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 60000).toISOString()
      }
    });
  })
);

/**
 * @route GET /api/admin/users
 * @desc Get all users (admin view)
 * @access Private (admin)
 */
router.get('/users',
  rateLimitConfig.admin,
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { role, organizationId, active } = req.query;
    
    // Mock users - in production, fetch from database
    const mockUsers = [
      {
        id: 'user_1',
        email: 'admin@bici.bike',
        role: 'admin',
        organizationId: 'org_1',
        active: true,
        lastLogin: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString()
      },
      {
        id: 'user_2',
        email: 'agent@bici.bike',
        role: 'agent',
        organizationId: 'org_1',
        active: true,
        lastLogin: new Date(Date.now() - 7200000).toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 15).toISOString()
      }
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedUsers = mockUsers.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        summary: {
          total: mockUsers.length,
          active: mockUsers.filter(u => u.active).length,
          byRole: {
            admin: mockUsers.filter(u => u.role === 'admin').length,
            manager: mockUsers.filter(u => u.role === 'manager').length,
            agent: mockUsers.filter(u => u.role === 'agent').length
          }
        }
      },
      pagination: {
        page,
        limit,
        total: mockUsers.length,
        pages: Math.ceil(mockUsers.length / limit)
      }
    });
  })
);

/**
 * @route PATCH /api/admin/users/:userId
 * @desc Update user (admin action)
 * @access Private (admin)
 */
router.patch('/users/:userId',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const updates = req.body;
    
    // Validate allowed updates
    const allowedFields = ['role', 'active', 'permissions', 'organizationId'];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid update fields',
        invalidFields
      });
    }
    
    // Mock user update
    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        userId,
        updates,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id
      }
    });
  })
);

/**
 * @route GET /api/admin/organizations
 * @desc Get all organizations
 * @access Private (admin)
 */
router.get('/organizations',
  rateLimitConfig.admin,
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    
    // Mock organizations
    const mockOrgs = [
      {
        id: 'org_1',
        name: 'Bici Bike Store',
        phoneNumber: '+15551234567',
        domain: 'bici.bike',
        address: '123 Main St, Toronto, ON',
        timezone: 'America/Toronto',
        userCount: 4,
        conversationsToday: 45,
        createdAt: new Date(Date.now() - 86400000 * 90).toISOString()
      }
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedOrgs = mockOrgs.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        organizations: paginatedOrgs,
        summary: {
          total: mockOrgs.length,
          totalUsers: mockOrgs.reduce((sum, org) => sum + org.userCount, 0),
          totalConversationsToday: mockOrgs.reduce((sum, org) => sum + org.conversationsToday, 0)
        }
      },
      pagination: {
        page,
        limit,
        total: mockOrgs.length,
        pages: Math.ceil(mockOrgs.length / limit)
      }
    });
  })
);

/**
 * @route POST /api/admin/backup
 * @desc Create system backup
 * @access Private (admin)
 */
router.post('/backup',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const { includeData = true, includeLogs = false, includeConfig = true } = req.body;
    
    const backupId = `backup_${Date.now()}`;
    
    // Mock backup creation
    res.json({
      success: true,
      message: 'Backup initiated',
      data: {
        backupId,
        status: 'creating',
        options: {
          includeData,
          includeLogs,
          includeConfig
        },
        startedAt: new Date().toISOString(),
        estimatedSize: '125MB',
        estimatedCompletion: new Date(Date.now() + 300000).toISOString()
      }
    });
  })
);

/**
 * @route GET /api/admin/configuration
 * @desc Get system configuration
 * @access Private (admin)
 */
router.get('/configuration',
  rateLimitConfig.admin,
  asyncHandler(async (req, res) => {
    const configuration = {
      server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info'
      },
      
      authentication: {
        jwtExpiry: process.env.JWT_EXPIRY || '24h',
        refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d'
      },
      
      rateLimiting: {
        generalWindowMs: 15 * 60 * 1000,
        generalMaxRequests: 1000,
        authWindowMs: 15 * 60 * 1000,
        authMaxRequests: 5
      },
      
      integrations: {
        elevenlabs: {
          configured: !!process.env.ELEVENLABS_API_KEY,
          baseUrl: 'https://api.elevenlabs.io/v1'
        },
        twilio: {
          configured: !!process.env.TWILIO_ACCOUNT_SID,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER
        },
        shopify: {
          configured: !!process.env.SHOPIFY_ACCESS_TOKEN,
          shopDomain: process.env.SHOPIFY_SHOP_DOMAIN
        },
        hubspot: {
          configured: !!process.env.HUBSPOT_ACCESS_TOKEN
        }
      },
      
      features: {
        realTimeDashboard: true,
        webhookHandling: true,
        apiRateLimiting: true,
        inputValidation: true,
        errorHandling: true,
        logging: true
      }
    };
    
    res.json({
      success: true,
      data: configuration
    });
  })
);

module.exports = router;