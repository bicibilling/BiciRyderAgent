/**
 * Dashboard Server
 * Express server for serving the real-time dashboard and handling API routes
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import DashboardWebSocketManager from '../websocket/dashboard-websocket-manager.js';
import AuthenticationManager from '../auth/authentication.js';
import TwilioIntegration from '../integrations/twilio-integration.js';
import HubSpotIntegration from '../integrations/hubspot-integration.js';
import ShopifyIntegration from '../integrations/shopify-integration.js';
import CalendarIntegration from '../integrations/calendar-integration.js';
import HealthMonitor from '../monitoring/health-monitor.js';
import ProductionSecurity from '../middleware/production-security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(organizationId = 'bici-bike-store') {
    this.organizationId = organizationId;
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3000;
    this.dashboardPort = process.env.DASHBOARD_WS_PORT || 8080;
    
    // Initialize integrations
    this.auth = new AuthenticationManager();
    this.dashboardWS = new DashboardWebSocketManager(organizationId);
    this.twilio = new TwilioIntegration(organizationId);
    this.hubspot = new HubSpotIntegration(organizationId);
    this.shopify = new ShopifyIntegration(organizationId);
    this.calendar = new CalendarIntegration(organizationId);
    this.healthMonitor = new HealthMonitor();
    this.security = new ProductionSecurity();
    
    this.setupExpress();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware
   */
  setupExpress() {
    // Apply production security middleware stack
    const securityStack = this.security.getSecurityStack();
    securityStack.forEach(middleware => {
      this.app.use(middleware);
    });

    // Compression
    this.app.use(compression());

    // Body parsing with security limits
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf, encoding) => {
        // Additional request verification if needed
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Static files with security headers
    this.app.use('/dashboard', express.static(path.join(__dirname), {
      setHeaders: (res, path, stat) => {
        // Add security headers for static files
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'DENY');
        
        // Set appropriate cache headers
        if (path.endsWith('.js') || path.endsWith('.css')) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.set('Cache-Control', 'public, max-age=3600');
        }
      }
    }));
    
    // Enhanced request logging
    this.app.use((req, res, next) => {
      const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        organization: this.organizationId
      };
      
      // Log security-relevant requests
      if (req.path.includes('auth') || req.path.includes('admin')) {
        console.log('Security request:', logData);
      } else {
        console.log(`${logData.timestamp} - ${logData.method} ${logData.path}`);
      }
      
      next();
    });
  }

  /**
   * Set up all API routes
   */
  setupRoutes() {
    // Health check endpoints
    this.app.get('/health', (req, res) => {
      const healthStatus = this.healthMonitor.getHealthStatus();
      res.status(healthStatus.status === 'critical' ? 503 : 200).json({
        status: healthStatus.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        organization: this.organizationId,
        connections: {
          dashboard_clients: this.dashboardWS.clientConnections.size,
          active_conversations: this.dashboardWS.activeConnections.size
        },
        health: healthStatus
      });
    });

    // Detailed health check
    this.app.get('/health/detailed', (req, res) => {
      const detailedReport = this.healthMonitor.getDetailedReport();
      res.json(detailedReport);
    });

    // Health check for specific service
    this.app.get('/health/:service', async (req, res) => {
      try {
        const { service } = req.params;
        const healthStatus = this.healthMonitor.getHealthStatus();
        
        if (healthStatus.checks && healthStatus.checks[service]) {
          const serviceHealth = healthStatus.checks[service];
          res.status(serviceHealth.status === 'critical' ? 503 : 200).json(serviceHealth);
        } else {
          res.status(404).json({
            status: 'error',
            message: `Health check for service '${service}' not found`
          });
        }
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: 'Failed to get service health status'
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const metrics = this.healthMonitor.getMetrics();
      res.json(metrics);
    });

    // Dashboard routes
    this.app.get('/', (req, res) => {
      res.redirect('/dashboard');
    });

    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard.html'));
    });

    // Authentication routes
    this.setupAuthRoutes();

    // Webhook routes
    this.setupWebhookRoutes();

    // API routes with authentication
    this.setupAPIRoutes();

    // Integration routes
    this.setupIntegrationRoutes();
  }

  /**
   * Authentication routes
   */
  setupAuthRoutes() {
    // Apply authentication-specific security middleware
    const authSecurity = this.security.getAuthSecurityStack();
    
    // Generate signed URL for ElevenLabs WebSocket
    this.app.post('/api/elevenlabs/signed-url', 
      ...authSecurity,
      this.auth.authMiddleware(), 
      async (req, res) => {
      try {
        const { leadId } = req.body;
        const organizationId = req.auth.organization_id;

        const result = await this.auth.generateSignedURL(organizationId, leadId);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(500).json(result);
        }

      } catch (error) {
        console.error('Signed URL generation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate signed URL'
        });
      }
    });

    // Generate API key
    this.app.post('/api/auth/create-key', 
      ...authSecurity,
      this.auth.authMiddleware(), 
      async (req, res) => {
      try {
        const { permissions, description } = req.body;
        const organizationId = req.auth.organization_id;

        const result = this.auth.createAPIKey(organizationId, permissions, description);
        res.json(result);

      } catch (error) {
        console.error('API key creation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create API key'
        });
      }
    });

    // JWT token generation (for demo purposes)
    this.app.post('/api/auth/token', 
      ...authSecurity,
      async (req, res) => {
      try {
        const { organization_id } = req.body;

        if (!organization_id) {
          return res.status(400).json({
            error: 'organization_id required'
          });
        }

        const result = this.auth.generateJWTToken({
          organization_id: organization_id,
          permissions: ['dashboard', 'api'],
          type: 'dashboard_access'
        });

        res.json(result);

      } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({
          error: 'Failed to generate token'
        });
      }
    });
  }

  /**
   * Webhook routes for integrations
   */
  setupWebhookRoutes() {
    // Apply webhook-specific security middleware
    const webhookSecurity = this.security.getWebhookSecurityStack();
    
    // Twilio incoming call webhook
    this.app.post('/api/webhooks/twilio/incoming', 
      ...webhookSecurity,
      async (req, res) => {
        await this.twilio.handleIncomingCall(req, res);
      });

    // Twilio status callback webhook
    this.app.post('/api/webhooks/twilio/status', 
      ...webhookSecurity,
      async (req, res) => {
        await this.twilio.handleStatusCallback(req, res);
      });

    // ElevenLabs personalization webhook
    this.app.post('/api/webhooks/elevenlabs/twilio-personalization', 
      ...webhookSecurity,
      async (req, res) => {
        await this.twilio.handlePersonalizationWebhook(req, res);
      });

    // Shopify webhooks (order updates, customer updates, etc.)
    this.app.post('/api/webhooks/shopify/orders', 
      ...webhookSecurity,
      this.auth.authMiddleware(), 
      async (req, res) => {
      try {
        console.log('📦 Shopify order webhook received');
        
        // Process order update
        const orderData = req.body;
        
        // Broadcast to dashboard if relevant
        this.dashboardWS.broadcastToDashboard({
          type: 'order_update',
          order: orderData,
          timestamp: new Date().toISOString()
        });

        res.status(200).send('OK');

      } catch (error) {
        console.error('Shopify webhook error:', error);
        res.status(500).send('Error processing webhook');
      }
    });
  }

  /**
   * Main API routes
   */
  setupAPIRoutes() {
    // Get organization stats
    this.app.get('/api/organizations/:orgId/stats', this.auth.authMiddleware(), async (req, res) => {
      try {
        const stats = this.dashboardWS.getStats();
        const authStats = this.auth.getAuthStats();

        res.json({
          organization_id: this.organizationId,
          dashboard: stats,
          auth: authStats,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });

    // Start new conversation
    this.app.post('/api/conversations/start', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { leadId, customerPhone, callSid } = req.body;

        if (!leadId || !customerPhone) {
          return res.status(400).json({
            error: 'leadId and customerPhone are required'
          });
        }

        const websocket = await this.dashboardWS.createConversationWebSocket(
          leadId, 
          customerPhone, 
          callSid
        );

        res.json({
          success: true,
          conversation_id: websocket.conversationId,
          lead_id: leadId,
          status: websocket.getStatus()
        });

      } catch (error) {
        console.error('Conversation start error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to start conversation'
        });
      }
    });

    // Get active conversations
    this.app.get('/api/conversations/active', this.auth.authMiddleware(), async (req, res) => {
      try {
        const conversations = [];
        
        for (const [leadId, websocket] of this.dashboardWS.activeConnections.entries()) {
          conversations.push({
            lead_id: leadId,
            status: websocket.getStatus(),
            state: await this.dashboardWS.getConversationState(leadId)
          });
        }

        res.json({
          success: true,
          conversations: conversations,
          total: conversations.length
        });

      } catch (error) {
        console.error('Active conversations error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get active conversations'
        });
      }
    });

    // Inject context into conversation
    this.app.post('/api/conversations/:leadId/context', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { leadId } = req.params;
        const { context } = req.body;

        const websocket = this.dashboardWS.activeConnections.get(leadId);
        if (!websocket) {
          return res.status(404).json({
            error: 'Conversation not found'
          });
        }

        websocket.sendContextualUpdate(context);

        res.json({
          success: true,
          message: 'Context injected successfully'
        });

      } catch (error) {
        console.error('Context injection error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to inject context'
        });
      }
    });
  }

  /**
   * Integration-specific routes
   */
  setupIntegrationRoutes() {
    // Shopify routes
    this.app.get('/api/shopify/orders/lookup', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { identifier, identifier_type } = req.query;
        const result = await this.shopify.lookupOrderStatus(identifier, identifier_type);
        res.json(result);
      } catch (error) {
        console.error('Shopify order lookup error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/shopify/inventory/:product_handle', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { product_handle } = req.params;
        const { variant_options } = req.query;
        
        const variantOpts = variant_options ? JSON.parse(variant_options) : {};
        const result = await this.shopify.checkProductAvailability(product_handle, variantOpts);
        
        res.json(result);
      } catch (error) {
        console.error('Shopify inventory error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/recommendations/bikes', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { customer_profile, budget_range } = req.body;
        const result = await this.shopify.getProductRecommendations(customer_profile, budget_range);
        res.json(result);
      } catch (error) {
        console.error('Product recommendations error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Calendar routes
    this.app.get('/api/calendar/availability', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { service_type, preferred_date, duration } = req.query;
        const result = await this.calendar.getAvailableSlots(
          service_type, 
          preferred_date, 
          parseInt(duration) || 60
        );
        res.json(result);
      } catch (error) {
        console.error('Calendar availability error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/calendar/appointments', this.auth.authMiddleware(), async (req, res) => {
      try {
        const appointmentData = req.body;
        const result = await this.calendar.bookAppointment(appointmentData);
        res.json(result);
      } catch (error) {
        console.error('Appointment booking error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // HubSpot routes
    this.app.post('/api/crm/customers/search', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { query, query_type } = req.body;
        
        const result = query_type === 'email' ? 
          await this.hubspot.searchContact(query, null) :
          await this.hubspot.searchContact(null, query);
          
        res.json(result);
      } catch (error) {
        console.error('CRM search error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/crm/leads', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { lead_data } = req.body;
        const result = await this.hubspot.createContact(lead_data);
        res.json(result);
      } catch (error) {
        console.error('Lead creation error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Store information route
    this.app.get('/api/store/info', this.auth.authMiddleware(), async (req, res) => {
      try {
        const { info_type } = req.query;
        
        // This would typically come from a database
        const storeInfo = {
          hours: {
            regular: 'Monday-Friday: 9AM-7PM, Saturday-Sunday: 10AM-6PM',
            holiday: 'Statutory holidays: 11AM-4PM',
            summer: 'Extended summer hours: Monday-Friday until 8PM'
          },
          location: {
            address: '123 Main Street, Downtown Toronto, ON M5V 3A8',
            phone: '(416) 555-BIKE (2453)',
            email: 'info@bicibikes.com',
            parking: 'Free 2-hour street parking, Municipal lot behind store',
            transit: 'King Station (2 blocks), 504 King streetcar, 6 Bay bus'
          },
          policies: {
            returns: '30-day return policy with receipt, 15% restocking fee',
            warranty: 'Lifetime frame warranty, 1-2 year components',
            payment: 'Cash, credit, debit, Apple Pay, Google Pay, 0% financing available'
          },
          contact: {
            general: 'info@bicibikes.com',
            service: 'service@bicibikes.com',
            sales: 'sales@bicibikes.com',
            emergency: '(416) 555-HELP for roadside assistance'
          }
        };
        
        const result = info_type ? 
          { [info_type]: storeInfo[info_type] } : 
          storeInfo;
          
        res.json({
          success: true,
          info: result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Store info error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      
      res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        timestamp: new Date().toISOString()
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Validate configurations
      const authValidation = this.auth.validateConfiguration();
      if (!authValidation.valid) {
        console.error('❌ Authentication configuration issues:', authValidation.issues);
        throw new Error('Invalid authentication configuration');
      }

      // Start HTTP server
      this.server.listen(this.port, () => {
        console.log(`🚀 BICI Dashboard Server running on port ${this.port}`);
        console.log(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
        console.log(`🔌 WebSocket: ws://localhost:${this.dashboardPort}`);
        console.log(`🏢 Organization: ${this.organizationId}`);
      });

      console.log('✅ All integrations initialized successfully');

    } catch (error) {
      console.error('❌ Failed to start dashboard server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    console.log('🛑 Shutting down dashboard server...');

    // Close WebSocket connections
    await this.dashboardWS.shutdown();

    // Close HTTP server
    this.server.close(() => {
      console.log('✅ Dashboard server shutdown complete');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log('⚠️ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DashboardServer();
  server.start();
}

export default DashboardServer;