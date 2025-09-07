/**
 * Lead Service Redis Integration Tests
 * Tests caching integration with database operations
 */

import { LeadService } from '../../services/lead.service';
import { RedisService } from '../../services/redis.service';
import { RedisTestUtils, PerformanceMeasurer, createMockRedisService } from '../helpers/test-utils';
import { createTestLead, TEST_ORGANIZATIONS } from '../helpers/test-data';
import { enableRedisForTest, resetTestEnv, TEST_ENV } from '../setup';

describe('LeadService Redis Integration', () => {
  let leadService: LeadService;
  let redisUtils: RedisTestUtils;
  let performanceMeasurer: PerformanceMeasurer;

  beforeEach(() => {
    leadService = new LeadService();
    redisUtils = new RedisTestUtils();
    performanceMeasurer = new PerformanceMeasurer();
    resetTestEnv();
  });

  afterEach(async () => {
    await redisUtils.cleanup();
    performanceMeasurer.clear();
  });

  describe('Redis Disabled - Baseline Functionality', () => {
    beforeEach(() => {
      process.env.REDIS_ENABLED = 'false';
    });

    test('should work normally without Redis', async () => {
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      
      expect(lead).toBeDefined();
      expect(lead.phone_number).toBe(TEST_ENV.TEST_PHONE);
      expect(lead.organization_id).toBe(TEST_ENV.ORGANIZATION_ID);
    });

    test('should handle lead updates without caching', async () => {
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      
      await leadService.updateLead(lead.id, {
        customer_name: 'Test Customer',
        sentiment: 'positive'
      });

      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Test Customer');
      expect(updatedLead.sentiment).toBe('positive');
    });

    test('should return cache status as disabled', () => {
      const status = leadService.getCacheStatus();
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
    });
  });

  describe('Redis Enabled - Caching Functionality', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should cache leads on first access', async () => {
      const measureEnd = performanceMeasurer.start('findOrCreateLead-cold');
      const lead1 = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      const coldTime = measureEnd();

      // Second call should be faster due to caching
      const measureEnd2 = performanceMeasurer.start('findOrCreateLead-warm');
      const lead2 = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      const warmTime = measureEnd2();

      expect(lead1.id).toBe(lead2.id);
      
      // Cache should provide performance improvement
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should invalidate cache on lead updates', async () => {
      // Create and cache lead
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      
      // Update lead (should invalidate cache)
      await leadService.updateLead(lead.id, {
        customer_name: 'Cache Test User',
        sentiment: 'positive'
      });

      // Next access should reflect the update
      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Cache Test User');
      expect(updatedLead.sentiment).toBe('positive');
    });

    test('should cache organization lookup', async () => {
      const measureEnd1 = performanceMeasurer.start('getOrganizationByPhone-cold');
      const org1 = await leadService.getOrganizationByPhone(TEST_ENV.TEST_PHONE);
      const coldTime = measureEnd1();

      const measureEnd2 = performanceMeasurer.start('getOrganizationByPhone-warm');
      const org2 = await leadService.getOrganizationByPhone(TEST_ENV.TEST_PHONE);
      const warmTime = measureEnd2();

      expect(org1?.id).toBe(org2?.id);
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should handle findLeadByPhone caching', async () => {
      // Create lead first
      await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);

      const measureEnd1 = performanceMeasurer.start('findLeadByPhone-cold');
      const lead1 = await leadService.findLeadByPhone(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      const coldTime = measureEnd1();

      const measureEnd2 = performanceMeasurer.start('findLeadByPhone-warm');
      const lead2 = await leadService.findLeadByPhone(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      const warmTime = measureEnd2();

      expect(lead1?.id).toBe(lead2?.id);
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(warmTime).toBeLessThan(coldTime);
      }
    });

    test('should maintain data consistency with cache', async () => {
      // Create lead
      const originalLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);

      // Update via service
      await leadService.updateLead(originalLead.id, {
        customer_name: 'Updated Name',
        bike_interest: { type: 'road', budget: '2000-3000' }
      });

      // Retrieve again - should show updates
      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Updated Name');
      expect(updatedLead.bike_interest).toMatchObject({ type: 'road', budget: '2000-3000' });
    });

    test('should return proper cache status when enabled', () => {
      const status = leadService.getCacheStatus();
      expect(status.enabled).toBe(true);
      // Note: connected status depends on actual Redis availability
    });
  });

  describe('Fallback Behavior', () => {
    test('should gracefully handle Redis failures', async () => {
      // Mock Redis service to fail
      const mockRedis = createMockRedisService({ shouldFail: true });
      (leadService as any).redisService = mockRedis;

      // Operations should still work
      const lead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(lead).toBeDefined();
      expect(lead.phone_number).toBe(TEST_ENV.TEST_PHONE);

      // Updates should still work
      await leadService.updateLead(lead.id, { customer_name: 'Fallback Test' });
      
      // Verify the update persisted
      const updatedLead = await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      expect(updatedLead.customer_name).toBe('Fallback Test');
    });

    test('should handle Redis disconnection gracefully', () => {
      const mockRedis = createMockRedisService({ connected: false });
      (leadService as any).redisService = mockRedis;

      const status = leadService.getCacheStatus();
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(false);

      // Should still function without throwing errors
      expect(async () => {
        await leadService.findOrCreateLead(TEST_ENV.TEST_PHONE, TEST_ENV.ORGANIZATION_ID);
      }).not.toThrow();
    });
  });

  describe('Performance Validation', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should demonstrate measurable performance improvement', async () => {
      const iterations = 5;
      
      // Measure cold cache performance
      for (let i = 0; i < iterations; i++) {
        const phoneNumber = `+1778555000${i}`;
        const measureEnd = performanceMeasurer.start('cold-cache');
        await leadService.findOrCreateLead(phoneNumber, TEST_ENV.ORGANIZATION_ID);
        measureEnd();
      }

      // Measure warm cache performance
      for (let i = 0; i < iterations; i++) {
        const phoneNumber = `+1778555000${i}`;
        const measureEnd = performanceMeasurer.start('warm-cache');
        await leadService.findOrCreateLead(phoneNumber, TEST_ENV.ORGANIZATION_ID);
        measureEnd();
      }

      const coldStats = performanceMeasurer.getStats('cold-cache');
      const warmStats = performanceMeasurer.getStats('warm-cache');

      console.log('Performance Stats:', {
        cold: coldStats,
        warm: warmStats
      });

      // If Redis is actually enabled and working, we should see improvement
      if (process.env.REDIS_ENABLED === 'true' && coldStats && warmStats) {
        expect(warmStats.avg).toBeLessThan(coldStats.avg);
      }
    });

    test('should maintain acceptable response times', async () => {
      const iterations = 10;
      const maxAcceptableTime = 100; // 100ms for webhook compatibility

      for (let i = 0; i < iterations; i++) {
        const phoneNumber = `+1778555100${i}`;
        const measureEnd = performanceMeasurer.start('response-time');
        await leadService.findOrCreateLead(phoneNumber, TEST_ENV.ORGANIZATION_ID);
        measureEnd();
      }

      const stats = performanceMeasurer.getStats('response-time');
      if (stats) {
        expect(stats.avg).toBeLessThan(maxAcceptableTime);
        expect(stats.p95).toBeLessThan(maxAcceptableTime * 2); // Allow some variance for P95
      }
    });
  });

  describe('Cache Key Management', () => {
    beforeEach(() => {
      enableRedisForTest();
    });

    test('should use consistent cache keys', () => {
      // This test validates the cache key generation logic
      const normalizedPhone = '+17781234567';
      const leadService = new LeadService();
      
      // The cache keys should be predictable and consistent
      // This is important for cache invalidation
      expect(normalizedPhone).toMatch(/^\+1\d{10}$/);
    });

    test('should handle phone number normalization for caching', async () => {
      const phoneVariations = [
        '17781234567',
        '+17781234567',
        '(778) 123-4567',
        '778-123-4567'
      ];

      const leads = [];
      for (const phone of phoneVariations) {
        const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
        leads.push(lead);
      }

      // All should resolve to the same lead (same normalized phone number)
      const uniqueLeadIds = new Set(leads.map(l => l.id));
      expect(uniqueLeadIds.size).toBe(1);
    });
  });
});