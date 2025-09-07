import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { getRedisConnection } from '../config/redis.config';

/**
 * Redis Service for BICI AI Voice Agent System
 * Provides caching layer with graceful fallback patterns
 */
export class RedisService {
  private redis: Redis | null = null;
  private isEnabled: boolean = true;

  // Cache key prefixes for consistent naming
  private static readonly CACHE_KEYS = {
    LEAD_BY_PHONE: (phone: string) => `bici:lead:${phone}`,
    ORG_BY_PHONE: (phone: string) => `bici:org:${phone}`,
    CONTEXT: (leadId: string) => `bici:ctx:${leadId}`,
    CONVERSATIONS: (leadId: string, limit: number) => `bici:conv:${leadId}:${limit}`,
    SUMMARIES: (leadId: string) => `bici:sum:${leadId}`,
    SESSION: (leadId: string) => `bici:sess:${leadId}`,
    GREETING: (leadId: string) => `bici:greet:${leadId}`
  };

  // Cache TTL settings (in seconds)
  private static readonly TTL = {
    LEADS: 300,      // 5 minutes
    ORGANIZATIONS: 600,   // 10 minutes
    CONTEXT: 60,     // 1 minute
    CONVERSATIONS: 120,   // 2 minutes
    SUMMARIES: 300,  // 5 minutes
    SESSIONS: 120,   // 2 minutes
    GREETINGS: 60    // 1 minute
  };

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  private async initialize(): Promise<void> {
    try {
      this.redis = await getRedisConnection();
      this.isEnabled = this.redis !== null;
      
      if (this.isEnabled) {
        logger.info('Redis service initialized successfully');
      } else {
        logger.warn('Redis service initialized in disabled mode');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis service:', error);
      this.isEnabled = false;
      this.redis = null;
    }
  }

  /**
   * Get Redis connection, reinitialize if needed
   */
  private async getConnection(): Promise<Redis | null> {
    if (!this.isEnabled) {
      return null;
    }

    if (!this.redis) {
      await this.initialize();
    }

    return this.redis;
  }

  /**
   * Execute Redis operation with error handling and fallback
   */
  private async executeWithFallback<T>(
    operation: (redis: Redis) => Promise<T>,
    fallback: () => T = () => null as T,
    operationName: string = 'Redis operation'
  ): Promise<T> {
    try {
      const redis = await this.getConnection();
      
      if (!redis) {
        logger.debug(`${operationName}: Redis not available, using fallback`);
        return fallback();
      }

      return await operation(redis);
    } catch (error) {
      logger.error(`${operationName} failed:`, error);
      return fallback();
    }
  }

  // Lead caching methods
  /**
   * Cache lead data by phone number
   */
  public async cacheLead(phoneNumber: string, leadData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.LEAD_BY_PHONE(phoneNumber);
        await redis.setex(key, RedisService.TTL.LEADS, JSON.stringify(leadData));
        return true;
      },
      () => false,
      `Cache lead for ${phoneNumber}`
    );
  }

  /**
   * Get cached lead data by phone number
   */
  public async getCachedLead(phoneNumber: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.LEAD_BY_PHONE(phoneNumber);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached lead for ${phoneNumber}`
    );
  }

  /**
   * Invalidate lead cache
   */
  public async invalidateLeadCache(phoneNumber: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.LEAD_BY_PHONE(phoneNumber);
        await redis.del(key);
        return true;
      },
      () => false,
      `Invalidate lead cache for ${phoneNumber}`
    );
  }

  // Organization caching methods
  /**
   * Cache organization data by phone number
   */
  public async cacheOrganization(phoneNumber: string, orgData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.ORG_BY_PHONE(phoneNumber);
        await redis.setex(key, RedisService.TTL.ORGANIZATIONS, JSON.stringify(orgData));
        return true;
      },
      () => false,
      `Cache organization for ${phoneNumber}`
    );
  }

  /**
   * Get cached organization data by phone number
   */
  public async getCachedOrganization(phoneNumber: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.ORG_BY_PHONE(phoneNumber);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached organization for ${phoneNumber}`
    );
  }

  // Context caching methods
  /**
   * Cache conversation context for a lead
   */
  public async cacheContext(leadId: string, contextData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CONTEXT(leadId);
        await redis.setex(key, RedisService.TTL.CONTEXT, JSON.stringify(contextData));
        return true;
      },
      () => false,
      `Cache context for lead ${leadId}`
    );
  }

  /**
   * Get cached conversation context for a lead
   */
  public async getCachedContext(leadId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CONTEXT(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached context for lead ${leadId}`
    );
  }

  // Conversations caching methods
  /**
   * Cache recent conversations for a lead
   */
  public async cacheConversations(leadId: string, conversations: any[], limit: number): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CONVERSATIONS(leadId, limit);
        await redis.setex(key, RedisService.TTL.CONVERSATIONS, JSON.stringify(conversations));
        return true;
      },
      () => false,
      `Cache conversations for lead ${leadId}`
    );
  }

  /**
   * Get cached conversations for a lead
   */
  public async getCachedConversations(leadId: string, limit: number): Promise<any[] | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CONVERSATIONS(leadId, limit);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached conversations for lead ${leadId}`
    );
  }

  // Summaries caching methods
  /**
   * Cache conversation summaries for a lead
   */
  public async cacheSummaries(leadId: string, summaries: string[]): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SUMMARIES(leadId);
        await redis.setex(key, RedisService.TTL.SUMMARIES, JSON.stringify(summaries));
        return true;
      },
      () => false,
      `Cache summaries for lead ${leadId}`
    );
  }

  /**
   * Get cached summaries for a lead
   */
  public async getCachedSummaries(leadId: string): Promise<string[] | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SUMMARIES(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached summaries for lead ${leadId}`
    );
  }

  // Session caching methods
  /**
   * Cache active session data for a lead
   */
  public async cacheSession(leadId: string, sessionData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SESSION(leadId);
        await redis.setex(key, RedisService.TTL.SESSIONS, JSON.stringify(sessionData));
        return true;
      },
      () => false,
      `Cache session for lead ${leadId}`
    );
  }

  /**
   * Get cached session data for a lead
   */
  public async getCachedSession(leadId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SESSION(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached session for lead ${leadId}`
    );
  }

  /**
   * Remove cached session
   */
  public async removeCachedSession(leadId: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SESSION(leadId);
        await redis.del(key);
        return true;
      },
      () => false,
      `Remove cached session for lead ${leadId}`
    );
  }

  // Greeting caching methods
  /**
   * Cache dynamic greeting for a lead
   */
  public async cacheGreeting(leadId: string, greeting: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.GREETING(leadId);
        await redis.setex(key, RedisService.TTL.GREETINGS, greeting);
        return true;
      },
      () => false,
      `Cache greeting for lead ${leadId}`
    );
  }

  /**
   * Get cached greeting for a lead
   */
  public async getCachedGreeting(leadId: string): Promise<string | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.GREETING(leadId);
        return await redis.get(key);
      },
      () => null,
      `Get cached greeting for lead ${leadId}`
    );
  }

  // Utility methods
  /**
   * Clear all cache entries for a lead
   */
  public async clearLeadCache(leadId: string, phoneNumber?: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const keys = [
          RedisService.CACHE_KEYS.CONTEXT(leadId),
          RedisService.CACHE_KEYS.SUMMARIES(leadId),
          RedisService.CACHE_KEYS.SESSION(leadId),
          RedisService.CACHE_KEYS.GREETING(leadId)
        ];

        if (phoneNumber) {
          keys.push(
            RedisService.CACHE_KEYS.LEAD_BY_PHONE(phoneNumber),
            RedisService.CACHE_KEYS.ORG_BY_PHONE(phoneNumber)
          );
        }

        // Also clear conversation caches for common limits
        for (const limit of [5, 10, 20]) {
          keys.push(RedisService.CACHE_KEYS.CONVERSATIONS(leadId, limit));
        }

        if (keys.length > 0) {
          await redis.del(...keys);
        }
        
        return true;
      },
      () => false,
      `Clear all cache for lead ${leadId}`
    );
  }

  /**
   * Get Redis service status
   */
  public getStatus(): { enabled: boolean; connected: boolean } {
    return {
      enabled: this.isEnabled,
      connected: this.redis !== null && this.redis.status === 'ready'
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('Redis service cleaned up successfully');
      } catch (error) {
        logger.error('Error during Redis service cleanup:', error);
      }
      this.redis = null;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();