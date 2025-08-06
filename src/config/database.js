const { createClient } = require('@supabase/supabase-js');
const Redis = require('redis');

class DatabaseConfig {
  constructor() {
    this.supabase = null;
    this.redis = null;
    this.initialize();
  }

  initialize() {
    // Initialize Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Initialize Redis (Upstash)
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Setup Redis event handlers
    this.redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    this.redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });
  }

  getSupabase() {
    return this.supabase;
  }

  getRedis() {
    return this.redis;
  }

  async testConnections() {
    try {
      // Test Supabase connection
      const { data, error } = await this.supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      // Test Redis connection
      await this.redis.ping();

      console.log('✅ All database connections successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
  }

  async closeConnections() {
    try {
      if (this.redis) {
        await this.redis.quit();
      }
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('❌ Error closing database connections:', error);
    }
  }
}

module.exports = new DatabaseConfig();