const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { logger } = require('../config/logger');

class SecurityMiddleware {
  constructor() {
    this.logger = logger.child({ component: 'security' });
  }

  /**
   * Get helmet security middleware
   */
  getHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "https:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  /**
   * Rate limiting for general API endpoints
   */
  getGeneralRateLimit() {
    return rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        retry_after: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip + ':' + req.path;
      },
      handler: (req, res) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
        
        res.status(429).json({
          success: false,
          error: 'Too many requests from this IP, please try again later',
          retry_after: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
        });
      }
    });
  }

  /**
   * Strict rate limiting for webhook endpoints
   */
  getWebhookRateLimit() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 60, // 60 requests per minute
      message: {
        success: false,
        error: 'Webhook rate limit exceeded'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use source IP + webhook path for key
        return req.ip + ':webhook:' + req.path;
      },
      handler: (req, res) => {
        this.logger.warn('Webhook rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          source: req.get('X-Source') || 'unknown'
        });
        
        res.status(429).json({
          success: false,
          error: 'Webhook rate limit exceeded'
        });
      }
    });
  }

  /**
   * Rate limiting for server tools (more permissive)
   */
  getServerToolsRateLimit() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 300, // 300 requests per minute for server tools
      message: {
        success: false,
        error: 'Server tools rate limit exceeded'
      },
      keyGenerator: (req) => {
        // Use API key hash for rate limiting
        const authHeader = req.headers.authorization;
        const keyHash = authHeader ? 
          require('crypto').createHash('md5').update(authHeader).digest('hex') : 
          req.ip;
        return 'server-tools:' + keyHash;
      },
      handler: (req, res) => {
        this.logger.warn('Server tools rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        
        res.status(429).json({
          success: false,
          error: 'Server tools rate limit exceeded'
        });
      }
    });
  }

  /**
   * IP whitelist middleware for sensitive endpoints
   */
  getIPWhitelistMiddleware(allowedIPs = []) {
    const defaultAllowedIPs = [
      '127.0.0.1',
      '::1',
      'localhost'
    ];
    
    const whitelist = [...defaultAllowedIPs, ...allowedIPs];
    
    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      if (whitelist.includes(clientIP)) {
        return next();
      }
      
      this.logger.warn('IP not whitelisted', {
        ip: clientIP,
        path: req.path,
        method: req.method
      });
      
      res.status(403).json({
        success: false,
        error: 'Access forbidden'
      });
    };
  }

  /**
   * Request sanitization middleware
   */
  getSanitizationMiddleware() {
    return (req, res, next) => {
      // Sanitize query parameters
      if (req.query) {
        for (const key in req.query) {
          if (typeof req.query[key] === 'string') {
            req.query[key] = this.sanitizeString(req.query[key]);
          }
        }
      }

      // Sanitize body parameters (for non-JSON bodies)
      if (req.body && typeof req.body === 'object') {
        req.body = this.sanitizeObject(req.body);
      }

      next();
    };
  }

  /**
   * CORS middleware with security headers
   */
  getCORSMiddleware() {
    return (req, res, next) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://yourdomain.com',
        process.env.FRONTEND_URL
      ].filter(Boolean);

      const origin = req.headers.origin;
      
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      next();
    };
  }

  /**
   * Request size limitation middleware
   */
  getRequestSizeLimiter() {
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length']) || 0;
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (contentLength > maxSize) {
        this.logger.warn('Request size too large', {
          ip: req.ip,
          path: req.path,
          contentLength,
          maxSize
        });
        
        return res.status(413).json({
          success: false,
          error: 'Request entity too large'
        });
      }

      next();
    };
  }

  /**
   * Security headers middleware
   */
  getSecurityHeadersMiddleware() {
    return (req, res, next) => {
      // Remove server identification
      res.removeHeader('X-Powered-By');
      
      // Add security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      next();
    };
  }

  /**
   * Request logging middleware for security monitoring
   */
  getSecurityLoggingMiddleware() {
    return (req, res, next) => {
      // Log suspicious requests
      const suspiciousPatterns = [
        /\.\./,  // Directory traversal
        /<script>/i,  // XSS attempts
        /union.*select/i,  // SQL injection
        /javascript:/i,  // JavaScript injection
        /data:text\/html/i  // Data URL injection
      ];

      const requestData = JSON.stringify(req.body || {}) + req.url + (req.query ? JSON.stringify(req.query) : '');
      
      const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
      
      if (isSuspicious) {
        this.logger.warn('Suspicious request detected', {
          ip: req.ip,
          method: req.method,
          path: req.path,
          userAgent: req.get('User-Agent'),
          body: this.sanitizeForLogging(req.body),
          query: req.query
        });
      }

      next();
    };
  }

  /**
   * Utility methods
   */
  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  sanitizeObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const sanitizedKey = this.sanitizeString(key);
        
        if (typeof obj[key] === 'string') {
          sanitized[sanitizedKey] = this.sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object') {
          sanitized[sanitizedKey] = this.sanitizeObject(obj[key]);
        } else {
          sanitized[sanitizedKey] = obj[key];
        }
      }
    }
    
    return sanitized;
  }

  sanitizeForLogging(obj) {
    if (!obj) return obj;
    
    const sanitized = { ...obj };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'authorization',
      'credit_card', 'ssn', 'social_security', 'api_key'
    ];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Create comprehensive security middleware stack
   */
  createSecurityStack() {
    return [
      this.getHelmetMiddleware(),
      this.getSecurityHeadersMiddleware(),
      this.getCORSMiddleware(),
      this.getRequestSizeLimiter(),
      this.getSanitizationMiddleware(),
      this.getSecurityLoggingMiddleware()
    ];
  }

  /**
   * Create webhook security stack
   */
  createWebhookSecurityStack() {
    return [
      this.getSecurityHeadersMiddleware(),
      this.getRequestSizeLimiter(),
      this.getWebhookRateLimit(),
      this.getSecurityLoggingMiddleware()
    ];
  }

  /**
   * Create server tools security stack
   */
  createServerToolsSecurityStack() {
    return [
      this.getSecurityHeadersMiddleware(),
      this.getRequestSizeLimiter(),
      this.getServerToolsRateLimit(),
      this.getSanitizationMiddleware()
    ];
  }
}

module.exports = new SecurityMiddleware();