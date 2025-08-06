/**
 * Database Service
 * Supabase integration with connection pooling and query helpers
 */

const { createClient } = require('@supabase/supabase-js');
const { EventEmitter } = require('events');

class DatabaseService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.connectionPool = new Map();
    this.queryCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.retryAttempts = 3;
  }
  
  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.warn('⚠️  Supabase credentials not provided, database features will be limited');
        return false;
      }
      
      this.client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: false
          },
          db: {
            schema: 'public'
          },
          global: {
            headers: {
              'x-application': 'bici-ai-system'
            }
          }
        }
      );
      
      // Test connection
      const { data, error } = await this.client
        .from('organizations')
        .select('id', { count: 'exact', head: true });
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = table not found (expected in fresh install)
        throw error;
      }
      
      this.isConnected = true;
      console.log('✅ Database service initialized');
      this.emit('connected');
      
      return true;
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      this.isConnected = false;
      this.emit('error', error);
      return false;
    }
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    if (!this.client) {
      throw new Error('Database not initialized');
    }
    
    try {
      const { data, error } = await this.client
        .from('organizations')
        .select('id', { count: 'exact', head: true });
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return { status: 'healthy', timestamp: new Date().toISOString() };
      
    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }
  
  /**
   * Generic query with retry logic
   */
  async query(tableName, operation, params = {}, options = {}) {
    if (!this.client) {
      throw new Error('Database not initialized');
    }
    
    const { useCache = false, cacheKey, retry = true } = options;
    
    // Check cache first
    if (useCache && cacheKey) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    let attempt = 0;
    while (attempt < this.retryAttempts) {
      try {
        let query = this.client.from(tableName);
        
        // Apply operation
        switch (operation) {
          case 'select':
            query = query.select(params.columns || '*');
            break;
          case 'insert':
            query = query.insert(params.data);
            break;
          case 'update':
            query = query.update(params.data);
            break;
          case 'delete':
            query = query.delete();
            break;
          case 'upsert':
            query = query.upsert(params.data);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
        
        // Apply filters
        if (params.filters) {
          for (const [column, value] of Object.entries(params.filters)) {
            if (typeof value === 'object' && value.operator) {
              query = query.filter(column, value.operator, value.value);
            } else {
              query = query.eq(column, value);
            }
          }
        }
        
        // Apply ordering
        if (params.orderBy) {
          query = query.order(params.orderBy.column, { 
            ascending: params.orderBy.ascending !== false 
          });
        }
        
        // Apply pagination
        if (params.pagination) {
          const { offset, limit } = params.pagination;
          query = query.range(offset, offset + limit - 1);
        }
        
        // Execute query
        const { data, error, count } = await query;
        
        if (error) {
          throw error;
        }
        
        const result = { data, count };
        
        // Cache result if requested
        if (useCache && cacheKey) {
          this.setCache(cacheKey, result);
        }
        
        return result;
        
      } catch (error) {
        attempt++;
        
        if (attempt >= this.retryAttempts || !retry) {
          console.error(`❌ Database query failed after ${attempt} attempts:`, error.message);
          throw error;
        }
        
        console.warn(`⚠️  Database query attempt ${attempt} failed, retrying...`);
        await this.delay(1000 * attempt); // Exponential backoff
      }
    }
  }
  
  /**
   * Organization management
   */
  async getOrganization(organizationId) {
    const result = await this.query('organizations', 'select', {
      filters: { id: organizationId }
    }, {
      useCache: true,
      cacheKey: `org:${organizationId}`
    });
    
    return result.data?.[0] || null;
  }
  
  async createOrganization(orgData) {
    const result = await this.query('organizations', 'insert', {
      data: {
        ...orgData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    
    // Clear cache
    this.clearCachePattern('org:*');
    
    return result.data?.[0];
  }
  
  async updateOrganization(organizationId, updates) {
    const result = await this.query('organizations', 'update', {
      data: {
        ...updates,
        updated_at: new Date().toISOString()
      },
      filters: { id: organizationId }
    });
    
    // Clear cache
    this.clearCache(`org:${organizationId}`);
    
    return result.data?.[0];
  }
  
  /**
   * Lead management
   */
  async getLeads(organizationId, filters = {}, pagination = null) {
    const queryFilters = {
      organization_id: organizationId,
      ...filters
    };
    
    return await this.query('leads', 'select', {
      filters: queryFilters,
      orderBy: { column: 'created_at', ascending: false },
      pagination
    });
  }
  
  async getLead(leadId) {
    const result = await this.query('leads', 'select', {
      filters: { id: leadId }
    }, {
      useCache: true,
      cacheKey: `lead:${leadId}`
    });
    
    return result.data?.[0] || null;
  }
  
  async createLead(leadData) {
    const leadId = this.generateLeadId(leadData.organization_id, leadData.phone_number_normalized);
    
    const result = await this.query('leads', 'upsert', {
      data: {
        id: leadId,
        ...leadData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    
    return result.data?.[0];
  }
  
  async updateLead(leadId, updates) {
    const result = await this.query('leads', 'update', {
      data: {
        ...updates,
        updated_at: new Date().toISOString()
      },
      filters: { id: leadId }
    });
    
    // Clear cache
    this.clearCache(`lead:${leadId}`);
    
    return result.data?.[0];
  }
  
  /**
   * Conversation management
   */
  async getConversations(organizationId, filters = {}, pagination = null) {
    const queryFilters = {
      organization_id: organizationId,
      ...filters
    };
    
    return await this.query('conversations', 'select', {
      filters: queryFilters,
      orderBy: { column: 'timestamp', ascending: false },
      pagination
    });
  }
  
  async getConversation(conversationId) {
    const result = await this.query('conversations', 'select', {
      filters: { id: conversationId }
    });
    
    return result.data?.[0] || null;
  }
  
  async createConversation(conversationData) {
    const result = await this.query('conversations', 'insert', {
      data: {
        id: conversationData.id || this.generateConversationId(),
        ...conversationData,
        timestamp: conversationData.timestamp || new Date().toISOString()
      }
    });
    
    return result.data?.[0];
  }
  
  async updateConversation(conversationId, updates) {
    const result = await this.query('conversations', 'update', {
      data: updates,
      filters: { id: conversationId }
    });
    
    return result.data?.[0];
  }
  
  /**
   * User management
   */
  async getUsers(organizationId) {
    return await this.query('users', 'select', {
      filters: { organization_id: organizationId }
    }, {
      useCache: true,
      cacheKey: `users:${organizationId}`
    });
  }
  
  async getUser(userId) {
    const result = await this.query('users', 'select', {
      filters: { id: userId }
    }, {
      useCache: true,
      cacheKey: `user:${userId}`
    });
    
    return result.data?.[0] || null;
  }
  
  async createUser(userData) {
    const result = await this.query('users', 'insert', {
      data: {
        id: userData.id || this.generateUserId(),
        ...userData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    
    // Clear cache
    this.clearCachePattern(`users:${userData.organization_id}`);
    
    return result.data?.[0];
  }
  
  /**
   * Analytics queries
   */
  async getAnalytics(organizationId, timeframe = '24h') {
    const timeFilter = this.getTimeFilter(timeframe);
    
    // Get call metrics
    const callMetrics = await this.query('conversations', 'select', {
      columns: 'id, duration, outcome, sentiment, timestamp',
      filters: {
        organization_id: organizationId,
        timestamp: { operator: 'gte', value: timeFilter }
      }
    });
    
    // Get lead metrics
    const leadMetrics = await this.query('leads', 'select', {
      columns: 'id, lead_status, lead_quality_score, created_at',
      filters: {
        organization_id: organizationId,
        created_at: { operator: 'gte', value: timeFilter }
      }
    });
    
    return {
      calls: this.processCallMetrics(callMetrics.data || []),
      leads: this.processLeadMetrics(leadMetrics.data || []),
      timeframe,
      generated_at: new Date().toISOString()
    };
  }
  
  /**
   * Real-time subscription helpers
   */
  subscribeToConversations(organizationId, callback) {
    if (!this.client) return null;
    
    return this.client
      .channel(`conversations:${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `organization_id=eq.${organizationId}`
      }, callback)
      .subscribe();
  }
  
  subscribeToLeads(organizationId, callback) {
    if (!this.client) return null;
    
    return this.client
      .channel(`leads:${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: `organization_id=eq.${organizationId}`
      }, callback)
      .subscribe();
  }
  
  /**
   * Batch operations
   */
  async batchInsert(tableName, records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { data: [], count: 0 };
    }
    
    const batchSize = 100;
    const results = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const result = await this.query(tableName, 'insert', { data: batch });
      results.push(...(result.data || []));
    }
    
    return { data: results, count: results.length };
  }
  
  /**
   * Cache management
   */
  setCache(key, value) {
    this.queryCache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    // Set cleanup timeout
    setTimeout(() => {
      this.clearCache(key);
    }, this.cacheTimeout);
  }
  
  getFromCache(key) {
    const cached = this.queryCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.queryCache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  clearCache(key) {
    this.queryCache.delete(key);
  }
  
  clearCachePattern(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.queryCache.keys()) {
      if (regex.test(key)) {
        this.queryCache.delete(key);
      }
    }
  }
  
  /**
   * Utility functions
   */
  generateLeadId(organizationId, phoneNumber) {
    const timestamp = Date.now();
    const phone = phoneNumber.replace(/\D/g, '');
    return `lead_${organizationId.slice(-8)}_${phone.slice(-10)}_${timestamp}`;
  }
  
  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getTimeFilter(timeframe) {
    const now = new Date();
    
    switch (timeframe) {
      case '1h':
        return new Date(now - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      case '90d':
        return new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    }
  }
  
  processCallMetrics(conversations) {
    const total = conversations.length;
    const completed = conversations.filter(c => c.outcome === 'completed').length;
    const avgDuration = conversations.reduce((sum, c) => sum + (c.duration || 0), 0) / total || 0;
    
    return {
      total,
      completed,
      completion_rate: total > 0 ? (completed / total) * 100 : 0,
      avg_duration: Math.round(avgDuration),
      sentiment_distribution: this.calculateSentimentDistribution(conversations)
    };
  }
  
  processLeadMetrics(leads) {
    const total = leads.length;
    const qualified = leads.filter(l => l.lead_quality_score >= 70).length;
    const avgScore = leads.reduce((sum, l) => sum + (l.lead_quality_score || 0), 0) / total || 0;
    
    return {
      total,
      qualified,
      qualification_rate: total > 0 ? (qualified / total) * 100 : 0,
      avg_quality_score: Math.round(avgScore)
    };
  }
  
  calculateSentimentDistribution(conversations) {
    const distribution = { positive: 0, neutral: 0, negative: 0 };
    
    conversations.forEach(conv => {
      const sentiment = conv.sentiment || 'neutral';
      distribution[sentiment] = (distribution[sentiment] || 0) + 1;
    });
    
    const total = conversations.length;
    if (total > 0) {
      Object.keys(distribution).forEach(key => {
        distribution[key] = Math.round((distribution[key] / total) * 100);
      });
    }
    
    return distribution;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Close database connections
   */
  async close() {
    if (this.client) {
      // Supabase client doesn't have explicit close method
      this.client = null;
    }
    
    this.queryCache.clear();
    this.isConnected = false;
    
    console.log('📊 Database service closed');
  }
  
  /**
   * Test database connections
   */
  async testConnections() {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = DatabaseService;