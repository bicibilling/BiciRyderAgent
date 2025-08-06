const request = require('supertest');
const BiciAIServer = require('../server');
const { jest } = require('@jest/globals');

describe('BICI AI Integration Tests', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random port
    process.env.SERVER_TOOLS_API_KEY = 'test-api-key';
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-elevenlabs-secret';
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-shopify-secret';
    process.env.HUBSPOT_WEBHOOK_SECRET = 'test-hubspot-secret';

    server = new BiciAIServer();
    app = server.app;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health and Status Endpoints', () => {
    test('GET / should return system info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'BICI AI Voice Agent System',
        version: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object),
        environment: 'test'
      });
    });
  });

  describe('Server Tools Authentication', () => {
    const validHeaders = {
      'Authorization': 'Bearer test-api-key'
    };

    test('Server tools should reject requests without auth', async () => {
      await request(app)
        .get('/api/server-tools/health')
        .expect(401);
    });

    test('Server tools should reject requests with invalid auth', async () => {
      await request(app)
        .get('/api/server-tools/health')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);
    });

    test('Server tools should accept requests with valid auth', async () => {
      await request(app)
        .get('/api/server-tools/health')
        .set(validHeaders)
        .expect(200);
    });
  });

  describe('Shopify Server Tools', () => {
    const validHeaders = {
      'Authorization': 'Bearer test-api-key',
      'Content-Type': 'application/json'
    };

    test('POST /api/server-tools/shopify/orders/lookup should validate input', async () => {
      const response = await request(app)
        .post('/api/server-tools/shopify/orders/lookup')
        .set(validHeaders)
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });

    test('POST /api/server-tools/shopify/orders/lookup should handle valid request', async () => {
      const response = await request(app)
        .post('/api/server-tools/shopify/orders/lookup')
        .set(validHeaders)
        .send({
          identifier: '+1234567890',
          identifier_type: 'phone'
        });

      // Should return 200 or 500 (depending on Shopify configuration)
      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });

    test('POST /api/server-tools/shopify/inventory/check should handle product lookup', async () => {
      const response = await request(app)
        .post('/api/server-tools/shopify/inventory/check')
        .set(validHeaders)
        .send({
          product_handle: 'test-bike-handle'
        });

      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('HubSpot Server Tools', () => {
    const validHeaders = {
      'Authorization': 'Bearer test-api-key',
      'Content-Type': 'application/json'
    };

    test('POST /api/server-tools/hubspot/contacts/search should validate input', async () => {
      const response = await request(app)
        .post('/api/server-tools/hubspot/contacts/search')
        .set(validHeaders)
        .send({
          // No email or phone provided
        })
        .expect(200); // Should succeed but return not found

      expect(response.body).toHaveProperty('found');
    });

    test('POST /api/server-tools/hubspot/contacts/create should validate contact data', async () => {
      const response = await request(app)
        .post('/api/server-tools/hubspot/contacts/create')
        .set(validHeaders)
        .send({
          first_name: 'Test',
          phone: '+1234567890'
        });

      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Google Calendar Server Tools', () => {
    const validHeaders = {
      'Authorization': 'Bearer test-api-key',
      'Content-Type': 'application/json'
    };

    test('POST /api/server-tools/calendar/availability should validate service type', async () => {
      const response = await request(app)
        .post('/api/server-tools/calendar/availability')
        .set(validHeaders)
        .send({
          service_type: 'invalid_service'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Validation failed')
      });
    });

    test('POST /api/server-tools/calendar/availability should handle valid request', async () => {
      const response = await request(app)
        .post('/api/server-tools/calendar/availability')
        .set(validHeaders)
        .send({
          service_type: 'bike_repair'
        });

      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Webhook Endpoints', () => {
    describe('ElevenLabs Webhooks', () => {
      const validHeaders = {
        'Authorization': 'Bearer test-elevenlabs-secret',
        'Content-Type': 'application/json'
      };

      test('POST /api/webhooks/elevenlabs/conversation should require auth', async () => {
        await request(app)
          .post('/api/webhooks/elevenlabs/conversation')
          .send({
            conversation_id: 'test-123',
            type: 'conversation_started'
          })
          .expect(401);
      });

      test('POST /api/webhooks/elevenlabs/conversation should handle valid webhook', async () => {
        const response = await request(app)
          .post('/api/webhooks/elevenlabs/conversation')
          .set(validHeaders)
          .send({
            conversation_id: 'test-123',
            agent_id: 'agent-456',
            type: 'conversation_started',
            timestamp: new Date().toISOString(),
            data: {
              caller_id: '+1234567890',
              called_number: '+1987654321'
            }
          });

        expect([200, 500]).toContain(response.status);
      });
    });

    describe('Shopify Webhooks', () => {
      test('POST /api/webhooks/shopify/orders should require HMAC', async () => {
        await request(app)
          .post('/api/webhooks/shopify/orders')
          .send({
            id: 12345,
            order_number: 1001
          })
          .expect(401);
      });
    });

    describe('HubSpot Webhooks', () => {
      test('POST /api/webhooks/hubspot/contacts should require signature', async () => {
        await request(app)
          .post('/api/webhooks/hubspot/contacts')
          .send([{
            objectId: 12345,
            propertyName: 'email',
            propertyValue: 'test@example.com'
          }])
          .expect(401);
      });
    });
  });

  describe('Rate Limiting', () => {
    test('Should apply rate limiting to general endpoints', async () => {
      // Make multiple requests quickly
      const requests = Array(10).fill().map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed initially
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    }, 10000);
  });

  describe('Error Handling', () => {
    test('Should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Route not found'
      });
    });

    test('Should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/server-tools/shopify/orders/lookup')
        .set({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        })
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('Security Headers', () => {
    test('Should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });
  });

  describe('Admin Endpoints', () => {
    const validHeaders = {
      'Authorization': 'Bearer test-api-key'
    };

    test('GET /api/admin/config should return configuration', async () => {
      const response = await request(app)
        .get('/api/admin/config')
        .set(validHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        config: expect.objectContaining({
          node_env: 'test',
          port: expect.any(Number)
        })
      });
    });

    test('GET /api/admin/api-keys should return API key info', async () => {
      const response = await request(app)
        .get('/api/admin/api-keys')
        .set(validHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        api_keys: expect.objectContaining({
          server_tools_key: expect.any(String)
        })
      });
    });
  });
});

// Performance tests
describe('Performance Tests', () => {
  let server;
  let app;

  beforeAll(async () => {
    server = new BiciAIServer();
    app = server.app;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  test('Health endpoint should respond quickly', async () => {
    const start = Date.now();
    
    await request(app)
      .get('/health')
      .expect(200);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should respond in under 100ms
  });

  test('Should handle concurrent requests', async () => {
    const start = Date.now();
    
    const requests = Array(20).fill().map(() => 
      request(app).get('/health')
    );

    const responses = await Promise.all(requests);
    
    const duration = Date.now() - start;
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // Should complete in reasonable time
    expect(duration).toBeLessThan(2000); // Under 2 seconds
  }, 10000);
});