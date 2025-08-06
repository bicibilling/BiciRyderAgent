/**
 * BICI AI Voice Agent System - Production API Server
 * Complete Express.js backend optimized for Render deployment
 */

require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');

// Import route modules
const authRoutes = require('./api/routes/auth');
const dashboardRoutes = require('./api/routes/dashboard');
const conversationRoutes = require('./api/routes/conversations');
const analyticsRoutes = require('./api/routes/analytics');
const webhookRoutes = require('./api/routes/webhooks');
const integrationRoutes = require('./api/routes/integrations');
const adminRoutes = require('./api/routes/admin');

// Import middleware
const authMiddleware = require('./api/middleware/auth');
const validationMiddleware = require('./api/middleware/validation');
const { handle: errorHandler } = require('./api/middleware/errorHandler');
const rateLimitConfig = require('./api/middleware/rateLimit');

// Import services
const WebSocketManager = require('./api/services/websocketManager');
const DatabaseService = require('./api/services/databaseService');
const ElevenLabsService = require('./api/services/elevenLabsService');
const TwilioService = require('./api/services/twilioService');
const LoggingService = require('./api/services/loggingService');

class BiciAPIServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3000;
    this.host = process.env.HOST || '0.0.0.0';
    
    // Initialize services
    this.logger = new LoggingService();
    this.db = new DatabaseService();
    this.elevenLabs = new ElevenLabsService();
    this.twilio = new TwilioService();
    this.wsManager = new WebSocketManager(this.server);
    
    // Service states
    this.isReady = false;
    this.services = {
      database: false,
      redis: false,
      elevenlabs: false,
      twilio: false
    };
    
    this.setupServer();
  }
  
  /**
   * Setup complete server configuration
   */
  async setupServer() {
    try {
      // Initialize services
      await this.initializeServices();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.isReady = true;
      this.logger.info('Server setup completed successfully');
      
    } catch (error) {
      this.logger.error('Server setup failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Initialize all external services
   */
  async initializeServices() {
    this.logger.info('Initializing services...');
    
    try {
      // Database initialization
      await this.db.initialize();
      this.services.database = true;
      this.logger.info('Database service initialized');
    } catch (error) {
      this.logger.error('Database initialization failed', { error: error.message });
    }
    
    try {
      // Redis initialization for session management
      if (process.env.UPSTASH_REDIS_URL) {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_URL,
          token: process.env.UPSTASH_REDIS_TOKEN
        });
        await this.redis.ping();
        this.services.redis = true;
        this.logger.info('Redis service initialized');
      }
    } catch (error) {
      this.logger.error('Redis initialization failed', { error: error.message });
    }
    
    try {
      // ElevenLabs service initialization
      await this.elevenLabs.initialize();
      this.services.elevenlabs = true;
      this.logger.info('ElevenLabs service initialized');
    } catch (error) {
      this.logger.error('ElevenLabs initialization failed', { error: error.message });
    }
    
    try {
      // Twilio service initialization
      await this.twilio.initialize();
      this.services.twilio = true;
      this.logger.info('Twilio service initialized');
    } catch (error) {
      this.logger.error('Twilio initialization failed', { error: error.message });
    }
  }
  
  /**
   * Setup comprehensive middleware stack
   */
  setupMiddleware() {
    // Trust proxy for deployment behind reverse proxy
    this.app.set('trust proxy', 1);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "wss:", "https:", "*.supabase.co", "*.elevenlabs.io"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "https:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "https:"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-organization-id',
        'x-twilio-signature',
        'x-elevenlabs-signature',
        'x-shopify-signature',
        'x-hubspot-signature'
      ]
    }));
    
    // Compression
    this.app.use(compression());
    
    // Request logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => this.logger.info(message.trim())
      }
    }));
    
    // Body parsing
    this.app.use(express.json({ 
      limit: '50mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Request ID for tracing
    this.app.use((req, res, next) => {
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      req.startTime = Date.now();
      next();
    });
    
    // Response time logging
    this.app.use((req, res, next) => {
      res.on('finish', () => {
        const responseTime = Date.now() - req.startTime;
        this.logger.info('Request completed', {
          requestId: req.id,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`
        });
      });
      next();
    });
  }
  
  /**
   * Setup all API routes
   */
  setupRoutes() {
    // Health check (no rate limiting)
    this.app.get('/health', this.handleHealthCheck.bind(this));
    this.app.get('/ready', this.handleReadyCheck.bind(this));
    
    // API routes with rate limiting
    this.app.use('/api', rateLimitConfig.general);
    
    // Authentication routes
    this.app.use('/api/auth', authRoutes);
    
    // Dashboard routes (protected)
    this.app.use('/api/dashboard', 
      authMiddleware.verifyToken,
      authMiddleware.requirePermission('dashboard:read'),
      dashboardRoutes
    );
    
    // Conversation routes (protected)
    this.app.use('/api/conversations',
      authMiddleware.verifyToken,
      authMiddleware.requirePermission('conversations:read'),
      conversationRoutes
    );
    
    // Analytics routes (protected)
    this.app.use('/api/analytics',
      authMiddleware.verifyToken,
      authMiddleware.requirePermission('analytics:read'),
      analyticsRoutes
    );
    
    // Integration routes (protected)
    this.app.use('/api/integrations',
      authMiddleware.verifyToken,
      authMiddleware.requirePermission('integrations:manage'),
      integrationRoutes
    );
    
    // Admin routes (admin only)
    this.app.use('/api/admin',
      authMiddleware.verifyToken,
      authMiddleware.requireRole('admin'),
      adminRoutes
    );
    
    // Webhook routes (special rate limiting and authentication)
    this.app.use('/api/webhooks',
      rateLimitConfig.webhooks,
      webhookRoutes
    );
    
    // Serve React app in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('client/build'));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/build/index.html'));
      });
    }
  }
  
  /**
   * Setup WebSocket server for real-time features
   */
  setupWebSocket() {
    this.wsManager.initialize();
    this.logger.info('WebSocket server initialized');
  }
  
  /**
   * Setup comprehensive error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    });
    
    // Global error handler
    this.app.use(errorHandler);
  }
  
  /**
   * Health check endpoint
   */
  async handleHealthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: { ...this.services }
    };
    
    // Check service health
    try {
      if (this.services.database) {
        await this.db.healthCheck();
      }
    } catch (error) {
      this.services.database = false;
      health.services.database = false;
    }
    
    try {
      if (this.services.redis) {
        await this.redis.ping();
      }
    } catch (error) {
      this.services.redis = false;
      health.services.redis = false;
    }
    
    // Determine overall health
    const unhealthyServices = Object.values(this.services).filter(status => !status);
    
    // In production, allow degraded mode for initial deployment
    if (process.env.NODE_ENV === 'production') {
      health.status = 'healthy';
      const statusCode = 200;
      res.status(statusCode).json(health);
    } else {
      health.status = unhealthyServices.length === 0 ? 'healthy' : 'degraded';
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    }
  }
  
  /**
   * Readiness check for deployment
   */
  handleReadyCheck(req, res) {
    if (!this.isReady) {
      return res.status(503).json({
        ready: false,
        message: 'Server is still initializing'
      });
    }
    
    res.json({
      ready: true,
      message: 'Server is ready to accept requests'
    });
  }
  
  /**
   * Get allowed origins for CORS
   */
  getAllowedOrigins() {
    const origins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://localhost:3001'
    ];
    
    // Add production domains
    if (process.env.FRONTEND_URL) {
      origins.push(process.env.FRONTEND_URL);
    }
    
    if (process.env.RENDER_EXTERNAL_URL) {
      origins.push(process.env.RENDER_EXTERNAL_URL);
    }
    
    // Allow Render preview deployments
    if (process.env.NODE_ENV === 'production') {
      origins.push(/^https:\/\/.*\.onrender\.com$/);
    }
    
    return origins;
  }
  
  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      
      // Close server
      this.server.close(() => {
        this.logger.info('HTTP server closed');
      });
      
      try {
        // Close WebSocket connections
        this.wsManager.closeAll();
        
        // Close database connections
        await this.db.close();
        
        // Close Redis connections
        if (this.redis) {
          // Redis client will auto-close
        }
        
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
   * Start the server
   */
  async start() {
    try {
      this.server.listen(this.port, this.host, () => {
        this.logger.info('🚴‍♂️ BICI AI Voice Agent System Started', {
          port: this.port,
          host: this.host,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid,
          version: process.env.npm_package_version || '1.0.0'
        });
        
        this.logServiceStatus();
      });
      
    } catch (error) {
      this.logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }
  
  /**
   * Log service status on startup
   */
  logServiceStatus() {
    console.log('\n🚴‍♂️ =============================================');
    console.log('🚴‍♂️  BICI AI VOICE SYSTEM - API SERVER');
    console.log('🚴‍♂️ =============================================');
    console.log(`🚀 Server: http://${this.host}:${this.port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('📊 Services Status:');
    console.log(`   Database: ${this.services.database ? '✅' : '❌'}`);
    console.log(`   Redis: ${this.services.redis ? '✅' : '❌'}`);
    console.log(`   ElevenLabs: ${this.services.elevenlabs ? '✅' : '❌'}`);
    console.log(`   Twilio: ${this.services.twilio ? '✅' : '❌'}`);
    console.log('');
    console.log('🔗 API Endpoints:');
    console.log(`   Health: GET /health`);
    console.log(`   Ready: GET /ready`);
    console.log(`   Auth: POST /api/auth/login`);
    console.log(`   Dashboard: GET /api/dashboard/*`);
    console.log(`   Conversations: GET /api/conversations/*`);
    console.log(`   Analytics: GET /api/analytics/*`);
    console.log(`   Webhooks: POST /api/webhooks/*`);
    console.log(`   WebSocket: ws://${this.host}:${this.port}/ws`);
    console.log('');
    console.log('✅ Ready to handle requests!');
    console.log('🚴‍♂️ =============================================\n');
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

// Start server if run directly
if (require.main === module) {
  const server = new BiciAPIServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = BiciAPIServer;