const express = require('express');
const ShopifyServerTools = require('../../integrations/shopify/server-tools');
const HubSpotServerTools = require('../../integrations/hubspot/server-tools');
const GoogleCalendarServerTools = require('../../integrations/google-calendar/server-tools');
const { serverToolLogger } = require('../../config/logger');
const { validateBody, schemas } = require('../../utils/validation');

class MainServerToolHandler {
  constructor() {
    this.router = express.Router();
    this.shopifyTools = new ShopifyServerTools();
    this.hubspotTools = new HubSpotServerTools();
    this.calendarTools = new GoogleCalendarServerTools();
    this.logger = serverToolLogger.child({ service: 'main-server-tool-handler' });
    
    this.setupRoutes();
  }

  /**
   * Setup all server tool routes
   */
  setupRoutes() {
    // Shopify routes
    this.router.post('/shopify/orders/lookup', 
      validateBody(schemas.shopifyOrder),
      this.shopifyTools.handleOrderLookup.bind(this.shopifyTools)
    );
    
    this.router.post('/shopify/inventory/check',
      this.shopifyTools.handleAvailabilityCheck.bind(this.shopifyTools)
    );
    
    this.router.post('/shopify/recommendations',
      this.shopifyTools.handleProductRecommendations.bind(this.shopifyTools)
    );

    // HubSpot CRM routes
    this.router.post('/hubspot/contacts/search',
      this.hubspotTools.handleCustomerSearch.bind(this.hubspotTools)
    );
    
    this.router.post('/hubspot/contacts/create',
      validateBody(schemas.hubspotContact),
      this.hubspotTools.handleLeadCreation.bind(this.hubspotTools)
    );
    
    this.router.post('/hubspot/tickets/create',
      this.hubspotTools.handleTicketCreation.bind(this.hubspotTools)
    );
    
    this.router.post('/hubspot/deals/create',
      this.hubspotTools.handleDealCreation.bind(this.hubspotTools)
    );
    
    this.router.post('/hubspot/contacts/history',
      this.hubspotTools.handleCustomerHistory.bind(this.hubspotTools)
    );

    // Google Calendar routes
    this.router.post('/calendar/availability',
      this.calendarTools.handleAvailabilityCheck.bind(this.calendarTools)
    );
    
    this.router.post('/calendar/book',
      validateBody(schemas.calendarAppointment),
      this.calendarTools.handleAppointmentBooking.bind(this.calendarTools)
    );
    
    this.router.post('/calendar/update',
      this.calendarTools.handleAppointmentUpdate.bind(this.calendarTools)
    );
    
    this.router.post('/calendar/cancel',
      this.calendarTools.handleAppointmentCancellation.bind(this.calendarTools)
    );

    // Store information route
    this.router.get('/store/info', this.handleStoreInfo.bind(this));

    // Health check and testing routes
    this.router.get('/health', this.handleHealthCheck.bind(this));
    this.router.post('/test-connections', this.handleConnectionTests.bind(this));
  }

  /**
   * Handle store information requests
   */
  async handleStoreInfo(req, res) {
    try {
      const { info_type } = req.query;

      this.logger.info('Processing store info request', { info_type });

      const storeInfo = {
        hours: {
          monday: "9:00 AM - 6:00 PM",
          tuesday: "9:00 AM - 6:00 PM", 
          wednesday: "9:00 AM - 6:00 PM",
          thursday: "9:00 AM - 6:00 PM",
          friday: "9:00 AM - 6:00 PM",
          saturday: "10:00 AM - 5:00 PM",
          sunday: "10:00 AM - 4:00 PM"
        },
        location: {
          address: "123 Main Street, Downtown",
          city: "Your City",
          postal_code: "A1A 1A1",
          phone: process.env.STORE_PHONE || "+1-555-BICI-SHOP",
          directions: "Located in the heart of downtown with free parking available",
          landmarks: "Next to the library, across from City Hall"
        },
        contact: {
          phone: process.env.STORE_PHONE || "+1-555-BICI-SHOP",
          email: "info@bicibikes.com",
          website: "www.bicibikes.com",
          social: {
            facebook: "@BiciBikeStore",
            instagram: "@bici_bikes",
            twitter: "@BiciBikes"
          }
        },
        policies: {
          returns: "30-day return policy on all bikes with original receipt",
          warranty: "All bikes come with manufacturer warranty plus our 1-year service guarantee",
          exchanges: "Size exchanges allowed within 30 days for unworn items",
          repairs: "We service all bike brands, not just what we sell",
          pricing: "We offer price matching on identical items from authorized dealers"
        },
        promotions: {
          current: [
            "Free tune-up with any bike purchase over $500",
            "10% off accessories with bike purchase",
            "Student discount: 15% off with valid student ID",
            "Trade-in program: Up to $200 credit for your old bike"
          ],
          seasonal: "Spring tune-up special: $49 (regular $79)"
        }
      };

      let responseData;
      switch (info_type) {
        case 'hours':
          responseData = storeInfo.hours;
          break;
        case 'location':
          responseData = storeInfo.location;
          break;
        case 'contact':
          responseData = storeInfo.contact;
          break;
        case 'policies':
          responseData = storeInfo.policies;
          break;
        case 'promotions':
          responseData = storeInfo.promotions;
          break;
        default:
          responseData = storeInfo;
      }

      res.json({
        success: true,
        info_type: info_type || 'all',
        data: responseData,
        message: 'Store information retrieved successfully'
      });

    } catch (error) {
      this.logger.error('Store info request failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error retrieving store information'
      });
    }
  }

  /**
   * Handle health check requests
   */
  async handleHealthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      };

      res.json(health);

    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  /**
   * Handle connection tests for all integrations
   */
  async handleConnectionTests(req, res) {
    try {
      this.logger.info('Running connection tests for all integrations');

      const results = await Promise.allSettled([
        this.shopifyTools.testConnection(),
        this.hubspotTools.testConnection(),
        this.calendarTools.testConnection()
      ]);

      const connectionTests = {
        shopify: results[0].value || { success: false, error: results[0].reason?.message },
        hubspot: results[1].value || { success: false, error: results[1].reason?.message },
        calendar: results[2].value || { success: false, error: results[2].reason?.message }
      };

      const allSuccessful = Object.values(connectionTests).every(test => test.success);
      const successCount = Object.values(connectionTests).filter(test => test.success).length;

      this.logger.info('Connection tests completed', { 
        allSuccessful,
        successCount,
        totalTests: 3 
      });

      res.json({
        success: allSuccessful,
        overall_status: allSuccessful ? 'all_connected' : 'partial_connection',
        connections: connectionTests,
        summary: {
          total_tests: 3,
          successful: successCount,
          failed: 3 - successCount
        },
        message: allSuccessful 
          ? 'All integrations are working correctly'
          : `${successCount}/3 integrations working correctly`
      });

    } catch (error) {
      this.logger.error('Connection tests failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to run connection tests',
        message: error.message
      });
    }
  }

  /**
   * Get the configured router
   */
  getRouter() {
    return this.router;
  }

  /**
   * Middleware to log all server tool requests
   */
  logRequest(req, res, next) {
    this.logger.info('Server tool request', {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      body: req.method === 'POST' ? 
        this.sanitizeRequestBody(req.body) : undefined
    });

    next();
  }

  /**
   * Sanitize request body for logging (remove sensitive data)
   */
  sanitizeRequestBody(body) {
    const sanitized = { ...body };
    
    // Remove or mask sensitive fields
    if (sanitized.customer_phone) {
      sanitized.customer_phone = sanitized.customer_phone.substring(0, 4) + '***';
    }
    if (sanitized.customer_email) {
      sanitized.customer_email = sanitized.customer_email.substring(0, 4) + '***';
    }
    if (sanitized.phone_number) {
      sanitized.phone_number = sanitized.phone_number.substring(0, 4) + '***';
    }
    if (sanitized.email) {
      sanitized.email = sanitized.email.substring(0, 4) + '***';
    }

    return sanitized;
  }
}

module.exports = MainServerToolHandler;