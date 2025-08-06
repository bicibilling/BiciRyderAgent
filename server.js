/**
 * BICI AI Voice System - Main Server
 * Express server with comprehensive webhook handling and real-time features
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const http = require('http');

// Configuration and services
const { config, getOrgConfig } = require('./config');
const webhooksRouter = require('./routes/webhooks');
const { DashboardWebSocketManager } = require('./services/dashboard-websocket');
const { OutboundCallingManager } = require('./services/outbound-calling');
const { SMSAutomation } = require('./services/sms-automation');
const { ConversationStateManager } = require('./services/conversation-state');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize services
const stateManager = new ConversationStateManager();
const outboundCalling = new OutboundCallingManager();
const smsAutomation = new SMSAutomation();
let dashboardWSManager;

// =============================================
// MIDDLEWARE SETUP
// =============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: config.security.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id', 'x-twilio-signature', 'x-elevenlabs-signature']
}));

// Compression and logging
app.use(compression());
app.use(morgan('combined', {
  skip: (req, res) => config.server.nodeEnv === 'test'
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware for tracing
app.use((req, res, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// =============================================
// ROUTE HANDLERS
// =============================================

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.server.nodeEnv,
      
      services: {
        database: 'unknown',
        redis: 'unknown',
        elevenlabs: 'unknown',
        twilio: 'unknown'
      },
      
      features: config.features
    };

    // Check Redis health
    try {
      const redisHealth = await stateManager.healthCheck();
      health.services.redis = redisHealth.status;
    } catch (error) {
      health.services.redis = 'unhealthy';
    }

    // Check ElevenLabs connectivity
    try {
      const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': config.elevenlabs.apiKey }
      });
      health.services.elevenlabs = elevenLabsResponse.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      health.services.elevenlabs = 'unhealthy';
    }

    // Overall health status
    const serviceStatuses = Object.values(health.services);
    const hasUnhealthy = serviceStatuses.includes('unhealthy');
    health.status = hasUnhealthy ? 'degraded' : 'healthy';

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook routes
app.use('/api/webhooks', webhooksRouter);

// API Routes
app.get('/api/config', (req, res) => {
  // Return non-sensitive configuration
  res.json({
    organization: {
      name: config.business.organization.name,
      timezone: config.business.organization.timezone,
      defaultLanguage: config.business.organization.defaultLanguage
    },
    store: {
      address: config.business.store.address,
      city: config.business.store.city,
      province: config.business.store.province,
      phone: config.business.store.phone
    },
    hours: config.business.hours,
    features: config.features
  });
});

// Outbound calling API endpoint
app.post('/api/calls/outbound', async (req, res) => {
  try {
    const {
      phoneNumber,
      leadId,
      callReason,
      priority,
      scheduledTime,
      serviceDetails
    } = req.body;

    if (!phoneNumber || !callReason) {
      return res.status(400).json({
        error: 'Missing required fields: phoneNumber and callReason'
      });
    }

    let result;
    
    if (scheduledTime) {
      // Schedule for later
      result = await outboundCalling.scheduleOutboundCall({
        phoneNumber,
        leadId,
        callReason,
        priority,
        serviceDetails
      }, scheduledTime);
    } else {
      // Initiate immediately
      result = await outboundCalling.initiateOutboundCall({
        phoneNumber,
        leadId,
        callReason,
        priority,
        serviceDetails
      });
    }

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ Outbound call API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SMS sending API endpoint
app.post('/api/sms/send', async (req, res) => {
  try {
    const {
      phoneNumber,
      templateId,
      variables = {},
      language = 'en',
      messageType = 'manual'
    } = req.body;

    if (!phoneNumber || !templateId) {
      return res.status(400).json({
        error: 'Missing required fields: phoneNumber and templateId'
      });
    }

    const result = await smsAutomation.sendSMS(phoneNumber, templateId, variables, {
      messageType,
      language
    });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ SMS API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Analytics endpoint
app.get('/api/analytics/conversations', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    const organizationId = req.headers['x-organization-id'] || config.business.organization.id;
    
    const { ConversationLogger } = require('./services/conversation-logger');
    const conversationLogger = new ConversationLogger(organizationId);
    
    const analytics = await conversationLogger.getConversationAnalytics(organizationId, timeframe);
    
    res.json(analytics);

  } catch (error) {
    console.error('❌ Analytics API error:', error);
    res.status(500).json({
      error: 'Failed to get analytics'
    });
  }
});

// Dashboard data endpoint
app.get('/api/dashboard/active-conversations', async (req, res) => {
  try {
    const activeConversations = await stateManager.getActiveConversations();
    res.json(activeConversations);

  } catch (error) {
    console.error('❌ Dashboard API error:', error);
    res.status(500).json({
      error: 'Failed to get active conversations'
    });
  }
});

// Serve static files for dashboard (if in production)
if (config.server.nodeEnv === 'production') {
  app.use(express.static('public'));
  
  // Catch-all handler for SPA
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  
  res.status(500).json({
    error: config.server.nodeEnv === 'development' ? error.message : 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// =============================================
// WEBSOCKET SETUP FOR REAL-TIME DASHBOARD
// =============================================

if (config.features.realTimeDashboard) {
  dashboardWSManager = new DashboardWebSocketManager(config.business.organization.id);
  
  const wss = new WebSocketServer({ 
    server: server,
    path: '/ws/dashboard'
  });

  wss.on('connection', (ws, req) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    dashboardWSManager.handleDashboardConnection(ws, sessionId);
    
    console.log(`🔌 Dashboard WebSocket connected: ${sessionId}`);
  });

  console.log('✅ Real-time dashboard WebSocket server initialized');
}

// =============================================
// BACKGROUND TASKS AND SCHEDULING
// =============================================

// Process scheduled SMS tasks every minute
setInterval(async () => {
  if (config.features.smsAutomation) {
    try {
      await smsAutomation.processSMSTasks();
    } catch (error) {
      console.error('❌ SMS task processing error:', error);
    }
  }
}, 60000); // Every minute

// Process scheduled outbound calls every 30 seconds
setInterval(async () => {
  if (config.features.outboundCalling) {
    try {
      await outboundCalling.processScheduledCalls();
    } catch (error) {
      console.error('❌ Outbound call processing error:', error);
    }
  }
}, 30000); // Every 30 seconds

// Service reminders check every hour
setInterval(async () => {
  if (config.features.outboundCalling) {
    try {
      await outboundCalling.processServiceReminders();
    } catch (error) {
      console.error('❌ Service reminder processing error:', error);
    }
  }
}, 3600000); // Every hour

// =============================================
// SERVER STARTUP
// =============================================

const PORT = config.server.port;
const HOST = config.server.host;

server.listen(PORT, HOST, () => {
  console.log('🚴‍♂️ =============================================');
  console.log('🚴‍♂️  BICI AI VOICE SYSTEM STARTED');
  console.log('🚴‍♂️ =============================================');
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${config.server.nodeEnv}`);
  console.log(`🏪 Organization: ${config.business.organization.name}`);
  console.log('');
  console.log('📡 Active Webhooks:');
  console.log(`   • ElevenLabs: ${config.server.baseUrl}/api/webhooks/elevenlabs/*`);
  console.log(`   • Twilio: ${config.server.baseUrl}/api/webhooks/twilio/*`);
  if (config.integrations.shopify.accessToken) {
    console.log(`   • Shopify: ${config.server.baseUrl}/api/webhooks/shopify/*`);
  }
  if (config.integrations.hubspot.accessToken) {
    console.log(`   • HubSpot: ${config.server.baseUrl}/api/webhooks/hubspot/*`);
  }
  console.log('');
  console.log('🎯 Active Features:');
  Object.entries(config.features).forEach(([feature, enabled]) => {
    if (enabled) {
      console.log(`   ✅ ${feature.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    }
  });
  console.log('');
  console.log('🔗 API Endpoints:');
  console.log(`   • Health Check: GET ${config.server.baseUrl}/health`);
  console.log(`   • Outbound Calls: POST ${config.server.baseUrl}/api/calls/outbound`);
  console.log(`   • Send SMS: POST ${config.server.baseUrl}/api/sms/send`);
  console.log(`   • Analytics: GET ${config.server.baseUrl}/api/analytics/conversations`);
  if (config.features.realTimeDashboard) {
    console.log(`   • Dashboard WebSocket: ws://${HOST}:${PORT}/ws/dashboard`);
  }
  console.log('');
  console.log('✅ BICI AI Voice System ready to handle calls!');
  console.log('🚴‍♂️ =============================================');
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  
  try {
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // Disconnect Redis
    await stateManager.disconnect();
    
    // Close WebSocket connections
    if (dashboardWSManager) {
      // dashboardWSManager.closeAllConnections();
    }

    console.log('✅ BICI AI Voice System shut down complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

module.exports = { app, server };