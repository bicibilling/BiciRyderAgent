/**
 * BICI AI Voice System - Conversation State Manager
 * Redis-powered state management for real-time conversations
 */

const Redis = require('redis');
const { config } = require('../config');

class ConversationStateManager {
  constructor() {
    this.redis = Redis.createClient({
      url: config.database.redis.url,
      password: config.database.redis.token
    });

    this.redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    // Connect to Redis
    this.redis.connect().catch(console.error);
  }

  /**
   * Store conversation state with retry mechanism (SOW requirement)
   */
  async storeConversationState(conversationId, state, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = `conversation:${conversationId}`;
        const data = {
          ...state,
          updated_at: new Date().toISOString(),
          version: (state.version || 0) + 1
        };

        // Store with 24-hour expiration
        await this.redis.setEx(key, 86400, JSON.stringify(data));

        console.log(`✅ Stored conversation state for ${conversationId} (attempt ${attempt})`);
        return true;

      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed to store conversation state:`, error);

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
      const key = `conversation:${conversationId}`;
      const data = await this.redis.get(key);

      if (data) {
        const parsed = JSON.parse(data);
        console.log(`📖 Retrieved conversation state for ${conversationId}`);
        return parsed;
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to retrieve conversation state:', error);
      return null;
    }
  }

  /**
   * Store dynamic variables for context preservation (SOW requirement)
   */
  async storeDynamicVariables(phoneNumber, organizationId, variables) {
    try {
      const key = `variables:${organizationId}:${phoneNumber}`;
      const data = {
        variables,
        updated_at: new Date().toISOString(),
        phone_number: phoneNumber,
        organization_id: organizationId
      };

      // Store with 1 hour expiration for quick access during calls
      await this.redis.setEx(key, 3600, JSON.stringify(data));

      console.log(`✅ Stored dynamic variables for ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store dynamic variables:', error);
      return false;
    }
  }

  /**
   * Get dynamic variables for personalization
   */
  async getDynamicVariables(phoneNumber, organizationId) {
    try {
      const key = `variables:${organizationId}:${phoneNumber}`;
      const data = await this.redis.get(key);
      
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.variables;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to retrieve dynamic variables:', error);
      return null;
    }
  }

  /**
   * Store conversation transcript entries
   */
  async storeTranscript(conversationId, transcriptEntry) {
    try {
      const key = `transcript:${conversationId}`;
      const entry = {
        ...transcriptEntry,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      };

      // Add to transcript list
      await this.redis.lPush(key, JSON.stringify(entry));
      
      // Keep only last 100 entries
      await this.redis.lTrim(key, 0, 99);
      
      // Set expiration for 48 hours
      await this.redis.expire(key, 172800);

      console.log(`📝 Stored transcript entry for ${conversationId}`);
      return entry.id;
    } catch (error) {
      console.error('❌ Failed to store transcript:', error);
      return null;
    }
  }

  /**
   * Get conversation transcript
   */
  async getTranscript(conversationId, limit = 50) {
    try {
      const key = `transcript:${conversationId}`;
      const entries = await this.redis.lRange(key, 0, limit - 1);

      return entries.map(entry => JSON.parse(entry)).reverse(); // Oldest first
    } catch (error) {
      console.error('❌ Failed to retrieve transcript:', error);
      return [];
    }
  }

  /**
   * Store real-time call metrics
   */
  async storeCallMetrics(conversationId, metrics) {
    try {
      const key = `metrics:${conversationId}`;
      const data = {
        ...metrics,
        timestamp: new Date().toISOString()
      };

      await this.redis.setEx(key, 3600, JSON.stringify(data)); // 1 hour expiration

      console.log(`📊 Stored call metrics for ${conversationId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store call metrics:', error);
      return false;
    }
  }

  /**
   * Get real-time call metrics
   */
  async getCallMetrics(conversationId) {
    try {
      const key = `metrics:${conversationId}`;
      const data = await this.redis.get(key);

      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to retrieve call metrics:', error);
      return null;
    }
  }

  /**
   * Store active conversation mapping for dashboard
   */
  async setActiveConversation(leadId, conversationData) {
    try {
      const key = `active:${leadId}`;
      const data = {
        ...conversationData,
        last_activity: new Date().toISOString()
      };

      await this.redis.setEx(key, 7200, JSON.stringify(data)); // 2 hours

      // Add to active conversations set
      await this.redis.sAdd('active_conversations', leadId);

      console.log(`🔄 Set active conversation for lead ${leadId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to set active conversation:', error);
      return false;
    }
  }

  /**
   * Remove active conversation
   */
  async removeActiveConversation(leadId) {
    try {
      const key = `active:${leadId}`;
      await this.redis.del(key);
      await this.redis.sRem('active_conversations', leadId);

      console.log(`🔄 Removed active conversation for lead ${leadId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to remove active conversation:', error);
      return false;
    }
  }

  /**
   * Get all active conversations for dashboard
   */
  async getActiveConversations() {
    try {
      const activeLeadIds = await this.redis.sMembers('active_conversations');
      const activeConversations = [];

      for (const leadId of activeLeadIds) {
        const key = `active:${leadId}`;
        const data = await this.redis.get(key);
        
        if (data) {
          activeConversations.push({
            lead_id: leadId,
            ...JSON.parse(data)
          });
        } else {
          // Clean up stale references
          await this.redis.sRem('active_conversations', leadId);
        }
      }

      return activeConversations;
    } catch (error) {
      console.error('❌ Failed to get active conversations:', error);
      return [];
    }
  }

  /**
   * Cache customer context for quick lookup
   */
  async cacheCustomerContext(phoneNumber, organizationId, context, ttl = 1800) {
    try {
      const key = `customer:${organizationId}:${phoneNumber}`;
      const data = {
        ...context,
        cached_at: new Date().toISOString()
      };

      await this.redis.setEx(key, ttl, JSON.stringify(data)); // 30 minutes default

      console.log(`💾 Cached customer context for ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to cache customer context:', error);
      return false;
    }
  }

  /**
   * Get cached customer context
   */
  async getCachedCustomerContext(phoneNumber, organizationId) {
    try {
      const key = `customer:${organizationId}:${phoneNumber}`;
      const data = await this.redis.get(key);

      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get cached customer context:', error);
      return null;
    }
  }

  /**
   * Store webhook processing status
   */
  async storeWebhookStatus(webhookId, status, data = {}) {
    try {
      const key = `webhook:${webhookId}`;
      const webhookData = {
        status,
        data,
        processed_at: new Date().toISOString()
      };

      await this.redis.setEx(key, 3600, JSON.stringify(webhookData)); // 1 hour

      console.log(`📡 Stored webhook status: ${webhookId} - ${status}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store webhook status:', error);
      return false;
    }
  }

  /**
   * Get webhook processing status
   */
  async getWebhookStatus(webhookId) {
    try {
      const key = `webhook:${webhookId}`;
      const data = await this.redis.get(key);

      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get webhook status:', error);
      return null;
    }
  }

  /**
   * Store scheduled task for background processing
   */
  async scheduleTask(taskType, taskData, delaySeconds = 0) {
    try {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const scheduledFor = new Date(Date.now() + (delaySeconds * 1000));
      
      const task = {
        id: taskId,
        type: taskType,
        data: taskData,
        scheduled_for: scheduledFor.toISOString(),
        status: 'pending',
        created_at: new Date().toISOString()
      };

      // Store task
      await this.redis.setEx(`task:${taskId}`, 86400, JSON.stringify(task)); // 24 hours

      // Add to scheduled tasks sorted set (score = timestamp)
      await this.redis.zAdd('scheduled_tasks', {
        score: scheduledFor.getTime(),
        value: taskId
      });

      console.log(`⏰ Scheduled task ${taskId} (${taskType}) for ${scheduledFor.toISOString()}`);
      return taskId;
    } catch (error) {
      console.error('❌ Failed to schedule task:', error);
      return null;
    }
  }

  /**
   * Get due tasks for processing
   */
  async getDueTasks(limit = 10) {
    try {
      const now = Date.now();
      const taskIds = await this.redis.zRangeByScore('scheduled_tasks', 0, now, {
        LIMIT: { offset: 0, count: limit }
      });

      const tasks = [];
      for (const taskId of taskIds) {
        const taskData = await this.redis.get(`task:${taskId}`);
        if (taskData) {
          tasks.push(JSON.parse(taskData));
        }
      }

      return tasks;
    } catch (error) {
      console.error('❌ Failed to get due tasks:', error);
      return [];
    }
  }

  /**
   * Mark task as completed and remove from schedule
   */
  async completeTask(taskId) {
    try {
      // Remove from scheduled tasks
      await this.redis.zRem('scheduled_tasks', taskId);
      
      // Update task status
      const taskData = await this.redis.get(`task:${taskId}`);
      if (taskData) {
        const task = JSON.parse(taskData);
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        
        await this.redis.setEx(`task:${taskId}`, 3600, JSON.stringify(task)); // Keep for 1 hour
      }

      console.log(`✅ Completed task ${taskId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to complete task:', error);
      return false;
    }
  }

  /**
   * Store rate limiting data
   */
  async checkRateLimit(key, limit, windowSeconds) {
    try {
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Remove old entries
      await this.redis.zRemRangeByScore(key, 0, windowStart);

      // Count current entries
      const currentCount = await this.redis.zCard(key);

      if (currentCount >= limit) {
        return {
          allowed: false,
          current: currentCount,
          limit: limit,
          resetTime: windowStart + (windowSeconds * 1000)
        };
      }

      // Add current request
      await this.redis.zAdd(key, { score: now, value: now.toString() });
      await this.redis.expire(key, windowSeconds);

      return {
        allowed: true,
        current: currentCount + 1,
        limit: limit,
        remaining: limit - currentCount - 1
      };
    } catch (error) {
      console.error('❌ Rate limit check failed:', error);
      // Allow request on error to prevent service disruption
      return { allowed: true, current: 0, limit: limit };
    }
  }

  /**
   * Health check method
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      await this.redis.ping();
      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        latency: latency,
        connected: this.redis.isReady
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async disconnect() {
    try {
      await this.redis.quit();
      console.log('✅ Redis connection closed gracefully');
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error);
    }
  }
}

module.exports = { ConversationStateManager };