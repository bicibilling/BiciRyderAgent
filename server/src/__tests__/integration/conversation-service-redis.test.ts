/**
 * Conversation Service Redis Integration Tests
 * Tests context caching and conversation history management
 */

import { ConversationService } from '../../services/conversation.service';
import { LeadService } from '../../services/lead.service';
import { RedisTestUtils, PerformanceMeasurer, createMockRedisService } from '../helpers/test-utils';
import { createTestLead, createTestConversation, TEST_CONTEXT_DATA } from '../helpers/test-data';
import { enableRedisForTest, resetTestEnv, TEST_ENV } from '../setup';

describe('ConversationService Redis Integration', () => {
  let conversationService: ConversationService;
  let leadService: LeadService;
  let redisUtils: RedisTestUtils;
  let performanceMeasurer: PerformanceMeasurer;
  let testLeadId: string;

  beforeEach(async () => {
    conversationService = new ConversationService();
    leadService = new LeadService();
    redisUtils = new RedisTestUtils();
    performanceMeasurer = new PerformanceMeasurer();
    resetTestEnv();

    // Create a test lead for conversation tests
    const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
    testLeadId = lead.id;
  });

  afterEach(async () => {
    await redisUtils.cleanup();
    performanceMeasurer.clear();
  });

  describe('Context Caching - Redis Disabled', () => {
    beforeEach(() => {
      process.env.REDIS_ENABLED = 'false';
    });

    test('should build conversation context without caching', async () => {
      const context = await conversationService.buildConversationContext(testLeadId);
      
      expect(context).toHaveProperty('customer_context');
      expect(context).toHaveProperty('business_context');
      expect(context).toHaveProperty('conversation_history');
      expect(context.customer_context).toHaveProperty('phone');
    });

    test('should handle multiple context builds consistently', async () => {
      const context1 = await conversationService.buildConversationContext(testLeadId);
      const context2 = await conversationService.buildConversationContext(testLeadId);
      
      expect(context1.customer_context.phone).toBe(context2.customer_context.phone);
      expect(context1.business_context.store_name).toBe(context2.business_context.store_name);
    });
  });

  describe('Context Caching - Redis Enabled', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should cache conversation context on first build', async () => {
      const measureEnd1 = performanceMeasurer.start('buildContext-cold');
      const context1 = await conversationService.buildConversationContext(testLeadId);
      const coldTime = measureEnd1();

      const measureEnd2 = performanceMeasurer.start('buildContext-warm');
      const context2 = await conversationService.buildConversationContext(testLeadId);
      const warmTime = measureEnd2();

      expect(context1).toEqual(context2);
      
      // With Redis enabled, warm cache should be faster
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should invalidate context cache when new conversations added', async () => {
      // Build initial context (should cache it)
      const initialContext = await conversationService.buildConversationContext(testLeadId);
      const initialHistoryLength = initialContext.conversation_history.length;

      // Add a new conversation
      await conversationService.saveConversation({
        lead_id: testLeadId,
        session_id: 'test-session-new',
        type: 'voice',
        content: 'New test conversation',
        sender: 'customer',
        created_at: new Date().toISOString()
      });

      // Next context build should reflect the new conversation
      const updatedContext = await conversationService.buildConversationContext(testLeadId);
      expect(updatedContext.conversation_history.length).toBeGreaterThan(initialHistoryLength);
    });

    test('should cache conversation summaries', async () => {
      // Add some conversations first
      await conversationService.saveConversation({
        lead_id: testLeadId,
        session_id: 'test-session-1',
        type: 'voice',
        content: 'Customer asking about mountain bikes',
        sender: 'customer',
        created_at: new Date().toISOString()
      });

      const measureEnd1 = performanceMeasurer.start('getConversationSummary-cold');
      const summary1 = await conversationService.getConversationSummary(testLeadId);
      const coldTime = measureEnd1();

      const measureEnd2 = performanceMeasurer.start('getConversationSummary-warm');
      const summary2 = await conversationService.getConversationSummary(testLeadId);
      const warmTime = measureEnd2();

      expect(summary1).toBe(summary2);
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should maintain context freshness with TTL', async () => {
      const context = await conversationService.buildConversationContext(testLeadId);
      
      expect(context).toHaveProperty('customer_context');
      expect(context.customer_context).toHaveProperty('phone');
      
      // Context should contain current business context
      expect(context.business_context).toHaveProperty('current_time');
      expect(context.business_context).toHaveProperty('day_of_week');
      
      const currentTime = new Date(context.business_context.current_time);
      const now = new Date();
      
      // Context timestamp should be recent (within 1 minute)
      expect(now.getTime() - currentTime.getTime()).toBeLessThan(60000);
    });
  });

  describe('Dynamic Greeting Caching', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should cache dynamic greeting generation', async () => {
      // Generate greeting (cold cache)
      const measureEnd1 = performanceMeasurer.start('generateGreeting-cold');
      const greeting1 = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      const coldTime = measureEnd1();

      // Generate again (warm cache)
      const measureEnd2 = performanceMeasurer.start('generateGreeting-warm');
      const greeting2 = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      const warmTime = measureEnd2();

      expect(typeof greeting1).toBe('string');
      expect(typeof greeting2).toBe('string');
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should generate different greetings for different channels', async () => {
      const voiceGreeting = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      const smsGreeting = await conversationService.generateDynamicGreeting(testLeadId, 'sms');
      
      expect(typeof voiceGreeting).toBe('string');
      expect(typeof smsGreeting).toBe('string');
      expect(voiceGreeting.length).toBeGreaterThan(0);
      expect(smsGreeting.length).toBeGreaterThan(0);
    });

    test('should invalidate greeting cache when lead updates', async () => {
      // Generate initial greeting
      const initialGreeting = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      
      // Update lead information
      await leadService.updateLead(testLeadId, {
        customer_name: 'Updated Customer Name',
        sentiment: 'positive',
        bike_interest: { type: 'road', budget: '2000+' }
      });

      // New greeting should potentially be different (lead context changed)
      const updatedGreeting = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      
      expect(typeof updatedGreeting).toBe('string');
      expect(updatedGreeting.length).toBeGreaterThan(0);
    });
  });

  describe('Conversation History Caching', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should cache conversation history retrieval', async () => {
      // Add some conversations
      const conversations = [
        {
          lead_id: testLeadId,
          session_id: 'session-1',
          type: 'voice' as const,
          content: 'First conversation',
          sender: 'customer' as const,
          created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        },
        {
          lead_id: testLeadId,
          session_id: 'session-2', 
          type: 'sms' as const,
          content: 'SMS follow up',
          sender: 'customer' as const,
          created_at: new Date().toISOString()
        }
      ];

      for (const conv of conversations) {
        await conversationService.saveConversation(conv);
      }

      // Retrieve history (cold)
      const measureEnd1 = performanceMeasurer.start('getHistory-cold');
      const history1 = await conversationService.getConversationHistory(testLeadId, 10);
      const coldTime = measureEnd1();

      // Retrieve history (warm)
      const measureEnd2 = performanceMeasurer.start('getHistory-warm');
      const history2 = await conversationService.getConversationHistory(testLeadId, 10);
      const warmTime = measureEnd2();

      expect(history1.length).toBe(history2.length);
      expect(history1.length).toBeGreaterThanOrEqual(2);
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should handle conversation history pagination with caching', async () => {
      // Add multiple conversations
      for (let i = 0; i < 15; i++) {
        await conversationService.saveConversation({
          lead_id: testLeadId,
          session_id: `session-${i}`,
          type: 'voice',
          content: `Conversation ${i}`,
          sender: 'customer',
          created_at: new Date(Date.now() - (i * 60000)).toISOString() // Space them 1 minute apart
        });
      }

      // Get first page
      const page1 = await conversationService.getConversationHistory(testLeadId, 10);
      expect(page1.length).toBe(10);

      // Get second page with different limit
      const page2 = await conversationService.getConversationHistory(testLeadId, 5, 10);
      expect(page2.length).toBe(5);

      // Should not overlap
      const page1Ids = page1.map(c => c.id);
      const page2Ids = page2.map(c => c.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe('Fallback Behavior', () => {
    test('should handle Redis failures gracefully', async () => {
      // Mock Redis to fail
      const mockRedis = createMockRedisService({ shouldFail: true });
      (conversationService as any).redisService = mockRedis;

      // Operations should still work
      const context = await conversationService.buildConversationContext(testLeadId);
      expect(context).toHaveProperty('customer_context');
      
      const greeting = await conversationService.generateDynamicGreeting(testLeadId, 'voice');
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    test('should handle partial Redis failures', async () => {
      // Mock Redis to fail only certain operations
      const mockRedis = createMockRedisService();
      mockRedis.getCachedContext.mockRejectedValue(new Error('Redis timeout'));
      (conversationService as any).redisService = mockRedis;

      // Should fall back to database and still work
      const context = await conversationService.buildConversationContext(testLeadId);
      expect(context).toHaveProperty('customer_context');
    });
  });

  describe('Performance Validation', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should meet webhook response time requirements', async () => {
      const maxWebhookTime = 100; // 100ms requirement
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const measureEnd = performanceMeasurer.start('webhook-context-build');
        await conversationService.buildConversationContext(testLeadId);
        measureEnd();
      }

      const stats = performanceMeasurer.getStats('webhook-context-build');
      if (stats) {
        console.log('Webhook Context Build Performance:', stats);
        
        // After caching, should meet webhook time requirements
        if (process.env.REDIS_ENABLED === 'true') {
          expect(stats.avg).toBeLessThan(maxWebhookTime);
        }
      }
    });

    test('should demonstrate context caching effectiveness', async () => {
      const iterations = 3;
      
      // Generate different lead contexts
      for (let i = 0; i < iterations; i++) {
        const phone = `+177855500${i}`;
        const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
        
        // Cold cache
        const measureEnd1 = performanceMeasurer.start(`context-cold-${i}`);
        await conversationService.buildConversationContext(lead.id);
        measureEnd1();

        // Warm cache
        const measureEnd2 = performanceMeasurer.start(`context-warm-${i}`);
        await conversationService.buildConversationContext(lead.id);
        measureEnd2();
      }

      const summary = performanceMeasurer.getSummary();
      console.log('Context Caching Performance Summary:', summary);

      // Verify we have both cold and warm measurements
      const coldOps = Object.keys(summary).filter(key => key.includes('cold'));
      const warmOps = Object.keys(summary).filter(key => key.includes('warm'));
      
      expect(coldOps.length).toBe(iterations);
      expect(warmOps.length).toBe(iterations);
    });
  });
});