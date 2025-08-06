/**
 * Production Security Middleware
 * Enhanced security configuration for production deployment
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import cors from 'cors';
import { logger } from '../config/logger.js';

export class ProductionSecurity {
  constructor() {
    this.logger = logger.child({ component: 'security' });
  }

  /**
   * Configure comprehensive CORS settings
   */
  configureCORS() {
    const allowedOrigins = [
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL,
      'https://bici-ai-frontend.onrender.com',
      'https://bici-ai.yourdomain.com',
      ...(process.env.ALLOWED_ORIGINS?.split(',') || [])
    ].filter(Boolean);

    // Add localhost for development
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000');
    }

    this.logger.info('CORS configured for origins:', allowedOrigins);

    return cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Log rejected origin
        this.logger.warn('CORS blocked origin:', origin);
        return callback(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Organization-ID'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ],
      maxAge: 86400 // 24 hours
    });
  }

  /**
   * Configure security headers with Helmet
   */
  configureSecurityHeaders() {
    return helmet({
      // Enforce HTTPS
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },

      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required for Vite in development
            'https://cdnjs.cloudflare.com',
            'https://unpkg.com'
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for styled-components
            'https://fonts.googleapis.com',
            'https://cdnjs.cloudflare.com'
          ],
          fontSrc: [
            "'self'",
            'https://fonts.gstatic.com',
            'https://cdnjs.cloudflare.com'
          ],
          imgSrc: [
            "'self'",
            'data:',
            'https:',
            'blob:'
          ],
          connectSrc: [
            "'self'",
            'wss:',
            'https://api.elevenlabs.io',
            'https://api.twilio.com',
            'https://api.hubapi.com',
            process.env.SUPABASE_URL,
            process.env.UPSTASH_REDIS_URL?.replace('redis://', 'https://').replace('rediss://', 'https://'),
            ...(process.env.ALLOWED_CONNECT_ORIGINS?.split(',') || [])
          ].filter(Boolean),
          mediaSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        },
        reportOnly: process.env.NODE_ENV !== 'production'
      },

      // Additional security headers
      crossOriginEmbedderPolicy: false, // Disable for WebSocket compatibility
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      
      // Prevent MIME type sniffing
      noSniff: true,
      
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      
      // Hide powered by header
      hidePoweredBy: true,
      
      // Prevent XSS attacks
      xssFilter: true,
      
      // Referrer policy
      referrerPolicy: { policy: ['no-referrer', 'strict-origin-when-cross-origin'] }
    });
  }

  /**
   * Configure rate limiting
   */
  configureRateLimit() {
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

    // General rate limiting
    const generalRateLimit = rateLimit({
      windowMs,
      max: maxRequests,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use X-Forwarded-For if behind proxy, otherwise use IP
        return req.ip || req.connection.remoteAddress;
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path.startsWith('/health/');
      },
      onLimitReached: (req, res, options) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent')
        });
      }
    });

    // Strict rate limiting for authentication endpoints
    const authRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: {
        error: 'Too many authentication attempts',
        retryAfter: 900
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true
    });

    // Webhook rate limiting
    const webhookRateLimit = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 60, // 60 requests per minute
      message: {
        error: 'Webhook rate limit exceeded',
        retryAfter: 60
      },
      keyGenerator: (req) => {
        // Use webhook source header if available
        return req.get('X-Webhook-Source') || req.ip;
      }
    });

    return {
      general: generalRateLimit,
      auth: authRateLimit,
      webhook: webhookRateLimit
    };
  }

  /**
   * Configure request slow down
   */
  configureSlowDown() {
    return slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 50, // Start slowing down after 50 requests
      delayMs: 500, // Increase delay by 500ms per request after threshold
      maxDelayMs: 20000, // Maximum delay of 20 seconds
      skipFailedRequests: false,
      skipSuccessfulRequests: false,
      onLimitReached: (req, res, options) => {
        this.logger.warn('Request slow down activated', {
          ip: req.ip,
          path: req.path
        });
      }
    });
  }

  /**
   * Configure IP whitelist middleware (optional)
   */
  configureIPWhitelist() {
    const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
    
    if (allowedIPs.length === 0) {
      return (req, res, next) => next(); // No IP restrictions
    }

    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      if (allowedIPs.includes(clientIP)) {
        return next();
      }

      this.logger.warn('IP access denied', { ip: clientIP });
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP address is not authorized'
      });
    };
  }

  /**
   * Request validation middleware
   */
  configureRequestValidation() {
    return (req, res, next) => {
      // Check for suspicious request patterns
      const suspiciousPatterns = [
        /\.\./,           // Path traversal
        /<script/i,       // XSS attempts
        /union.*select/i, // SQL injection
        /javascript:/i,   // JavaScript URLs
        /data:.*base64/i  // Base64 data URLs (in unexpected places)
      ];

      const checkString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(checkString)) {
          this.logger.warn('Suspicious request blocked', {
            ip: req.ip,
            path: req.path,
            pattern: pattern.toString(),
            userAgent: req.get('User-Agent')
          });
          
          return res.status(400).json({
            error: 'Invalid request',
            message: 'Request contains suspicious content'
          });
        }
      }

      // Check request size
      const contentLength = parseInt(req.get('Content-Length') || '0');
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (contentLength > maxSize) {
        this.logger.warn('Request too large', {
          ip: req.ip,
          contentLength,
          maxSize
        });
        
        return res.status(413).json({
          error: 'Request too large',
          message: 'Request exceeds maximum allowed size'
        });
      }

      next();
    };
  }

  /**
   * Security logging middleware
   */
  configureSecurityLogging() {
    return (req, res, next) => {
      // Log security-relevant events
      const securityHeaders = {
        'x-forwarded-for': req.get('X-Forwarded-For'),
        'user-agent': req.get('User-Agent'),
        'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
        'x-api-key': req.get('X-API-Key') ? '[REDACTED]' : undefined
      };

      // Log failed authentication attempts
      res.on('finish', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          this.logger.warn('Security event: Authentication failure', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            statusCode: res.statusCode,
            headers: securityHeaders
          });
        }
      });

      next();
    };
  }

  /**
   * Get complete security middleware stack
   */
  getSecurityStack() {
    const rateLimits = this.configureRateLimit();
    
    return [
      // Trust proxy for accurate IP addresses
      (req, res, next) => {
        // Set trust proxy based on environment
        req.app.set('trust proxy', process.env.NODE_ENV === 'production');
        next();
      },
      
      // Security headers
      this.configureSecurityHeaders(),
      
      // CORS configuration
      this.configureCORS(),
      
      // Request validation
      this.configureRequestValidation(),
      
      // IP whitelist (if configured)
      this.configureIPWhitelist(),
      
      // General rate limiting
      rateLimits.general,
      
      // Request slow down
      this.configureSlowDown(),
      
      // Security logging
      this.configureSecurityLogging()
    ];
  }

  /**
   * Get authentication-specific security middleware
   */
  getAuthSecurityStack() {
    const rateLimits = this.configureRateLimit();
    
    return [
      rateLimits.auth
    ];
  }

  /**
   * Get webhook-specific security middleware
   */
  getWebhookSecurityStack() {
    const rateLimits = this.configureRateLimit();
    
    return [
      rateLimits.webhook,
      
      // Webhook-specific validation
      (req, res, next) => {
        // Verify webhook signatures here if needed
        // Implementation depends on the webhook provider
        next();
      }
    ];
  }

  /**
   * Emergency security lockdown
   */
  enableLockdown() {
    this.logger.error('SECURITY LOCKDOWN ACTIVATED');
    
    return (req, res, next) => {
      // Only allow health checks during lockdown
      if (req.path === '/health' || req.path.startsWith('/health/')) {
        return next();
      }
      
      this.logger.warn('Request blocked due to security lockdown', {
        ip: req.ip,
        path: req.path
      });
      
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'System is under maintenance for security reasons'
      });
    };
  }
}

export default ProductionSecurity;