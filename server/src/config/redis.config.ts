import { Redis, RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Redis Configuration and Connection Management
 * Handles connection to Redis with retry logic and health checks
 */
export class RedisConfig {
  private static instance: Redis | null = null;
  private static retryAttempts = 0;
  private static maxRetries = 3;
  private static retryDelay = 2000; // 2 seconds

  /**
   * Get Redis connection configuration
   */
  private static getRedisOptions(): RedisOptions {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not configured');
    }

    // Parse Redis URL to get connection details
    const url = new URL(redisUrl);
    
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      db: parseInt(url.pathname.slice(1)) || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      // Connection keepalive
      keepAlive: 30000,
      // Retry strategy
      retryStrategy: (times: number) => {
        if (times > this.maxRetries) {
          logger.error(`Redis connection failed after ${this.maxRetries} attempts`);
          return null; // Stop retrying
        }
        const delay = Math.min(times * this.retryDelay, 10000);
        logger.warn(`Redis connection attempt ${times}, retrying in ${delay}ms`);
        return delay;
      }
    };
  }

  /**
   * Get or create Redis connection
   */
  public static async getConnection(): Promise<Redis | null> {
    // Check if Redis is enabled
    if (process.env.REDIS_ENABLED === 'false') {
      logger.info('Redis is disabled via REDIS_ENABLED=false');
      return null;
    }

    if (this.instance) {
      // Check if existing connection is still alive
      try {
        await this.instance.ping();
        return this.instance;
      } catch (error) {
        logger.warn('Existing Redis connection is dead, creating new one');
        this.instance = null;
      }
    }

    try {
      const options = this.getRedisOptions();
      this.instance = new Redis(options);

      // Set up event handlers
      this.instance.on('connect', () => {
        logger.info('Redis connected successfully');
        this.retryAttempts = 0;
      });

      this.instance.on('error', (error) => {
        logger.error('Redis connection error:', error);
      });

      this.instance.on('close', () => {
        logger.warn('Redis connection closed');
      });

      this.instance.on('reconnecting', () => {
        this.retryAttempts++;
        logger.info(`Redis reconnecting... (attempt ${this.retryAttempts})`);
      });

      // Test the connection
      await this.instance.connect();
      await this.instance.ping();
      
      logger.info('Redis connection established and tested');
      return this.instance;

    } catch (error) {
      logger.error('Failed to create Redis connection:', error);
      this.instance = null;
      return null;
    }
  }

  /**
   * Health check for Redis connection
   */
  public static async healthCheck(): Promise<{ status: string; latency?: number; error?: string }> {
    try {
      const connection = await this.getConnection();
      
      if (!connection) {
        return { status: 'disabled' };
      }

      const start = Date.now();
      await connection.ping();
      const latency = Date.now() - start;

      return { 
        status: 'healthy', 
        latency 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: (error as Error).message 
      };
    }
  }

  /**
   * Close Redis connection gracefully
   */
  public static async closeConnection(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.quit();
        logger.info('Redis connection closed gracefully');
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
        // Force disconnect if quit fails
        this.instance.disconnect();
      }
      this.instance = null;
    }
  }

  /**
   * Get connection instance (for direct access if needed)
   */
  public static getInstance(): Redis | null {
    return this.instance;
  }
}

// Export Redis connection getter for convenience
export const getRedisConnection = () => RedisConfig.getConnection();
export const redisHealthCheck = () => RedisConfig.healthCheck();
export const closeRedisConnection = () => RedisConfig.closeConnection();