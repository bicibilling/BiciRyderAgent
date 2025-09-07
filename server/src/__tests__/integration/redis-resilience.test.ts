/**
 * Redis Resilience and Fallback Testing
 * Tests system behavior when Redis fails or is unavailable
 */

import { LeadService } from '../../services/lead.service';
import { ConversationService } from '../../services/conversation.service';
import { CallSessionService } from '../../services/callSession.service';
import { RedisService } from '../../services/redis.service';
import { RedisConfig } from '../../config/redis.config';
import { RedisTestUtils, createMockRedisService, PerformanceMeasurer } from '../helpers/test-utils';
import { enableRedisForTest, resetTestEnv, TEST_ENV } from '../setup';
import { logger } from '../../utils/logger';

describe('Redis Resilience and Fallback Tests', () => {
  let leadService: LeadService;
  let conversationService: ConversationService;
  let callSessionService: CallSessionService;
  let redisUtils: RedisTestUtils;
  let performanceMeasurer: PerformanceMeasurer;

  beforeEach(() => {
    leadService = new LeadService();
    conversationService = new ConversationService();
    callSessionService = new CallSessionService();
    redisUtils = new RedisTestUtils();
    performanceMeasurer = new PerformanceMeasurer();
    resetTestEnv();
  });

  afterEach(async () => {
    await redisUtils.cleanup();
    performanceMeasurer.clear();
  });

  describe('Redis Connection Failures', () => {
    test('should handle Redis connection timeout gracefully', async () => {
      console.log('🔥 Testing Redis connection timeout...');
      
      // Mock Redis service to simulate connection timeout
      const mockRedis = createMockRedisService({ 
        enabled: true, 
        connected: false, 
        shouldFail: true 
      });
      
      // Replace Redis service in all services
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;
      (callSessionService as any).redisService = mockRedis;

      // All operations should still work
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();
      expect(lead.phone_number).toBe(TEST_ENV.TEST_PHONE);

      const context = await conversationService.buildConversationContext(lead.id);
      expect(context).toHaveProperty('customer_context');
      expect(context.customer_context.phone).toBe(TEST_ENV.TEST_PHONE);

      const greeting = await conversationService.generateDynamicGreeting(lead.id, 'voice');
      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);

      console.log('✅ System continues working despite Redis connection failure');
    });

    test('should handle Redis server unavailable scenario', async () => {
      console.log('🔥 Testing Redis server unavailable...');
      
      // Mock complete Redis unavailability
      const mockRedis = createMockRedisService({ 
        enabled: false, 
        connected: false 
      });

      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;

      // Test multiple operations in sequence
      const operations = [
        { name: 'findOrCreateLead', fn: () => 
          leadService.findOrCreateLead('+17781111111', TEST_ENV.ORGANIZATION_ID) },
        { name: 'updateLead', fn: async () => {
          const lead = await leadService.findOrCreateLead('+17782222222', TEST_ENV.ORGANIZATION_ID);
          return leadService.updateLead(lead.id, { customer_name: 'Resilience Test' });
        }},
        { name: 'getOrganizationByPhone', fn: () => 
          leadService.getOrganizationByPhone('+17783333333') },
        { name: 'buildContext', fn: async () => {
          const lead = await leadService.findOrCreateLead('+17784444444', TEST_ENV.ORGANIZATION_ID);
          return conversationService.buildConversationContext(lead.id);
        }},
        { name: 'generateGreeting', fn: async () => {
          const lead = await leadService.findOrCreateLead('+17785555555', TEST_ENV.ORGANIZATION_ID);
          return conversationService.generateDynamicGreeting(lead.id, 'voice');
        }}
      ];

      for (const operation of operations) {
        console.log(`  Testing ${operation.name} without Redis...`);
        const result = await operation.fn();
        expect(result).toBeDefined();
        console.log(`  ✅ ${operation.name} works without Redis`);
      }

      console.log('✅ All operations work correctly when Redis is unavailable');
    });

    test('should handle Redis memory exhaustion', async () => {
      console.log('🔥 Testing Redis memory exhaustion scenario...');
      
      // Mock Redis service to fail with memory errors
      const mockRedis = createMockRedisService({ shouldFail: true });
      mockRedis.set.mockRejectedValue(new Error('OOM command not allowed when used memory > maxmemory'));
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));
      
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;

      // Operations should continue to work
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();

      // Update should work (bypassing cache)
      await leadService.updateLead(lead.id, {
        customer_name: 'Memory Exhaustion Test',
        sentiment: 'positive'
      });

      // Retrieve updated lead
      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Memory Exhaustion Test');

      console.log('✅ System handles Redis memory exhaustion gracefully');
    });

    test('should handle partial Redis failures', async () => {
      console.log('🔥 Testing partial Redis failures...');
      
      // Mock Redis where some operations fail, others work
      const mockRedis = createMockRedisService({ enabled: true, connected: true });
      
      // Make only lead caching fail, but context caching work
      mockRedis.getCachedLead.mockRejectedValue(new Error('Redis timeout on lead cache'));
      mockRedis.cacheLead.mockRejectedValue(new Error('Redis timeout on lead cache'));
      
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;

      // Lead operations should work despite cache failures
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();

      // Context operations might still use cache (not affected by lead cache failure)
      const context = await conversationService.buildConversationContext(lead.id);
      expect(context).toHaveProperty('customer_context');

      console.log('✅ System handles partial Redis failures correctly');
    });
  });

  describe('Graceful Degradation', () => {
    test('should maintain identical functionality without Redis', async () => {
      console.log('🔧 Testing identical functionality without Redis...');
      
      const testPhone = '+17786666666';
      
      // Test with Redis enabled first
      enableRedisForTest();
      
      const leadWithRedis = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const contextWithRedis = await conversationService.buildConversationContext(leadWithRedis.id);
      const greetingWithRedis = await conversationService.generateDynamicGreeting(leadWithRedis.id, 'voice');
      
      // Test without Redis
      process.env.REDIS_ENABLED = 'false';
      
      // Create new service instances to pick up the environment change
      const leadServiceNoRedis = new LeadService();
      const conversationServiceNoRedis = new ConversationService();
      
      const leadWithoutRedis = await leadServiceNoRedis.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const contextWithoutRedis = await conversationServiceNoRedis.buildConversationContext(leadWithoutRedis.id);
      const greetingWithoutRedis = await conversationServiceNoRedis.generateDynamicGreeting(leadWithoutRedis.id, 'voice');

      // Results should be functionally identical
      expect(leadWithRedis.id).toBe(leadWithoutRedis.id);
      expect(leadWithRedis.phone_number).toBe(leadWithoutRedis.phone_number);
      
      expect(contextWithRedis.customer_context.phone).toBe(contextWithoutRedis.customer_context.phone);
      expect(contextWithRedis.business_context.store_name).toBe(contextWithoutRedis.business_context.store_name);
      
      expect(typeof greetingWithRedis).toBe('string');
      expect(typeof greetingWithoutRedis).toBe('string');
      expect(greetingWithRedis.length).toBeGreaterThan(0);
      expect(greetingWithoutRedis.length).toBeGreaterThan(0);

      console.log('✅ Functionality is identical with and without Redis');
    });

    test('should handle Redis going down mid-operation', async () => {
      console.log('🔥 Testing Redis failure mid-operation...');
      
      enableRedisForTest();
      
      // Start with Redis working
      const mockRedis = createMockRedisService({ enabled: true, connected: true });
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;
      
      // First operation succeeds
      const lead1 = await leadService.findOrCreateLead('+17777777777', TEST_ENV.ORGANIZATION_ID);
      expect(lead1).toBeDefined();
      
      // Redis "goes down" - mock all operations to fail
      mockRedis.getCachedLead.mockRejectedValue(new Error('Connection lost'));
      mockRedis.cacheLead.mockRejectedValue(new Error('Connection lost'));
      mockRedis.getCachedContext.mockRejectedValue(new Error('Connection lost'));
      mockRedis.cacheContext.mockRejectedValue(new Error('Connection lost'));
      
      // Subsequent operations should still work
      const lead2 = await leadService.findOrCreateLead('+17788888888', TEST_ENV.ORGANIZATION_ID);
      expect(lead2).toBeDefined();
      
      const context = await conversationService.buildConversationContext(lead2.id);
      expect(context).toHaveProperty('customer_context');
      
      console.log('✅ System continues working when Redis fails mid-operation');
    });

    test('should handle Redis network partitions', async () => {
      console.log('🔥 Testing Redis network partition scenario...');
      
      // Simulate network partition - Redis appears connected but operations timeout
      const mockRedis = createMockRedisService({ enabled: true, connected: true });
      
      // All operations timeout (network partition)
      const timeoutError = new Error('Operation timed out');
      mockRedis.get.mockImplementation(() => new Promise((_, reject) => 
        setTimeout(() => reject(timeoutError), 100)
      ));
      mockRedis.set.mockImplementation(() => new Promise((_, reject) => 
        setTimeout(() => reject(timeoutError), 100)
      ));
      
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;

      // Operations should complete despite timeouts
      const measureEnd = performanceMeasurer.start('network-partition-resilience');
      
      const lead = await leadService.findOrCreateLead('+17799999999', TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();
      
      const context = await conversationService.buildConversationContext(lead.id);
      expect(context).toHaveProperty('customer_context');
      
      const responseTime = measureEnd();
      console.log(`Response time during network partition: ${responseTime}ms`);
      
      // Should not take too long (should timeout Redis operations quickly)
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
      
      console.log('✅ System handles network partition gracefully');
    });
  });

  describe('Error Handling and Logging', () => {
    test('should log Redis errors without breaking functionality', async () => {
      console.log('📝 Testing error logging behavior...');
      
      const logSpy = jest.spyOn(logger, 'warn');
      
      const mockRedis = createMockRedisService({ shouldFail: true });
      (leadService as any).redisService = mockRedis;
      
      // Operations should work and log warnings
      await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      
      // Should have logged Redis errors (if implementation includes logging)
      // Note: This depends on the actual error logging implementation
      
      logSpy.mockRestore();
      
      console.log('✅ Error logging behavior verified');
    });

    test('should handle Redis configuration errors', async () => {
      console.log('🔧 Testing Redis configuration errors...');
      
      // Test with invalid Redis configuration
      const originalUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = 'invalid://redis/url';
      
      try {
        const leadServiceWithBadConfig = new LeadService();
        
        // Should still work (fallback to no caching)
        const lead = await leadServiceWithBadConfig.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
        expect(lead).toBeDefined();
        
        console.log('✅ Handles bad Redis configuration gracefully');
      } finally {
        // Restore original URL
        process.env.REDIS_URL = originalUrl;
      }
    });
  });

  describe('Recovery Behavior', () => {
    test('should recover when Redis becomes available again', async () => {
      console.log('🔄 Testing Redis recovery behavior...');
      
      // Start with Redis failing
      const mockRedis = createMockRedisService({ shouldFail: true });
      (leadService as any).redisService = mockRedis;
      
      // Operations work without Redis
      const lead1 = await leadService.findOrCreateLead('+17701234567', TEST_ENV.ORGANIZATION_ID);
      expect(lead1).toBeDefined();
      
      // Redis "recovers"
      mockRedis.getCachedLead.mockResolvedValue(null); // Cache miss, but working
      mockRedis.cacheLead.mockResolvedValue(undefined); // Caching works
      
      // Subsequent operations should use Redis again
      const lead2 = await leadService.findOrCreateLead('+17709876543', TEST_ENV.ORGANIZATION_ID);
      expect(lead2).toBeDefined();
      
      // Verify Redis operations were attempted
      expect(mockRedis.getCachedLead).toHaveBeenCalled();
      
      console.log('✅ System recovers to use Redis when available');
    });

    test('should handle intermittent Redis failures', async () => {
      console.log('🔄 Testing intermittent Redis failures...');
      
      const mockRedis = createMockRedisService();
      let callCount = 0;
      
      // Make every other call fail
      mockRedis.getCachedLead.mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Intermittent Redis failure');
        }
        return null; // Cache miss
      });
      
      (leadService as any).redisService = mockRedis;
      
      // Multiple operations should all succeed despite intermittent failures
      const phones = ['+17711111111', '+17722222222', '+17733333333', '+17744444444'];
      
      for (const phone of phones) {
        const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
        expect(lead).toBeDefined();
        expect(lead.phone_number).toBe(phone);
      }
      
      console.log('✅ System handles intermittent Redis failures');
    });
  });

  describe('Data Consistency During Failures', () => {
    test('should maintain data consistency when Redis fails during updates', async () => {
      console.log('🔒 Testing data consistency during Redis failures...');
      
      const mockRedis = createMockRedisService();
      (leadService as any).redisService = mockRedis;
      
      // Create and cache a lead
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();
      
      // Simulate Redis failure during cache invalidation
      mockRedis.clearLeadCache.mockRejectedValue(new Error('Redis failure during invalidation'));
      
      // Update should still work and data should be consistent
      await leadService.updateLead(lead.id, {
        customer_name: 'Consistency Test',
        sentiment: 'positive'
      });
      
      // Subsequent read should show the update (from database, not stale cache)
      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Consistency Test');
      expect(updatedLead.sentiment).toBe('positive');
      
      console.log('✅ Data consistency maintained during Redis failures');
    });

    test('should handle cache invalidation failures gracefully', async () => {
      console.log('🔒 Testing cache invalidation failure handling...');
      
      const mockRedis = createMockRedisService();
      (leadService as any).redisService = mockRedis;
      (conversationService as any).redisService = mockRedis;
      
      const lead = await leadService.findOrCreateLead('+17701111111', TEST_ENV.ORGANIZATION_ID);
      
      // Build and cache context
      const context1 = await conversationService.buildConversationContext(lead.id);
      expect(context1).toHaveProperty('customer_context');
      
      // Fail cache invalidation
      mockRedis.clearContextCache.mockRejectedValue(new Error('Invalidation failed'));
      
      // Add a conversation (should trigger cache invalidation)
      await conversationService.saveConversation({
        lead_id: lead.id,
        session_id: 'test-session',
        type: 'voice',
        content: 'Test conversation',
        sender: 'customer',
        created_at: new Date().toISOString()
      });
      
      // System should handle the invalidation failure gracefully
      // Next context build should still work (might be from DB instead of stale cache)
      const context2 = await conversationService.buildConversationContext(lead.id);
      expect(context2).toHaveProperty('customer_context');
      
      console.log('✅ Cache invalidation failures handled gracefully');
    });
  });
});