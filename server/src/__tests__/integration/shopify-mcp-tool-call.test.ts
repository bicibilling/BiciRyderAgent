import request from 'supertest';

// Mock Twilio config before importing app (prevents real client init)
jest.mock('../../config/twilio.config', () => ({
  twilioClient: {},
  twilioConfig: { phoneNumber: '', voiceWebhook: '', smsWebhook: '', smsStatusCallback: '', capabilities: { voice: true, sms: true, mms: false } },
  formatPhoneNumber: (s: string) => s,
  normalizePhoneNumber: (s: string) => s,
}));

// Mock SSE broadcaster to capture outputs
jest.mock('../../services/realtime.service', () => ({
  broadcastToClients: jest.fn(),
}));

// Mock CallSessionService to resolve a session
jest.mock('../../services/callSession.service', () => ({
  CallSessionService: class {
    async getSessionByConversationId(id: string) {
      return { organization_id: 'org1', lead_id: 'lead1', elevenlabs_conversation_id: id };
    }
  }
}));

// Mock Storefront MCP service to avoid network
jest.mock('../../services/shopify.storefront.mcp.service', () => {
  return {
    ShopifyStorefrontMCPService: class {
      isEnabled() { return true; }
      async callTool(name: string, args: any) {
        if (name === 'search_shop_catalog') {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ products: [
                { product_id: 'gid://shopify/Product/1', title: 'Road Bike A', url: 'https://example.com/p/1', image_url: 'https://img/1', price_range: { min: '1000', max: '1200', currency: 'CAD' }, variants: [{ available: true }] },
              ] }) }
            ]
          };
        }
        if (name === 'search_shop_policies_and_faqs') {
          return { content: [{ type: 'text', text: JSON.stringify({ answer: '30-day returns with receipt.' }) }] };
        }
        if (name === 'get_product_details') {
          return { content: [{ type: 'text', text: JSON.stringify({ product_id: args.product_id, title: 'Road Bike A' }) }] };
        }
        throw new Error('unexpected tool');
      }
    },
    normalizeCatalogResult: (r: any) => ({ products: [{ product_id: 'gid://shopify/Product/1', title: 'Road Bike A' }], total: 1, more_available: false }),
  };
});

import express from 'express';
import { handleClientEvents } from '../../webhooks/elevenlabs.webhook';

describe('Shopify MCP tool call integration', () => {
  beforeAll(() => {
    process.env.SHOPIFY_STOREFRONT_DOMAIN = 'la-bicicletta-vancouver.myshopify.com';
  });

  it('handles search_shop_catalog tool call and broadcasts result', async () => {
    const app = express();
    app.use(express.json());
    app.post('/webhooks/elevenlabs/client-events', handleClientEvents);
    const { broadcastToClients } = require('../../services/realtime.service');
    broadcastToClients.mockClear();

    const res = await request(app)
      .post('/webhooks/elevenlabs/client-events')
      .send({
        type: 'client_tool_call',
        conversation_id: 'conv1',
        event_id: 'evt1',
        data: {
          tool_name: 'search_shop_catalog',
          parameters: { arguments: { query: 'road bike', context: 'inventory check' } }
        }
      })
      .expect(200);

    expect(res.body).toEqual({ success: true });
    // First broadcast: tool_call; second: tool_result
    const calls = broadcastToClients.mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((e: any) => e.type === 'tool_call')).toBeTruthy();
    const resultEvent = calls.find((e: any) => e.type === 'tool_result');
    expect(resultEvent).toBeTruthy();
    expect(resultEvent.tool_name).toBe('search_shop_catalog');
    expect(resultEvent.result.products?.[0]?.product_id).toBe('gid://shopify/Product/1');
  });
});
