/**
 * Test Utilities
 * Helper functions for testing Redis implementation
 */

import { RedisService } from '../../services/redis.service';
import { RedisConfig } from '../../config/redis.config';
import { TEST_ENV } from '../setup';

// Performance measurement utilities
export class PerformanceMeasurer {
  private measurements: Map<string, number[]> = new Map();

  start(operation: string): () => number {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.recordMeasurement(operation, duration);
      return duration;
    };
  }

  recordMeasurement(operation: string, duration: number) {
    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }
    this.measurements.get(operation)!.push(duration);
  }

  getStats(operation: string) {
    const measurements = this.measurements.get(operation) || [];
    if (measurements.length === 0) return null;

    const sorted = measurements.sort((a, b) => a - b);
    const sum = measurements.reduce((a, b) => a + b, 0);
    
    return {
      count: measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  clear() {
    this.measurements.clear();
  }

  getSummary() {
    const summary: Record<string, any> = {};
    for (const [operation, measurements] of this.measurements) {
      summary[operation] = this.getStats(operation);
    }
    return summary;
  }
}

// Redis test utilities
export class RedisTestUtils {
  private redisService: RedisService;
  private keysToCleanup: string[] = [];

  constructor() {
    this.redisService = new RedisService();
  }

  // Track keys for cleanup
  trackKey(key: string) {
    this.keysToCleanup.push(key);
  }

  // Clean up test keys
  async cleanup() {
    if (this.keysToCleanup.length > 0) {
      try {
        for (const key of this.keysToCleanup) {
          await this.redisService.delete(key);
        }
        this.keysToCleanup = [];
      } catch (error) {
        console.warn('Error during Redis cleanup:', (error as Error).message);
      }
    }
    await this.redisService.cleanup();
  }

  // Test Redis connection
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const status = this.redisService.getStatus();
      return { connected: status.enabled && status.connected };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }

  // Generate unique test keys
  generateTestKey(prefix: string): string {
    const key = `test:${prefix}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    this.trackKey(key);
    return key;
  }

  // Simulate Redis failure
  async simulateRedisFailure() {
    // This would be used with a mock Redis service in advanced tests
    console.warn('Simulating Redis failure - would need mock implementation');
  }
}

// Mock service factories
export function createMockRedisService(options: {
  enabled?: boolean;
  connected?: boolean;
  shouldFail?: boolean;
} = {}) {
  const { enabled = true, connected = true, shouldFail = false } = options;

  return {
    getStatus: () => ({ enabled, connected }),
    
    // Lead caching mocks
    cacheLead: jest.fn().mockImplementation(async (phoneNumber: string, lead: any) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    getCachedLead: jest.fn().mockImplementation(async (phoneNumber: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve(null); // Simulate cache miss by default
    }),
    
    // Context caching mocks
    cacheContext: jest.fn().mockImplementation(async (leadId: string, context: any) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    getCachedContext: jest.fn().mockImplementation(async (leadId: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve(null);
    }),
    
    // Session caching mocks
    cacheSession: jest.fn().mockImplementation(async (sessionId: string, session: any) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    getCachedSession: jest.fn().mockImplementation(async (sessionId: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve(null);
    }),
    
    // Generic operations
    get: jest.fn().mockImplementation(async (key: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve(null);
    }),
    
    set: jest.fn().mockImplementation(async (key: string, value: any, ttl?: number) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    delete: jest.fn().mockImplementation(async (key: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    // Cache management
    clearLeadCache: jest.fn().mockImplementation(async (leadId: string, phoneNumber?: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    clearContextCache: jest.fn().mockImplementation(async (leadId: string) => {
      if (shouldFail) throw new Error('Redis connection failed');
      return Promise.resolve();
    }),
    
    cleanup: jest.fn().mockResolvedValue(undefined)
  };
}

// Webhook test utilities
export class WebhookTestUtils {
  static createConversationInitiationPayload(phoneNumber: string = TEST_ENV.TEST_PHONE) {
    return {
      conversation_id: `conv_${Date.now()}`,
      agent_id: TEST_ENV.ELEVENLABS_AGENT_ID,
      user_id: null,
      phone_number: phoneNumber,
      timestamp: new Date().toISOString()
    };
  }

  static createPostCallPayload(conversationId: string) {
    return {
      conversation_id: conversationId,
      agent_id: TEST_ENV.ELEVENLABS_AGENT_ID,
      transcript: 'Test conversation transcript',
      summary: 'Customer inquired about bike availability',
      duration_seconds: 120,
      timestamp: new Date().toISOString()
    };
  }

  static createSMSWebhookPayload(messageBody: string, fromNumber: string = TEST_ENV.TEST_PHONE) {
    return {
      MessageSid: `SM${Date.now()}`,
      AccountSid: 'test-account-sid',
      From: fromNumber,
      To: TEST_ENV.TWILIO_PHONE_NUMBER,
      Body: messageBody,
      NumMedia: '0'
    };
  }
}

// Load testing utilities
export class LoadTestUtils {
  static async simulateConcurrentRequests<T>(
    operation: () => Promise<T>,
    concurrency: number,
    duration: number = 10000
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    requestsPerSecond: number;
  }> {
    const results: { success: boolean; responseTime: number }[] = [];
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    const workers = Array(concurrency).fill(null).map(async () => {
      while (Date.now() < endTime) {
        const requestStart = Date.now();
        try {
          await operation();
          results.push({ success: true, responseTime: Date.now() - requestStart });
        } catch (error) {
          results.push({ success: false, responseTime: Date.now() - requestStart });
        }
      }
    });
    
    await Promise.all(workers);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const responseTimes = successful.map(r => r.responseTime);
    
    return {
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      avgResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      requestsPerSecond: results.length / (duration / 1000)
    };
  }
}

// Assertion helpers
export const RedisAssertions = {
  expectCacheHit: (mockGet: jest.Mock, key: string) => {
    expect(mockGet).toHaveBeenCalledWith(key);
    expect(mockGet).toHaveReturnedWith(expect.any(Promise));
  },

  expectCacheMiss: (mockGet: jest.Mock, mockSet: jest.Mock, key: string) => {
    expect(mockGet).toHaveBeenCalledWith(key);
    expect(mockSet).toHaveBeenCalledWith(key, expect.anything(), expect.any(Number));
  },

  expectCacheInvalidation: (mockDelete: jest.Mock, keyPattern: string | RegExp) => {
    const calls = mockDelete.mock.calls;
    if (typeof keyPattern === 'string') {
      expect(calls).toContainEqual([keyPattern]);
    } else {
      expect(calls.some((call: any[]) => keyPattern.test(call[0]))).toBe(true);
    }
  },

  expectPerformanceImprovement: (coldTime: number, warmTime: number, minimumImprovement: number = 0.2) => {
    const improvement = (coldTime - warmTime) / coldTime;
    expect(improvement).toBeGreaterThan(minimumImprovement);
  }
};

export { PerformanceMeasurer, RedisTestUtils, WebhookTestUtils, LoadTestUtils };