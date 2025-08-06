/**
 * Rate Limiting Configuration
 * Different rate limits for different endpoint types
 */

const rateLimit = require('express-rate-limit');
const { Redis } = require('@upstash/redis');

class RateLimitConfig {
  constructor() {
    this.redis = null;
    
    // Initialize Redis if available for distributed rate limiting
    if (process.env.UPSTASH_REDIS_URL) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_URL,
        token: process.env.UPSTASH_REDIS_TOKEN
      });
    }
  }
  
  /**
   * Create rate limit store
   */
  createStore() {
    if (this.redis) {
      // Use Redis store for distributed rate limiting
      const RedisStore = require('rate-limit-redis');
      return new RedisStore({
        client: this.redis,
        prefix: 'rl:',
        resetExpiryOnChange: true
      });
    }
    
    // Use memory store for single instance
    return new rateLimit.MemoryStore();
  }
  
  /**
   * General API rate limiting
   */
  get general() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // 1000 requests per window
      message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60 // seconds
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise IP
        return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
      },
      skip: (req) => {
        // Skip rate limiting in development
        return process.env.NODE_ENV === 'development';
      }
    });
  }
  
  /**
   * Authentication endpoints rate limiting
   */
  get auth() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `auth:${req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Webhook endpoints rate limiting
   */
  get webhooks() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 webhooks per minute
      message: {
        success: false,
        error: 'Webhook rate limit exceeded',
        code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => {
        // Use webhook source if identifiable
        const source = this.identifyWebhookSource(req);
        return `webhook:${source}:${req.ip}`;
      },
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * File upload rate limiting
   */
  get uploads() {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // 50 uploads per hour
      message: {
        success: false,
        error: 'Upload rate limit exceeded',
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
        retryAfter: 60 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `upload:${req.user ? req.user.id : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * SMS/Email sending rate limiting
   */
  get communications() {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100, // 100 messages per hour
      message: {
        success: false,
        error: 'Communication rate limit exceeded',
        code: 'COMMUNICATION_RATE_LIMIT_EXCEEDED',
        retryAfter: 60 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `comm:${req.user ? req.user.organizationId : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * AI/ML API calls rate limiting
   */
  get aiCalls() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // 30 AI calls per minute
      message: {
        success: false,
        error: 'AI service rate limit exceeded',
        code: 'AI_RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `ai:${req.user ? req.user.organizationId : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Heavy operations rate limiting (analytics, exports, etc.)
   */
  get heavyOperations() {
    return rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 5, // 5 heavy operations per 5 minutes
      message: {
        success: false,
        error: 'Heavy operation rate limit exceeded',
        code: 'HEAVY_OPERATION_RATE_LIMIT_EXCEEDED',
        retryAfter: 5 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `heavy:${req.user ? req.user.organizationId : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Admin operations rate limiting
   */
  get admin() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // 200 admin operations per window
      message: {
        success: false,
        error: 'Admin operation rate limit exceeded',
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `admin:${req.user ? req.user.id : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Public endpoints rate limiting (no auth required)
   */
  get public() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window for public endpoints
      message: {
        success: false,
        error: 'Public endpoint rate limit exceeded',
        code: 'PUBLIC_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `public:${req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Dynamic rate limiting based on user tier/plan
   */
  createDynamicRateLimit(getMaxRequests) {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req) => {
        if (typeof getMaxRequests === 'function') {
          return getMaxRequests(req);
        }
        return getMaxRequests || 100;
      },
      message: (req) => ({
        success: false,
        error: 'Rate limit exceeded for your plan',
        code: 'PLAN_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60,
        currentPlan: req.user?.plan || 'free'
      }),
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      keyGenerator: (req) => `dynamic:${req.user ? req.user.id : req.ip}`,
      skip: (req) => process.env.NODE_ENV === 'development'
    });
  }
  
  /**
   * Identify webhook source from headers/path
   */
  identifyWebhookSource(req) {
    const path = req.path.toLowerCase();
    
    if (path.includes('elevenlabs')) return 'elevenlabs';
    if (path.includes('twilio')) return 'twilio';
    if (path.includes('shopify')) return 'shopify';
    if (path.includes('hubspot')) return 'hubspot';
    if (path.includes('stripe')) return 'stripe';
    if (path.includes('calendar')) return 'calendar';
    
    return 'unknown';
  }
  
  /**
   * Create custom rate limiter with specific options
   */
  createCustom(options) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore(),
      skip: (req) => process.env.NODE_ENV === 'development'
    };
    
    return rateLimit({
      ...defaultOptions,
      ...options
    });
  }
  
  /**
   * Bypass rate limiting for trusted IPs/users
   */
  createTrustedBypass(trustedIPs = [], trustedUserIds = []) {
    return (req, res, next) => {
      // Skip rate limiting for trusted IPs
      if (trustedIPs.includes(req.ip)) {
        return next();
      }
      
      // Skip rate limiting for trusted users
      if (req.user && trustedUserIds.includes(req.user.id)) {
        return next();
      }
      
      // Skip rate limiting for admin users
      if (req.user && req.user.role === 'admin') {
        return next();
      }
      
      // Apply rate limiting
      return this.general(req, res, next);
    };
  }
}

// Create singleton instance
const rateLimitConfig = new RateLimitConfig();

module.exports = rateLimitConfig;