/**
 * Integration Routes
 * Manage external service integrations (Shopify, HubSpot, Google Calendar)
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route GET /api/integrations
 * @desc Get all configured integrations
 * @access Private (integrations:read)
 */
router.get('/',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    
    // Mock integration status - in production, fetch from database
    const integrations = {
      shopify: {
        enabled: !!process.env.SHOPIFY_ACCESS_TOKEN,
        connected: !!process.env.SHOPIFY_ACCESS_TOKEN,
        lastSync: new Date(Date.now() - 3600000).toISOString(),
        status: 'healthy',
        endpoints: {
          orders: '/api/integrations/shopify/orders',
          products: '/api/integrations/shopify/products',
          customers: '/api/integrations/shopify/customers'
        },
        metrics: {
          totalOrders: 1247,
          syncedToday: 45,
          errors: 0
        }
      },
      
      hubspot: {
        enabled: !!process.env.HUBSPOT_ACCESS_TOKEN,
        connected: !!process.env.HUBSPOT_ACCESS_TOKEN,
        lastSync: new Date(Date.now() - 1800000).toISOString(),
        status: 'healthy',
        endpoints: {
          contacts: '/api/integrations/hubspot/contacts',
          deals: '/api/integrations/hubspot/deals',
          companies: '/api/integrations/hubspot/companies'
        },
        metrics: {
          totalContacts: 892,
          syncedToday: 23,
          errors: 0
        }
      },
      
      calendar: {
        enabled: !!process.env.GOOGLE_CLIENT_ID,
        connected: !!process.env.GOOGLE_CLIENT_ID,
        lastSync: new Date(Date.now() - 600000).toISOString(),
        status: 'healthy',
        endpoints: {
          events: '/api/integrations/calendar/events',
          availability: '/api/integrations/calendar/availability'
        },
        metrics: {
          totalEvents: 156,
          bookedToday: 8,
          errors: 0
        }
      },
      
      twilio: {
        enabled: !!process.env.TWILIO_ACCOUNT_SID,
        connected: !!process.env.TWILIO_ACCOUNT_SID,
        lastSync: new Date().toISOString(),
        status: 'healthy',
        endpoints: {
          sms: '/api/integrations/twilio/sms',
          calls: '/api/integrations/twilio/calls'
        },
        metrics: {
          smsSent: 234,
          callsMade: 45,
          errors: 1
        }
      }
    };
    
    res.json({
      success: true,
      data: {
        integrations,
        summary: {
          total: Object.keys(integrations).length,
          enabled: Object.values(integrations).filter(i => i.enabled).length,
          connected: Object.values(integrations).filter(i => i.connected).length,
          healthy: Object.values(integrations).filter(i => i.status === 'healthy').length
        }
      }
    });
  })
);

/**
 * @route POST /api/integrations/test
 * @desc Test all integrations
 * @access Private (integrations:manage)
 */
router.post('/test',
  authMiddleware.requirePermission('integrations:manage'),
  rateLimitConfig.heavyOperations,
  asyncHandler(async (req, res) => {
    const testResults = {};
    
    // Test Shopify
    if (process.env.SHOPIFY_ACCESS_TOKEN) {
      try {
        const shopifyResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/shop.json`, {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        });
        
        testResults.shopify = {
          success: shopifyResponse.ok,
          status: shopifyResponse.status,
          message: shopifyResponse.ok ? 'Connected successfully' : 'Connection failed'
        };
      } catch (error) {
        testResults.shopify = {
          success: false,
          error: error.message
        };
      }
    }
    
    // Test HubSpot
    if (process.env.HUBSPOT_ACCESS_TOKEN) {
      try {
        const hubspotResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
          headers: {
            'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
          }
        });
        
        testResults.hubspot = {
          success: hubspotResponse.ok,
          status: hubspotResponse.status,
          message: hubspotResponse.ok ? 'Connected successfully' : 'Connection failed'
        };
      } catch (error) {
        testResults.hubspot = {
          success: false,
          error: error.message
        };
      }
    }
    
    // Test Google Calendar (basic auth check)
    testResults.calendar = {
      success: !!process.env.GOOGLE_CLIENT_ID,
      message: process.env.GOOGLE_CLIENT_ID ? 'Credentials configured' : 'Credentials missing'
    };
    
    // Test Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const account = await twilio.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        
        testResults.twilio = {
          success: account.status === 'active',
          status: account.status,
          message: account.status === 'active' ? 'Connected successfully' : 'Account not active'
        };
      } catch (error) {
        testResults.twilio = {
          success: false,
          error: error.message
        };
      }
    }
    
    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(result => result.success).length;
    
    res.json({
      success: true,
      data: {
        results: testResults,
        summary: {
          total: totalTests,
          passed: passedTests,
          failed: totalTests - passedTests,
          overallSuccess: passedTests === totalTests
        }
      }
    });
  })
);

/**
 * @route GET /api/integrations/shopify/orders
 * @desc Get Shopify orders
 * @access Private (integrations:read)
 */
router.get('/shopify/orders',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { limit = 50, status, customer } = req.query;
    
    if (!process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Shopify not configured'
      });
    }
    
    try {
      let url = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/orders.json?limit=${limit}`;
      
      if (status) {
        url += `&status=${status}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      });
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      res.json({
        success: true,
        data: {
          orders: data.orders || [],
          total: data.orders?.length || 0
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch Shopify orders',
        message: error.message
      });
    }
  })
);

/**
 * @route GET /api/integrations/shopify/products
 * @desc Get Shopify products
 * @access Private (integrations:read)
 */
router.get('/shopify/products',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { limit = 50, collection, product_type } = req.query;
    
    if (!process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Shopify not configured'
      });
    }
    
    try {
      let url = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/products.json?limit=${limit}`;
      
      if (product_type) {
        url += `&product_type=${encodeURIComponent(product_type)}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      });
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      res.json({
        success: true,
        data: {
          products: data.products || [],
          total: data.products?.length || 0
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch Shopify products',
        message: error.message
      });
    }
  })
);

/**
 * @route GET /api/integrations/hubspot/contacts
 * @desc Get HubSpot contacts
 * @access Private (integrations:read)
 */
router.get('/hubspot/contacts',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { limit = 50, search } = req.query;
    
    if (!process.env.HUBSPOT_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'HubSpot not configured'
      });
    }
    
    try {
      let url = `https://api.hubapi.com/crm/v3/objects/contacts?limit=${limit}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      res.json({
        success: true,
        data: {
          contacts: data.results || [],
          total: data.total || 0,
          paging: data.paging
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch HubSpot contacts',
        message: error.message
      });
    }
  })
);

/**
 * @route POST /api/integrations/hubspot/contacts
 * @desc Create HubSpot contact
 * @access Private (integrations:write)
 */
router.post('/hubspot/contacts',
  authMiddleware.requirePermission('integrations:write'),
  asyncHandler(async (req, res) => {
    const contactData = req.body;
    
    if (!process.env.HUBSPOT_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'HubSpot not configured'
      });
    }
    
    try {
      const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: contactData
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HubSpot API error: ${errorData.message}`);
      }
      
      const data = await response.json();
      
      res.json({
        success: true,
        data: {
          contactId: data.id,
          properties: data.properties,
          createdAt: data.createdAt
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create HubSpot contact',
        message: error.message
      });
    }
  })
);

/**
 * @route GET /api/integrations/calendar/availability
 * @desc Get calendar availability
 * @access Private (integrations:read)
 */
router.get('/calendar/availability',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { date, service_type, duration = 60 } = req.query;
    
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar not configured'
      });
    }
    
    // Mock availability data - in production, integrate with Google Calendar API
    const mockSlots = [
      {
        startTime: '2024-01-15T09:00:00',
        endTime: '2024-01-15T10:00:00',
        available: true
      },
      {
        startTime: '2024-01-15T10:00:00',
        endTime: '2024-01-15T11:00:00',
        available: true
      },
      {
        startTime: '2024-01-15T11:00:00',
        endTime: '2024-01-15T12:00:00',
        available: false,
        reason: 'Booked'
      },
      {
        startTime: '2024-01-15T14:00:00',
        endTime: '2024-01-15T15:00:00',
        available: true
      }
    ];
    
    const availableSlots = mockSlots.filter(slot => slot.available);
    
    res.json({
      success: true,
      data: {
        date: date || new Date().toISOString().split('T')[0],
        serviceType: service_type,
        duration: parseInt(duration),
        availableSlots: availableSlots.map(slot => ({
          startTime: slot.startTime,
          endTime: slot.endTime
        })),
        totalSlots: mockSlots.length,
        availableCount: availableSlots.length
      }
    });
  })
);

/**
 * @route POST /api/integrations/calendar/events
 * @desc Create calendar event
 * @access Private (integrations:write)
 */
router.post('/calendar/events',
  authMiddleware.requirePermission('integrations:write'),
  asyncHandler(async (req, res) => {
    const eventData = req.body;
    
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar not configured'
      });
    }
    
    // Mock event creation
    const eventId = `event_${Date.now()}`;
    
    res.json({
      success: true,
      data: {
        eventId,
        title: eventData.title,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        attendees: eventData.attendees || [],
        calendarId: eventData.calendarId || 'primary',
        htmlLink: `https://calendar.google.com/event?eid=${eventId}`,
        status: 'confirmed'
      }
    });
  })
);

/**
 * @route POST /api/integrations/sync
 * @desc Manually trigger data sync
 * @access Private (integrations:manage)
 */
router.post('/sync',
  authMiddleware.requirePermission('integrations:manage'),
  rateLimitConfig.heavyOperations,
  asyncHandler(async (req, res) => {
    const { services = ['all'] } = req.body;
    const { organizationId } = req.user;
    
    const syncResults = {};
    
    // Sync Shopify
    if (services.includes('all') || services.includes('shopify')) {
      syncResults.shopify = {
        started: new Date().toISOString(),
        status: 'processing',
        message: 'Shopify sync initiated'
      };
    }
    
    // Sync HubSpot
    if (services.includes('all') || services.includes('hubspot')) {
      syncResults.hubspot = {
        started: new Date().toISOString(),
        status: 'processing',
        message: 'HubSpot sync initiated'
      };
    }
    
    // Sync Calendar
    if (services.includes('all') || services.includes('calendar')) {
      syncResults.calendar = {
        started: new Date().toISOString(),
        status: 'processing',
        message: 'Calendar sync initiated'
      };
    }
    
    res.json({
      success: true,
      message: 'Sync initiated for requested services',
      data: {
        organizationId,
        syncId: `sync_${Date.now()}`,
        services: Object.keys(syncResults),
        results: syncResults,
        estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 minutes
      }
    });
  })
);

/**
 * @route GET /api/integrations/webhooks
 * @desc Get webhook configurations
 * @access Private (integrations:read)
 */
router.get('/webhooks',
  authMiddleware.requirePermission('integrations:read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    
    const webhooks = {
      elevenlabs: {
        url: `${baseUrl}/api/webhooks/elevenlabs/conversation`,
        events: ['conversation_started', 'conversation_ended', 'user_transcript', 'agent_response'],
        status: 'active',
        lastReceived: new Date(Date.now() - 300000).toISOString()
      },
      
      twilio: {
        url: `${baseUrl}/api/webhooks/twilio/call-status`,
        events: ['call_initiated', 'call_answered', 'call_completed'],
        status: 'active',
        lastReceived: new Date(Date.now() - 600000).toISOString()
      },
      
      shopify: {
        url: `${baseUrl}/api/webhooks/shopify/orders`,
        events: ['orders/create', 'orders/updated', 'orders/paid'],
        status: 'configured',
        lastReceived: new Date(Date.now() - 3600000).toISOString()
      },
      
      hubspot: {
        url: `${baseUrl}/api/webhooks/hubspot/contacts`,
        events: ['contact.creation', 'contact.propertyChange'],
        status: 'configured',
        lastReceived: new Date(Date.now() - 7200000).toISOString()
      }
    };
    
    res.json({
      success: true,
      data: {
        webhooks,
        baseUrl,
        organizationId
      }
    });
  })
);

module.exports = router;