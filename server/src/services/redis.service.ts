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
    GREETING: (leadId: string) => `bici:greet:${leadId}`,
    // Session-specific cache keys
    CALL_SESSION: (sessionId: string) => `bici:sess:call:${sessionId}`,
    CALL_SESSION_BY_LEAD: (leadId: string) => `bici:sess:call:lead:${leadId}`,
    CALL_SESSION_BY_CONVERSATION: (conversationId: string) => `bici:sess:call:conv:${conversationId}`,
    HUMAN_SESSION: (leadId: string) => `bici:sess:human:${leadId}`,
    HUMAN_SESSIONS_ALL: () => `bici:sess:human:all`,
    SMS_SESSION: (leadId: string) => `bici:sess:sms:${leadId}`,
    SMS_AUTOMATION_STATE: (leadId: string) => `bici:sms:auto:${leadId}`,
    DASHBOARD_STATS: (orgId: string) => `bici:dashboard:stats:${orgId}`,
    DASHBOARD_LEADS: (orgId: string) => `bici:dashboard:leads:${orgId}`
  };

  // Cache TTL settings (in seconds)
  private static readonly TTL = {
    LEADS: 300,      // 5 minutes
    ORGANIZATIONS: 600,   // 10 minutes
    CONTEXT: 60,     // 1 minute
    CONVERSATIONS: 120,   // 2 minutes
    SUMMARIES: 300,  // 5 minutes
    SESSIONS: 120,   // 2 minutes
    GREETINGS: 60,   // 1 minute
    // Session-specific TTL settings
    CALL_SESSIONS: 120,      // 2 minutes (calls are short-lived)
    HUMAN_SESSIONS: 1800,    // 30 minutes (longer human interactions)
    SMS_SESSIONS: 300,       // 5 minutes (SMS conversations span longer)
    SMS_AUTOMATION: 600,     // 10 minutes (automation state)
    DASHBOARD_STATS: 30,     // 30 seconds (balance freshness with performance)
    DASHBOARD_LEADS: 60      // 1 minute (lead lists change frequently)
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

  // Call Session caching methods
  /**
   * Cache call session data
   */
  public async cacheCallSession(sessionId: string, sessionData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CALL_SESSION(sessionId);
        await redis.setex(key, RedisService.TTL.CALL_SESSIONS, JSON.stringify(sessionData));
        
        // Also cache by lead_id for faster lookups
        if (sessionData.lead_id) {
          const leadKey = RedisService.CACHE_KEYS.CALL_SESSION_BY_LEAD(sessionData.lead_id);
          await redis.setex(leadKey, RedisService.TTL.CALL_SESSIONS, sessionId);
        }
        
        // Cache by conversation_id if available
        if (sessionData.elevenlabs_conversation_id) {
          const convKey = RedisService.CACHE_KEYS.CALL_SESSION_BY_CONVERSATION(sessionData.elevenlabs_conversation_id);
          await redis.setex(convKey, RedisService.TTL.CALL_SESSIONS, sessionId);
        }
        
        return true;
      },
      () => false,
      `Cache call session ${sessionId}`
    );
  }

  /**
   * Get cached call session data
   */
  public async getCachedCallSession(sessionId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CALL_SESSION(sessionId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached call session ${sessionId}`
    );
  }

  /**
   * Get cached call session ID by lead ID
   */
  public async getCachedCallSessionIdByLead(leadId: string): Promise<string | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CALL_SESSION_BY_LEAD(leadId);
        return await redis.get(key);
      },
      () => null,
      `Get cached call session ID for lead ${leadId}`
    );
  }

  /**
   * Get cached call session ID by conversation ID
   */
  public async getCachedCallSessionIdByConversation(conversationId: string): Promise<string | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.CALL_SESSION_BY_CONVERSATION(conversationId);
        return await redis.get(key);
      },
      () => null,
      `Get cached call session ID for conversation ${conversationId}`
    );
  }

  /**
   * Remove call session from cache
   */
  public async removeCachedCallSession(sessionId: string, sessionData?: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const keys = [RedisService.CACHE_KEYS.CALL_SESSION(sessionId)];
        
        if (sessionData?.lead_id) {
          keys.push(RedisService.CACHE_KEYS.CALL_SESSION_BY_LEAD(sessionData.lead_id));
        }
        
        if (sessionData?.elevenlabs_conversation_id) {
          keys.push(RedisService.CACHE_KEYS.CALL_SESSION_BY_CONVERSATION(sessionData.elevenlabs_conversation_id));
        }
        
        await redis.del(...keys);
        return true;
      },
      () => false,
      `Remove cached call session ${sessionId}`
    );
  }

  // Human Control Session caching methods
  /**
   * Cache human control session data
   */
  public async cacheHumanSession(leadId: string, sessionData: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.HUMAN_SESSION(leadId);
        await redis.setex(key, RedisService.TTL.HUMAN_SESSIONS, JSON.stringify(sessionData));
        
        // Also maintain a set of all active human sessions
        const allSessionsKey = RedisService.CACHE_KEYS.HUMAN_SESSIONS_ALL();
        await redis.sadd(allSessionsKey, leadId);
        await redis.expire(allSessionsKey, RedisService.TTL.HUMAN_SESSIONS);
        
        return true;
      },
      () => false,
      `Cache human session for lead ${leadId}`
    );
  }

  /**
   * Get cached human control session data
   */
  public async getCachedHumanSession(leadId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.HUMAN_SESSION(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached human session for lead ${leadId}`
    );
  }

  /**
   * Get all cached human session lead IDs
   */
  public async getCachedHumanSessionLeads(): Promise<string[]> {
    return this.executeWithFallback(
      async (redis) => {
        const allSessionsKey = RedisService.CACHE_KEYS.HUMAN_SESSIONS_ALL();
        return await redis.smembers(allSessionsKey);
      },
      () => [],
      `Get all cached human session leads`
    );
  }

  /**
   * Remove human control session from cache
   */
  public async removeCachedHumanSession(leadId: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.HUMAN_SESSION(leadId);
        const allSessionsKey = RedisService.CACHE_KEYS.HUMAN_SESSIONS_ALL();
        
        await redis.del(key);
        await redis.srem(allSessionsKey, leadId);
        
        return true;
      },
      () => false,
      `Remove cached human session for lead ${leadId}`
    );
  }

  // SMS Session caching methods
  /**
   * Cache SMS session state
   */
  public async cacheSMSSession(leadId: string, sessionState: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SMS_SESSION(leadId);
        await redis.setex(key, RedisService.TTL.SMS_SESSIONS, JSON.stringify(sessionState));
        return true;
      },
      () => false,
      `Cache SMS session for lead ${leadId}`
    );
  }

  /**
   * Get cached SMS session state
   */
  public async getCachedSMSSession(leadId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SMS_SESSION(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached SMS session for lead ${leadId}`
    );
  }

  /**
   * Cache SMS automation state
   */
  public async cacheSMSAutomationState(leadId: string, automationState: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SMS_AUTOMATION_STATE(leadId);
        await redis.setex(key, RedisService.TTL.SMS_AUTOMATION, JSON.stringify(automationState));
        return true;
      },
      () => false,
      `Cache SMS automation state for lead ${leadId}`
    );
  }

  /**
   * Get cached SMS automation state
   */
  public async getCachedSMSAutomationState(leadId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.SMS_AUTOMATION_STATE(leadId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached SMS automation state for lead ${leadId}`
    );
  }

  // Dashboard caching methods
  /**
   * Cache dashboard statistics
   */
  public async cacheDashboardStats(orgId: string, stats: any): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.DASHBOARD_STATS(orgId);
        await redis.setex(key, RedisService.TTL.DASHBOARD_STATS, JSON.stringify(stats));
        return true;
      },
      () => false,
      `Cache dashboard stats for org ${orgId}`
    );
  }

  /**
   * Get cached dashboard statistics
   */
  public async getCachedDashboardStats(orgId: string): Promise<any | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.DASHBOARD_STATS(orgId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached dashboard stats for org ${orgId}`
    );
  }

  /**
   * Cache dashboard leads list
   */
  public async cacheDashboardLeads(orgId: string, leads: any[]): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.DASHBOARD_LEADS(orgId);
        await redis.setex(key, RedisService.TTL.DASHBOARD_LEADS, JSON.stringify(leads));
        return true;
      },
      () => false,
      `Cache dashboard leads for org ${orgId}`
    );
  }

  /**
   * Get cached dashboard leads list
   */
  public async getCachedDashboardLeads(orgId: string): Promise<any[] | null> {
    return this.executeWithFallback(
      async (redis) => {
        const key = RedisService.CACHE_KEYS.DASHBOARD_LEADS(orgId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      },
      () => null,
      `Get cached dashboard leads for org ${orgId}`
    );
  }

  /**
   * Invalidate dashboard caches for an organization
   */
  public async invalidateDashboardCache(orgId: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const keys = [
          RedisService.CACHE_KEYS.DASHBOARD_STATS(orgId),
          RedisService.CACHE_KEYS.DASHBOARD_LEADS(orgId)
        ];
        await redis.del(...keys);
        return true;
      },
      () => false,
      `Invalidate dashboard cache for org ${orgId}`
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
   * Generic Redis operations for testing and monitoring
   */
  public async get(key: string): Promise<string | null> {
    return this.executeWithFallback(
      async (redis) => {
        return await redis.get(key);
      },
      () => null,
      `get key: ${key}`
    );
  }

  public async set(key: string, value: string, ttl?: number): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        if (ttl) {
          await redis.setex(key, ttl, value);
        } else {
          await redis.set(key, value);
        }
        return true;
      },
      () => false,
      `set key: ${key}`
    );
  }

  public async delete(key: string): Promise<boolean> {
    return this.executeWithFallback(
      async (redis) => {
        const result = await redis.del(key);
        return result > 0;
      },
      () => false,
      `delete key: ${key}`
    );
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