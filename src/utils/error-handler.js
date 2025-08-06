const { logger } = require('../config/logger');

class ErrorHandler {
  constructor() {
    this.logger = logger.child({ component: 'error-handler' });
  }

  /**
   * Centralized error handling middleware
   */
  handleError() {
    return (error, req, res, next) => {
      // Log the error
      this.logger.error('Unhandled request error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        path: req.path,
        body: req.method === 'POST' ? this.sanitizeBody(req.body) : undefined,
        headers: this.sanitizeHeaders(req.headers),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Determine error type and respond appropriately
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details || error.message
        });
      }

      if (error.name === 'UnauthorizedError' || error.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized access'
        });
      }

      if (error.name === 'ForbiddenError' || error.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Access forbidden'
        });
      }

      if (error.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found'
        });
      }

      if (error.name === 'RateLimitError' || error.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retry_after: error.retryAfter || 60
        });
      }

      // Default to 500 for unhandled errors
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message
      });
    };
  }

  /**
   * Handle 404 routes
   */
  handle404() {
    return (req, res) => {
      this.logger.warn('Route not found', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });

      res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `${req.method} ${req.path} does not exist`
      });
    };
  }

  /**
   * Async error wrapper for route handlers
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Integration-specific error handling
   */
  handleIntegrationError(error, integration) {
    this.logger.error(`${integration} integration error`, {
      error: error.message,
      stack: error.stack,
      integration
    });

    // Return standardized error response
    return {
      success: false,
      error: `${integration} service temporarily unavailable`,
      message: process.env.NODE_ENV === 'production' 
        ? 'Please try again later' 
        : error.message,
      integration,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Sanitize request body for logging
   */
  sanitizeBody(body) {
    if (!body) return undefined;

    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'authorization',
      'credit_card', 'ssn', 'social_security'
    ];

    // Mask phone and email
    if (sanitized.customer_phone) {
      sanitized.customer_phone = this.maskString(sanitized.customer_phone);
    }
    if (sanitized.customer_email) {
      sanitized.customer_email = this.maskEmail(sanitized.customer_email);
    }
    if (sanitized.phone_number) {
      sanitized.phone_number = this.maskString(sanitized.phone_number);
    }
    if (sanitized.email) {
      sanitized.email = this.maskEmail(sanitized.email);
    }

    // Remove sensitive fields
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize headers for logging
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    
    // Mask authorization headers
    if (sanitized.authorization) {
      sanitized.authorization = '[REDACTED]';
    }
    if (sanitized['x-api-key']) {
      sanitized['x-api-key'] = '[REDACTED]';
    }

    return sanitized;
  }

  /**
   * Mask string (show first and last 3 characters)
   */
  maskString(str) {
    if (!str || str.length <= 6) return '[MASKED]';
    return str.substring(0, 3) + '*'.repeat(str.length - 6) + str.substring(str.length - 3);
  }

  /**
   * Mask email address
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) return '[MASKED]';
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2 
      ? local.substring(0, 2) + '*'.repeat(local.length - 2)
      : '**';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Create custom error classes
   */
  createCustomErrors() {
    // Validation Error
    class ValidationError extends Error {
      constructor(message, details = null) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
        this.status = 400;
      }
    }

    // Integration Error
    class IntegrationError extends Error {
      constructor(message, integration, originalError = null) {
        super(message);
        this.name = 'IntegrationError';
        this.integration = integration;
        this.originalError = originalError;
        this.status = 503;
      }
    }

    // Rate Limit Error
    class RateLimitError extends Error {
      constructor(message, retryAfter = 60) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
        this.status = 429;
      }
    }

    // Authentication Error
    class AuthenticationError extends Error {
      constructor(message) {
        super(message);
        this.name = 'AuthenticationError';
        this.status = 401;
      }
    }

    // Authorization Error
    class AuthorizationError extends Error {
      constructor(message) {
        super(message);
        this.name = 'AuthorizationError';
        this.status = 403;
      }
    }

    return {
      ValidationError,
      IntegrationError,
      RateLimitError,
      AuthenticationError,
      AuthorizationError
    };
  }
}

// Create error classes
const errorHandler = new ErrorHandler();
const customErrors = errorHandler.createCustomErrors();

module.exports = {
  errorHandler,
  ...customErrors
};