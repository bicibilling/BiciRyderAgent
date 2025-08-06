const Redis = require('redis');
const { logger } = require('../utils/logger');

class ConversationStateManager {
  constructor() {
    // Initialize Redis client
    if (process.env.UPSTASH_REDIS_URL) {
      // Use Upstash Redis if URL is provided
      this.redis = Redis.createClient({
        url: process.env.UPSTASH_REDIS_URL,
        password: process.env.UPSTASH_REDIS_TOKEN,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('The server refused the connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });
    } else {
      // Use local Redis
      this.redis = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
    }
    
    this.redis.on('error', (err) => {
      logger.error('Redis Client Error', { error: err.message });
    });
    
    this.redis.on('connect', () => {
      logger.info('Redis Client Connected');
    });
    
    // Connect to Redis
    this.redis.connect();
    
    this.keyPrefix = 'bici:conversation:';
    this.sessionPrefix = 'bici:session:';
    this.organizationPrefix = 'bici:org:';
    this.analyticsPrefix = 'bici:analytics:';
    
    logger.info('ConversationStateManager initialized with Upstash Redis');
  }
  
  /**
   * Store conversation state with retry mechanism
   */
  async storeConversationState(conversationId, state, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = `${this.keyPrefix}${conversationId}`;
        const data = {
          ...state,
          updated_at: new Date().toISOString(),
          organization_id: state.organizationId
        };
        
        // Store with 24-hour expiration
        await this.redis.setex(key, 86400, JSON.stringify(data));
        
        // Update organization conversation list
        if (state.organizationId) {
          await this.addConversationToOrganization(state.organizationId, conversationId);
        }
        
        logger.debug('Stored conversation state', {
          conversationId,
          organizationId: state.organizationId,
          attempt
        });
        
        return true;
        
      } catch (error) {
        logger.error(`Conversation state storage attempt ${attempt} failed`, {
          conversationId,
          error: error.message
        });
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to store conversation state after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  
  /**
   * Retrieve conversation state with caching
   */
  async getConversationState(conversationId) {
    try {
      const key = `${this.keyPrefix}${conversationId}`;
      const data = await this.redis.get(key);
      
      if (data) {
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to retrieve conversation state', {
        conversationId,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Store dynamic variables for context preservation
   */
  async storeDynamicVariables(phoneNumber, organizationId, variables) {
    try {
      const key = `${this.keyPrefix}variables:${organizationId}:${phoneNumber}`;
      await this.redis.setex(key, 3600, JSON.stringify({
        variables,
        stored_at: new Date().toISOString(),
        organization_id: organizationId,
        phone_number: phoneNumber
      }));
      
      logger.debug('Stored dynamic variables', {
        phoneNumber,
        organizationId,
        variableCount: Object.keys(variables).length
      });
    } catch (error) {
      logger.error('Failed to store dynamic variables', {
        phoneNumber,
        organizationId,
        error: error.message
      });
    }
  }
  
  /**
   * Get dynamic variables
   */
  async getDynamicVariables(phoneNumber, organizationId) {
    try {
      const key = `${this.keyPrefix}variables:${organizationId}:${phoneNumber}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data).variables : null;
    } catch (error) {
      logger.error('Failed to retrieve dynamic variables', {
        phoneNumber,
        organizationId,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Store session data
   */
  async storeSessionData(sessionId, sessionData, ttlSeconds = 3600) {
    try {
      const key = `${this.sessionPrefix}${sessionId}`;
      const data = {
        ...sessionData,
        created_at: new Date().toISOString(),
        session_id: sessionId
      };
      
      await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
      
      logger.debug('Stored session data', {
        sessionId,
        organizationId: sessionData.organizationId,
        ttl: ttlSeconds
      });
    } catch (error) {
      logger.error('Failed to store session data', {
        sessionId,
        error: error.message
      });
    }
  }
  
  /**
   * Get session data
   */
  async getSessionData(sessionId) {
    try {
      const key = `${this.sessionPrefix}${sessionId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to retrieve session data', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Add conversation to organization list
   */
  async addConversationToOrganization(organizationId, conversationId) {
    try {
      const key = `${this.organizationPrefix}${organizationId}:conversations`;
      
      // Add to sorted set with current timestamp as score
      await this.redis.zadd(key, Date.now(), conversationId);
      
      // Set expiration to 7 days
      await this.redis.expire(key, 604800);
      
      logger.debug('Added conversation to organization', {
        organizationId,
        conversationId
      });
    } catch (error) {
      logger.error('Failed to add conversation to organization', {
        organizationId,
        conversationId,
        error: error.message
      });
    }
  }
  
  /**
   * Get conversations for organization
   */
  async getOrganizationConversations(organizationId, limit = 100) {
    try {
      const key = `${this.organizationPrefix}${organizationId}:conversations`;
      
      // Get most recent conversations (highest scores first)
      const conversationIds = await this.redis.zrevrange(key, 0, limit - 1);
      
      if (!conversationIds || conversationIds.length === 0) {
        return [];
      }
      
      // Get conversation states
      const conversations = await Promise.all(
        conversationIds.map(async (id) => {
          const state = await this.getConversationState(id);
          return state ? { id, ...state } : null;
        })
      );
      
      // Filter out null results
      return conversations.filter(conv => conv !== null);
      
    } catch (error) {
      logger.error('Failed to get organization conversations', {
        organizationId,
        error: error.message
      });
      return [];
    }
  }
  
  /**
   * Store conversation analytics
   */
  async storeConversationAnalytics(conversationId, analytics) {
    try {
      const key = `${this.analyticsPrefix}${conversationId}`;
      const data = {
        ...analytics,
        conversation_id: conversationId,
        recorded_at: new Date().toISOString()
      };
      
      // Store with 30-day expiration
      await this.redis.setex(key, 2592000, JSON.stringify(data));
      
      // Also add to daily analytics aggregation
      await this.updateDailyAnalytics(analytics.organizationId, analytics);
      
      logger.debug('Stored conversation analytics', {
        conversationId,
        organizationId: analytics.organizationId
      });
    } catch (error) {
      logger.error('Failed to store conversation analytics', {
        conversationId,
        error: error.message
      });
    }
  }
  
  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(conversationId) {
    try {
      const key = `${this.analyticsPrefix}${conversationId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to retrieve conversation analytics', {
        conversationId,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Update daily analytics aggregation
   */
  async updateDailyAnalytics(organizationId, analytics) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const key = `${this.analyticsPrefix}daily:${organizationId}:${today}`;
      
      // Get existing daily analytics
      const existing = await this.redis.get(key);
      const dailyAnalytics = existing ? JSON.parse(existing) : {
        date: today,
        organization_id: organizationId,
        total_conversations: 0,
        total_duration: 0,
        human_takeovers: 0,
        successful_completions: 0,
        average_rating: 0,
        call_types: {},
        peak_hours: {}
      };
      
      // Update aggregated data
      dailyAnalytics.total_conversations += 1;
      dailyAnalytics.total_duration += analytics.duration || 0;
      
      if (analytics.human_takeover) {
        dailyAnalytics.human_takeovers += 1;
      }
      
      if (analytics.successful_completion) {
        dailyAnalytics.successful_completions += 1;
      }
      
      if (analytics.call_type) {
        dailyAnalytics.call_types[analytics.call_type] = 
          (dailyAnalytics.call_types[analytics.call_type] || 0) + 1;
      }
      
      // Update peak hours
      const hour = new Date().getHours();
      dailyAnalytics.peak_hours[hour] = (dailyAnalytics.peak_hours[hour] || 0) + 1;
      
      dailyAnalytics.updated_at = new Date().toISOString();
      
      // Store with 90-day expiration
      await this.redis.setex(key, 7776000, JSON.stringify(dailyAnalytics));
      
    } catch (error) {
      logger.error('Failed to update daily analytics', {
        organizationId,
        error: error.message
      });
    }
  }
  
  /**
   * Get daily analytics for organization
   */
  async getDailyAnalytics(organizationId, date) {
    try {
      const key = `${this.analyticsPrefix}daily:${organizationId}:${date}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to retrieve daily analytics', {
        organizationId,
        date,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Get analytics for date range
   */
  async getAnalyticsRange(organizationId, startDate, endDate) {
    try {
      const analytics = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        const dayAnalytics = await this.getDailyAnalytics(organizationId, dateStr);
        
        if (dayAnalytics) {
          analytics.push(dayAnalytics);
        }
      }
      
      return analytics;
    } catch (error) {
      logger.error('Failed to retrieve analytics range', {
        organizationId,
        startDate,
        endDate,
        error: error.message
      });
      return [];
    }
  }
  
  /**
   * Store real-time metrics
   */
  async storeRealtimeMetrics(organizationId, metrics) {
    try {
      const key = `${this.organizationPrefix}${organizationId}:realtime`;
      const data = {
        ...metrics,
        organization_id: organizationId,
        timestamp: new Date().toISOString()
      };
      
      // Store with 1-hour expiration (realtime data)
      await this.redis.setex(key, 3600, JSON.stringify(data));
      
      logger.debug('Stored realtime metrics', {
        organizationId,
        activeConversations: metrics.activeConversations
      });
    } catch (error) {
      logger.error('Failed to store realtime metrics', {
        organizationId,
        error: error.message
      });
    }
  }
  
  /**
   * Get real-time metrics
   */
  async getRealtimeMetrics(organizationId) {
    try {
      const key = `${this.organizationPrefix}${organizationId}:realtime`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to retrieve realtime metrics', {
        organizationId,
        error: error.message
      });
      return null;
    }
  }
  
  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      // This is handled automatically by Redis TTL, but we can do additional cleanup here
      logger.debug('Redis cleanup completed (automatic TTL handling)');
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error.message
      });
    }
  }
  
  /**
   * Get Redis connection statistics
   */
  async getConnectionStats() {
    try {
      const info = await this.redis.info();
      return {
        connected: true,
        info: info
      };
    } catch (error) {
      logger.error('Failed to get Redis connection stats', {
        error: error.message
      });
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  /**
   * Bulk delete conversations (cleanup utility)
   */
  async bulkDeleteConversations(conversationIds) {
    try {
      const keys = conversationIds.map(id => `${this.keyPrefix}${id}`);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Bulk deleted conversations', {
          count: keys.length
        });
      }
      
      return keys.length;
    } catch (error) {
      logger.error('Failed to bulk delete conversations', {
        error: error.message
      });
      return 0;
    }
  }
  
  /**
   * Search conversations by criteria
   */
  async searchConversations(organizationId, criteria) {
    try {
      const conversations = await this.getOrganizationConversations(organizationId, 1000);
      
      let filtered = conversations;
      
      // Filter by phone number
      if (criteria.phoneNumber) {
        filtered = filtered.filter(conv => 
          conv.customerPhone === criteria.phoneNumber
        );
      }
      
      // Filter by date range
      if (criteria.startDate || criteria.endDate) {
        filtered = filtered.filter(conv => {
          const convDate = new Date(conv.startedAt || conv.created_at);
          if (criteria.startDate && convDate < new Date(criteria.startDate)) {
            return false;
          }
          if (criteria.endDate && convDate > new Date(criteria.endDate)) {
            return false;
          }
          return true;
        });
      }
      
      // Filter by status
      if (criteria.status) {
        filtered = filtered.filter(conv => conv.status === criteria.status);
      }
      
      // Filter by human takeover
      if (criteria.humanTakeover !== undefined) {
        filtered = filtered.filter(conv => 
          Boolean(conv.isHumanTakeover) === Boolean(criteria.humanTakeover)
        );
      }
      
      return filtered;
      
    } catch (error) {
      logger.error('Failed to search conversations', {
        organizationId,
        criteria,
        error: error.message
      });
      return [];
    }
  }
}

module.exports = { ConversationStateManager };