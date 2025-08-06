/**
 * Comprehensive Error Handling Middleware
 * Handles all types of errors with proper logging and user-friendly responses
 */

const { ValidationError } = require('joi');

class ErrorHandler {
  constructor() {
    this.errorCodes = {
      // Authentication & Authorization
      AUTH_REQUIRED: { status: 401, message: 'Authentication required' },
      INVALID_TOKEN: { status: 401, message: 'Invalid or expired token' },
      INSUFFICIENT_PERMISSIONS: { status: 403, message: 'Insufficient permissions' },
      ORGANIZATION_ACCESS_DENIED: { status: 403, message: 'Organization access denied' },
      
      // Validation
      VALIDATION_ERROR: { status: 400, message: 'Validation failed' },
      INVALID_INPUT: { status: 400, message: 'Invalid input provided' },
      MISSING_REQUIRED_FIELD: { status: 400, message: 'Required field missing' },
      
      // Resources
      RESOURCE_NOT_FOUND: { status: 404, message: 'Resource not found' },
      RESOURCE_CONFLICT: { status: 409, message: 'Resource conflict' },
      RESOURCE_GONE: { status: 410, message: 'Resource no longer available' },
      
      // Rate Limiting
      RATE_LIMIT_EXCEEDED: { status: 429, message: 'Rate limit exceeded' },
      
      // External Services
      EXTERNAL_SERVICE_ERROR: { status: 502, message: 'External service error' },
      SERVICE_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable' },
      TIMEOUT_ERROR: { status: 504, message: 'Request timeout' },
      
      // Database
      DATABASE_ERROR: { status: 500, message: 'Database error' },
      CONNECTION_ERROR: { status: 500, message: 'Connection error' },
      
      // Internal
      INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
      NOT_IMPLEMENTED: { status: 501, message: 'Feature not implemented' }
    };
  }
  
  /**
   * Main error handling middleware
   */
  handle() {
    return (error, req, res, next) => {
      // Log error details
      this.logError(error, req);
      
      // Determine error type and create response
      const errorResponse = this.createErrorResponse(error, req);
      
      // Send error response
      res.status(errorResponse.status).json(errorResponse.body);
    };
  }
  
  /**
   * Log error with context
   */
  logError(error, req) {
    const errorContext = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      }
    };
    
    // Log based on error severity
    if (error.status >= 500 || !error.status) {
      console.error('🚨 Server Error:', JSON.stringify(errorContext, null, 2));
    } else if (error.status >= 400) {
      console.warn('⚠️  Client Error:', JSON.stringify(errorContext, null, 2));
    } else {
      console.info('ℹ️  Request Error:', JSON.stringify(errorContext, null, 2));
    }
  }
  
  /**
   * Create standardized error response
   */
  createErrorResponse(error, req) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Handle known error types
    if (error.code && this.errorCodes[error.code]) {
      const knownError = this.errorCodes[error.code];
      return {
        status: error.status || knownError.status,
        body: {
          success: false,
          error: error.message || knownError.message,
          code: error.code,
          requestId: req.id,
          timestamp: new Date().toISOString(),
          ...(isDevelopment && { stack: error.stack })
        }
      };
    }
    
    // Handle validation errors (Joi)
    if (error instanceof ValidationError || error.name === 'ValidationError') {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: this.formatValidationErrors(error),
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
      return {
        status: 401,
        body: {
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    if (error.name === 'TokenExpiredError') {
      return {
        status: 401,
        body: {
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle Multer errors (file uploads)
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        body: {
          success: false,
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle database errors
    if (this.isDatabaseError(error)) {
      return {
        status: 500,
        body: {
          success: false,
          error: isDevelopment ? error.message : 'Database error occurred',
          code: 'DATABASE_ERROR',
          requestId: req.id,
          timestamp: new Date().toISOString(),
          ...(isDevelopment && { details: error.stack })
        }
      };
    }
    
    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return {
        status: 504,
        body: {
          success: false,
          error: 'Request timeout',
          code: 'TIMEOUT_ERROR',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        status: 502,
        body: {
          success: false,
          error: 'External service unavailable',
          code: 'EXTERNAL_SERVICE_ERROR',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle syntax errors
    if (error instanceof SyntaxError && error.status === 400) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid JSON format',
          code: 'INVALID_JSON',
          requestId: req.id,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Handle unknown errors
    const status = error.status || error.statusCode || 500;
    
    return {
      status,
      body: {
        success: false,
        error: isDevelopment ? error.message : 'An error occurred',
        code: error.code || 'INTERNAL_ERROR',
        requestId: req.id,
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { 
          stack: error.stack,
          details: error 
        })
      }
    };
  }
  
  /**
   * Format Joi validation errors
   */
  formatValidationErrors(error) {
    if (error.details) {
      return error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
    }
    
    return [{ message: error.message }];
  }
  
  /**
   * Check if error is database-related
   */
  isDatabaseError(error) {
    const dbErrorPatterns = [
      'database',
      'connection',
      'query',
      'constraint',
      'relation',
      'column',
      'table'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return dbErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }
  
  /**
   * Create custom error
   */
  createError(code, message, status, details = null) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    if (details) error.details = details;
    return error;
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
   * Not found handler (404)
   */
  notFound() {
    return (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        path: req.path,
        method: req.method,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  /**
   * Method not allowed handler (405)
   */
  methodNotAllowed(allowedMethods = []) {
    return (req, res) => {
      res.set('Allow', allowedMethods.join(', '));
      res.status(405).json({
        success: false,
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
        method: req.method,
        allowedMethods,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  /**
   * Service unavailable handler (503)
   */
  serviceUnavailable(message = 'Service temporarily unavailable') {
    return (req, res) => {
      res.status(503).json({
        success: false,
        error: message,
        code: 'SERVICE_UNAVAILABLE',
        requestId: req.id,
        timestamp: new Date().toISOString(),
        retryAfter: 60 // seconds
      });
    };
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = {
  handle: errorHandler.handle.bind(errorHandler),
  notFound: errorHandler.notFound.bind(errorHandler),
  methodNotAllowed: errorHandler.methodNotAllowed.bind(errorHandler),
  serviceUnavailable: errorHandler.serviceUnavailable.bind(errorHandler),
  createError: errorHandler.createError.bind(errorHandler),
  asyncHandler: errorHandler.asyncHandler.bind(errorHandler)
};