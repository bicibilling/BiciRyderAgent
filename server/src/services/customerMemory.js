// Customer Memory & Context System for Lightning-Fast Agent Context
const moment = require('moment-timezone');

class CustomerMemoryService {
  constructor() {
    // SCALABLE ZERO-LATENCY ARCHITECTURE
    // Primary: LRU Cache (0ms access) - keeps 1000 most recent customers
    this.customerProfiles = new Map(); // LRU cache for hot customers
    this.conversationHistory = new Map();
    
    // Configuration
    this.maxCacheSize = 1000; // Keep 1000 customers in memory
    this.accessOrder = []; // Track access order for LRU eviction
    
    // Redis will be added for persistence (async only - no latency impact)
    this.redisClient = null; // Will be initialized if Redis available
    
    console.log('🧠 CustomerMemory initialized with LRU cache (max:', this.maxCacheSize, 'customers)');
  }

  // Store conversation summary with LRU management (post-call webhook)
  storeConversationSummary(callerPhone, conversationData) {
    const customerId = this.normalizePhoneNumber(callerPhone);
    
    // Update LRU access order (0ms operation)
    this.updateAccessOrder(customerId);
    
    // Get or create profile (existing logic - don't break!)
    const profile = this.customerProfiles.get(customerId) || {
      phone: callerPhone,
      first_seen: new Date().toISOString(),
      conversation_count: 0,
      preferences: {},
      purchase_history: [],
      sentiment_history: [],
      last_interaction: null
    };

    profile.conversation_count += 1;
    profile.last_interaction = new Date().toISOString();
    
    // Extract customer insights from conversation (existing logic)
    const insights = this.extractInsights(conversationData);
    
    // Update preferences based on conversation (existing logic)
    if (insights.bike_interest) {
      profile.preferences.bike_type = insights.bike_interest;
    }
    if (insights.budget) {
      profile.preferences.budget_range = insights.budget;
    }
    if (insights.experience_level) {
      profile.preferences.experience = insights.experience_level;
    }
    if (insights.communication_style) {
      profile.preferences.communication_style = insights.communication_style;
    }

    // Track sentiment over time (existing logic)
    profile.sentiment_history.push({
      sentiment: insights.sentiment,
      date: new Date().toISOString(),
      conversation_id: conversationData.conversation_id
    });

    // Store conversation summary (existing logic)
    this.conversationHistory.set(conversationData.conversation_id, {
      customer_id: customerId,
      conversation_id: conversationData.conversation_id,
      date: new Date().toISOString(),
      duration_seconds: conversationData.duration_seconds,
      summary: conversationData.summary,
      outcome: conversationData.outcome,
      next_actions: insights.suggested_actions || [],
      transcript_summary: conversationData.transcript_summary
    });

    // Update memory cache
    this.customerProfiles.set(customerId, profile);
    
    // Background save to Redis (async - no latency)
    this.saveToRedisAsync(customerId, profile);
    
    console.log('📝 Customer profile updated in LRU cache:', customerId, profile.conversation_count, 'conversations');
    return profile;
  }

  // ZERO-LATENCY customer context retrieval with LRU management
  getCustomerContext(callerPhone) {
    const customerId = this.normalizePhoneNumber(callerPhone);
    
    // UPDATE LRU ACCESS ORDER (0ms impact)
    this.updateAccessOrder(customerId);
    
    const profile = this.customerProfiles.get(customerId);
    
    // CACHE MISS - still zero latency!
    if (!profile) {
      // Background task: try to load from Redis (no latency impact)
      this.loadFromRedisAsync(customerId);
    }
    
    if (!profile) {
      // First-time caller
      return {
        customer_tier: 'new',
        customer_name: 'New Customer',
        conversation_count: 0,
        previous_context: 'First time calling Bici',
        preferred_communication: 'friendly and informative',
        bike_interest: 'unknown',
        last_conversation: 'none'
      };
    }

    // Returning customer - build rich context
    const recentConversations = Array.from(this.conversationHistory.values())
      .filter(conv => conv.customer_id === customerId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3); // Last 3 conversations

    const lastConversation = recentConversations[0];
    const daysSinceLastCall = lastConversation ? 
      moment().diff(moment(lastConversation.date), 'days') : 0;

    // Determine customer tier
    let tier = 'returning';
    if (profile.conversation_count >= 5) tier = 'frequent';
    if (profile.purchase_history?.length > 0) tier = 'customer';
    if (profile.conversation_count >= 10) tier = 'vip';

    // Build context summary
    let contextSummary = `Returning customer (${profile.conversation_count} previous calls)`;
    if (lastConversation) {
      contextSummary += `. Last call ${daysSinceLastCall} days ago about: ${lastConversation.summary}`;
    }

    // Determine communication preference
    const avgSentiment = this.getAverageSentiment(profile.sentiment_history);
    let communicationStyle = 'professional and helpful';
    if (avgSentiment > 0.7) communicationStyle = 'enthusiastic and positive';
    if (avgSentiment < 0.3) communicationStyle = 'careful and empathetic';

    return {
      customer_tier: tier,
      customer_name: profile.name || 'Valued Customer',
      conversation_count: profile.conversation_count,
      previous_context: contextSummary,
      preferred_communication: communicationStyle,
      bike_interest: profile.preferences.bike_type || 'exploring options',
      budget_range: profile.preferences.budget_range || 'not specified',
      experience_level: profile.preferences.experience || 'unknown',
      last_conversation: lastConversation?.summary || 'none',
      days_since_last_call: daysSinceLastCall,
      customer_sentiment: avgSentiment > 0.6 ? 'positive' : avgSentiment < 0.4 ? 'needs_attention' : 'neutral',
      suggested_approach: this.suggestApproach(profile, recentConversations)
    };
  }

  // Extract insights from conversation transcript/summary
  extractInsights(conversationData) {
    const transcript = conversationData.transcript || '';
    const summary = conversationData.summary || '';
    const fullText = (transcript + ' ' + summary).toLowerCase();

    const insights = {
      sentiment: 0.5, // Default neutral
      bike_interest: null,
      budget: null,
      experience_level: null,
      communication_style: 'standard',
      suggested_actions: []
    };

    // Bike interest detection
    if (fullText.includes('mountain') || fullText.includes('mtb')) {
      insights.bike_interest = 'mountain';
    } else if (fullText.includes('road') || fullText.includes('racing')) {
      insights.bike_interest = 'road';
    } else if (fullText.includes('electric') || fullText.includes('e-bike')) {
      insights.bike_interest = 'electric';
    } else if (fullText.includes('gravel')) {
      insights.bike_interest = 'gravel';
    }

    // Budget detection
    const budgetMatch = fullText.match(/\$?\d{1,2},?\d{3}/);
    if (budgetMatch) {
      insights.budget = budgetMatch[0];
    } else if (fullText.includes('budget')) {
      insights.budget = 'budget-conscious';
    }

    // Experience level
    if (fullText.includes('beginner') || fullText.includes('new to')) {
      insights.experience_level = 'beginner';
    } else if (fullText.includes('experienced') || fullText.includes('advanced')) {
      insights.experience_level = 'experienced';
    }

    // Sentiment analysis (simple keyword-based)
    let sentimentScore = 0.5;
    if (fullText.includes('great') || fullText.includes('excellent') || fullText.includes('amazing')) {
      sentimentScore += 0.3;
    }
    if (fullText.includes('frustrated') || fullText.includes('angry') || fullText.includes('terrible')) {
      sentimentScore -= 0.3;
    }
    if (fullText.includes('thank') || fullText.includes('helpful')) {
      sentimentScore += 0.2;
    }
    
    insights.sentiment = Math.max(0, Math.min(1, sentimentScore));

    // Communication style
    if (fullText.includes('technical') || fullText.includes('specs')) {
      insights.communication_style = 'technical';
    } else if (fullText.includes('simple') || fullText.includes('basic')) {
      insights.communication_style = 'simple';
    }

    return insights;
  }

  // Get average sentiment from history
  getAverageSentiment(sentimentHistory) {
    if (!sentimentHistory || sentimentHistory.length === 0) return 0.5;
    
    const recentSentiments = sentimentHistory.slice(-5); // Last 5 interactions
    const avg = recentSentiments.reduce((sum, s) => sum + s.sentiment, 0) / recentSentiments.length;
    return avg;
  }

  // Suggest approach based on customer profile
  suggestApproach(profile, recentConversations) {
    const suggestions = [];
    
    if (profile.conversation_count === 1) {
      suggestions.push('Second-time caller - acknowledge previous conversation');
    }
    
    if (profile.conversation_count >= 3) {
      suggestions.push('Frequent caller - provide personalized service');
    }
    
    if (profile.preferences.bike_type) {
      suggestions.push(`Customer interested in ${profile.preferences.bike_type} bikes`);
    }
    
    const lastConv = recentConversations[0];
    if (lastConv && lastConv.next_actions?.length > 0) {
      suggestions.push(`Follow up on: ${lastConv.next_actions.join(', ')}`);
    }

    return suggestions.join('. ');
  }

  // Normalize phone number for consistent lookup
  normalizePhoneNumber(phone) {
    if (!phone) return 'unknown';
    
    // Remove all non-digits and normalize to E.164 format
    const digits = phone.replace(/\D/g, '');
    
    // Add +1 for North American numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return phone; // Return as-is if can't normalize
  }

  // Get customer profile for admin/dashboard
  getCustomerProfile(customerId) {
    return this.customerProfiles.get(customerId);
  }

  // Get all customer profiles (for dashboard analytics)
  getAllCustomers() {
    return Array.from(this.customerProfiles.entries()).map(([id, profile]) => ({
      customer_id: id,
      ...profile
    }));
  }

  // LRU CACHE MANAGEMENT (zero latency)
  updateAccessOrder(customerId) {
    // Remove from current position
    const index = this.accessOrder.indexOf(customerId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    // Add to front (most recently used)
    this.accessOrder.unshift(customerId);
    
    // Evict least recently used if cache is full
    if (this.accessOrder.length > this.maxCacheSize) {
      const evictId = this.accessOrder.pop();
      const evictedProfile = this.customerProfiles.get(evictId);
      
      // Save to Redis before evicting (async - no latency)
      if (evictedProfile) {
        this.saveToRedisAsync(evictId, evictedProfile);
        this.customerProfiles.delete(evictId);
        console.log('💾 LRU evicted customer to Redis:', evictId);
      }
    }
  }

  // ASYNC REDIS OPERATIONS (no latency impact on conversation start)
  // Background Redis operations with retry logic (zero latency impact)
  loadFromRedisAsync(customerId) {
    // Background task - loads customer from Redis if available
    if (!this.redisClient) return;
    
    // Immediate async execution - no conversation latency
    setTimeout(async () => {
      try {
        const profile = await this.getRedisDataWithRetry(`customer:${customerId}`);
        if (profile) {
          this.customerProfiles.set(customerId, profile);
          this.updateAccessOrder(customerId);
          console.log('🔄 Background loaded customer from Redis:', customerId);
        }
      } catch (error) {
        console.log('⚠️ Redis background load failed:', error.message);
      }
    }, 0);
  }

  saveToRedisAsync(customerId, profile) {
    // Background save with retry logic - no latency impact
    if (!this.redisClient) return;
    
    setTimeout(async () => {
      const success = await this.setRedisDataWithRetry(`customer:${customerId}`, profile);
      if (success) {
        console.log('💾 Background saved customer to Redis:', customerId);
      }
    }, 0);
  }

  // Initialize Redis following ElevenLabs best practices (graceful degradation)
  async initializeRedis() {
    try {
      const { createClient } = require('redis');
      
      if (process.env.REDIS_URL) {
        this.redisClient = createClient({
          url: process.env.REDIS_URL,
          socket: {
            connectTimeout: 5000,
            commandTimeout: 5000
          }
        });
        
        this.redisClient.on('error', (err) => {
          console.log('⚠️ Redis connection error (graceful degradation):', err.message);
          this.redisClient = null; // Disable Redis if connection fails
        });
        
        this.redisClient.on('connect', () => {
          console.log('📦 Redis connected for persistent customer memory');
        });
        
        // Connect to Redis
        await this.redisClient.connect();
        
        console.log('🚀 Redis initialized successfully for zero-latency persistence');
      } else {
        console.log('📦 REDIS_URL not provided - using memory-only mode (data lost on restart)');
      }
    } catch (error) {
      console.log('📦 Redis initialization failed - using memory-only mode:', error.message);
      this.redisClient = null;
    }
  }

  // Redis operations with retry logic (following ElevenLabs pattern)
  async getRedisDataWithRetry(key, maxRetries = 3) {
    if (!this.redisClient) return null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await this.redisClient.get(key);
        return data ? JSON.parse(data) : null;
      } catch (error) {
        if (attempt === maxRetries) {
          console.log('⚠️ Redis get failed after retries:', error.message);
          return null;
        }
        console.log(`📦 Redis get attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
      }
    }
    return null;
  }

  async setRedisDataWithRetry(key, data, ttl = 86400 * 90, maxRetries = 3) {
    if (!this.redisClient) return false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.redisClient.setEx(key, ttl, JSON.stringify(data));
        return true;
      } catch (error) {
        if (attempt === maxRetries) {
          console.log('⚠️ Redis set failed after retries:', error.message);
          return false;
        }
        console.log(`📦 Redis set attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
    return false;
  }

  // Enhanced store method with LRU management
  storeConversationSummary(callerPhone, conversationData) {
    const customerId = this.normalizePhoneNumber(callerPhone);
    
    // Update LRU access order
    this.updateAccessOrder(customerId);
    
    // Get or create profile (existing logic - don't break!)
    const profile = this.customerProfiles.get(customerId) || {
      phone: callerPhone,
      first_seen: new Date().toISOString(),
      conversation_count: 0,
      preferences: {},
      purchase_history: [],
      sentiment_history: [],
      last_interaction: null
    };

    profile.conversation_count += 1;
    profile.last_interaction = new Date().toISOString();
    
    // Extract customer insights from conversation (existing logic)
    const insights = this.extractInsights(conversationData);
    
    // Update preferences based on conversation (existing logic)
    if (insights.bike_interest) {
      profile.preferences.bike_type = insights.bike_interest;
    }
    if (insights.budget) {
      profile.preferences.budget_range = insights.budget;
    }
    if (insights.experience_level) {
      profile.preferences.experience = insights.experience_level;
    }
    if (insights.communication_style) {
      profile.preferences.communication_style = insights.communication_style;
    }

    // Track sentiment over time (existing logic)
    profile.sentiment_history.push({
      sentiment: insights.sentiment,
      date: new Date().toISOString(),
      conversation_id: conversationData.conversation_id
    });

    // Store conversation summary (existing logic)
    this.conversationHistory.set(conversationData.conversation_id, {
      customer_id: customerId,
      conversation_id: conversationData.conversation_id,
      date: new Date().toISOString(),
      duration_seconds: conversationData.duration_seconds,
      summary: conversationData.summary,
      outcome: conversationData.outcome,
      next_actions: insights.suggested_actions || [],
      transcript_summary: conversationData.transcript_summary
    });

    // Update memory cache
    this.customerProfiles.set(customerId, profile);
    
    // Background save to Redis (async - no latency)
    this.saveToRedisAsync(customerId, profile);
    
    console.log('📝 Customer profile updated in LRU cache:', customerId, profile.conversation_count, 'conversations');
    return profile;
  }

  // Clear old data (privacy compliance)
  cleanupOldData(daysToKeep = 90) {
    const cutoffDate = moment().subtract(daysToKeep, 'days');
    
    for (const [customerId, profile] of this.customerProfiles.entries()) {
      if (moment(profile.last_interaction).isBefore(cutoffDate)) {
        this.customerProfiles.delete(customerId);
        console.log('🗑️ Cleaned up old customer data:', customerId);
      }
    }
  }
}

module.exports = new CustomerMemoryService();