require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { logger } = require('./config/logger');
const database = require('./config/database');
const security = require('./middleware/security');
const auth = require('./middleware/auth');
const { errorHandler } = require('./utils/error-handler');

// Import route handlers
const MainServerToolHandler = require('./server-tools/tool-handlers/main-handler');
const ElevenLabsConversationHandler = require('./webhooks/elevenlabs/conversation-handler');
const ShopifyOrderHandler = require('./webhooks/shopify/order-handler');
const HubSpotContactHandler = require('./webhooks/hubspot/contact-handler');
const ElevenLabsAgentConfig = require('./server-tools/elevenlabs-config/agent-config');

class BiciAIServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.logger = logger.child({ component: 'server' });
    
    // Initialize handlers
    this.serverToolHandler = new MainServerToolHandler();
    this.elevenlabsHandler = new ElevenLabsConversationHandler();
    this.shopifyHandler = new ShopifyOrderHandler();
    this.hubspotHandler = new HubSpotContactHandler();
    this.agentConfig = new ElevenLabsAgentConfig();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware stack
   */
  setupMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

    // Basic security and CORS
    this.app.use(...security.createSecurityStack());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // General rate limiting
    this.app.use(security.getGeneralRateLimit());
  }

  /**
   * Setup application routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'BICI AI Voice Agent System',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Server tools routes (protected)
    this.app.use('/api/server-tools', 
      ...security.createServerToolsSecurityStack(),
      auth.authenticateServerTools(),
      this.serverToolHandler.getRouter()
    );

    // ElevenLabs webhook routes
    this.app.post('/api/webhooks/elevenlabs/conversation',
      ...security.createWebhookSecurityStack(),
      auth.authenticateElevenLabsWebhook(),
      this.elevenlabsHandler.handleWebhook.bind(this.elevenlabsHandler)
    );

    // Shopify webhook routes
    this.app.post('/api/webhooks/shopify/orders',
      ...security.createWebhookSecurityStack(),
      auth.authenticateShopifyWebhook(),
      this.shopifyHandler.handleOrderWebhook.bind(this.shopifyHandler)
    );

    // HubSpot webhook routes
    this.app.post('/api/webhooks/hubspot/contacts',
      ...security.createWebhookSecurityStack(),
      auth.authenticateHubSpotWebhook(),
      this.hubspotHandler.handleContactWebhook.bind(this.hubspotHandler)
    );

    // Agent configuration endpoint
    this.app.get('/api/agent/config',
      auth.authenticateServerTools(),
      async (req, res) => {
        try {
          const language = req.query.language || 'en';
          const config = this.agentConfig.getLanguageSpecificConfig(language);
          
          res.json({
            success: true,
            config: config
          });
        } catch (error) {
          this.logger.error('Failed to get agent config', { error: error.message });
          res.status(500).json({
            success: false,
            error: 'Failed to retrieve agent configuration'
          });
        }
      }
    );

    // Integration testing endpoint
    this.app.post('/api/admin/test-integrations',
      auth.authenticateServerTools(),
      async (req, res) => {
        try {
          const results = await this.agentConfig.testAllIntegrations();
          res.json(results);
        } catch (error) {
          this.logger.error('Integration testing failed', { error: error.message });
          res.status(500).json({
            success: false,
            error: 'Integration testing failed'
          });
        }
      }
    );

    // API key information endpoint
    this.app.get('/api/admin/api-keys',
      auth.authenticateServerTools(),
      (req, res) => {
        const apiKeyInfo = auth.getApiKeyInfo();
        res.json({
          success: true,
          api_keys: apiKeyInfo
        });
      }
    );

    // Server configuration endpoint
    this.app.get('/api/admin/config',
      auth.authenticateServerTools(),
      (req, res) => {
        res.json({
          success: true,
          config: {
            node_env: process.env.NODE_ENV,
            port: this.port,
            has_redis: !!process.env.UPSTASH_REDIS_URL,
            has_supabase: !!process.env.SUPABASE_URL,
            has_elevenlabs: !!process.env.ELEVENLABS_API_KEY,
            has_shopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
            has_hubspot: !!process.env.HUBSPOT_ACCESS_TOKEN,
            has_google_calendar: !!process.env.GOOGLE_CLIENT_ID,
            default_organization: process.env.DEFAULT_ORGANIZATION_ID,
            default_timezone: process.env.DEFAULT_TIMEZONE
          }
        });
      }
    );
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use(errorHandler.handle404());

    // Global error handler
    this.app.use(errorHandler.handleError());
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Test database connections
      this.logger.info('Testing database connections...');
      const dbConnected = await database.testConnections();
      
      if (!dbConnected) {
        this.logger.warn('Database connections failed, but starting server anyway');
      }

      // Start HTTP server
      this.server = this.app.listen(this.port, () => {
        this.logger.info('BICI AI Voice Agent System started', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid
        });

        // Log configuration status
        this.logConfigurationStatus();
      });

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Log current configuration status
   */
  logConfigurationStatus() {
    const configs = {
      'Redis': !!process.env.UPSTASH_REDIS_URL,
      'Supabase': !!process.env.SUPABASE_URL,
      'ElevenLabs': !!process.env.ELEVENLABS_API_KEY,
      'Shopify': !!process.env.SHOPIFY_ACCESS_TOKEN,
      'HubSpot': !!process.env.HUBSPOT_ACCESS_TOKEN,
      'Google Calendar': !!process.env.GOOGLE_CLIENT_ID,
      'Twilio': !!process.env.TWILIO_ACCOUNT_SID
    };

    this.logger.info('Configuration status', configs);
    
    const missingConfigs = Object.entries(configs)
      .filter(([_, configured]) => !configured)
      .map(([service, _]) => service);

    if (missingConfigs.length > 0) {
      this.logger.warn('Missing configurations', { services: missingConfigs });
    }
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);

      // Stop accepting new connections
      this.server.close(() => {
        this.logger.info('HTTP server closed');
      });

      try {
        // Close database connections
        await database.closeConnections();
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { 
        error: error.message,
        stack: error.stack 
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', { 
        reason: reason,
        promise: promise 
      });
      process.exit(1);
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new BiciAIServer();
  server.start();
}

module.exports = BiciAIServer;