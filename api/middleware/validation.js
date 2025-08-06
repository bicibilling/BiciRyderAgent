/**
 * Input Validation and Sanitization Middleware
 * Uses Joi for comprehensive input validation
 */

const Joi = require('joi');
const validator = require('validator');

class ValidationMiddleware {
  constructor() {
    this.schemas = this.initializeSchemas();
  }
  
  /**
   * Initialize validation schemas
   */
  initializeSchemas() {
    return {
      // Authentication schemas
      login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        organizationId: Joi.string().uuid().required()
      }),
      
      register: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
        confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
        firstName: Joi.string().min(2).max(50).required(),
        lastName: Joi.string().min(2).max(50).required(),
        organizationId: Joi.string().uuid().required(),
        role: Joi.string().valid('admin', 'manager', 'agent', 'viewer').default('agent')
      }),
      
      refreshToken: Joi.object({
        refreshToken: Joi.string().required()
      }),
      
      // Organization schemas
      organization: Joi.object({
        name: Joi.string().min(2).max(255).required(),
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
        domain: Joi.string().domain().optional(),
        address: Joi.string().max(500).optional(),
        city: Joi.string().max(100).optional(),
        province: Joi.string().max(50).optional(),
        postalCode: Joi.string().max(20).optional(),
        timezone: Joi.string().default('America/Toronto'),
        settings: Joi.object().optional()
      }),
      
      // Conversation schemas
      conversationMessage: Joi.object({
        message: Joi.string().min(1).max(5000).required(),
        messageType: Joi.string().valid('text', 'contextual_update').default('text')
      }),
      
      conversationNotes: Joi.object({
        notes: Joi.string().max(10000).allow('').required()
      }),
      
      conversationSearch: Joi.object({
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
        startDate: Joi.string().isoDate().optional(),
        endDate: Joi.string().isoDate().optional(),
        status: Joi.string().valid('active', 'completed', 'failed', 'abandoned').optional(),
        humanTakeover: Joi.boolean().optional(),
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0)
      }),
      
      // Lead schemas
      lead: Joi.object({
        customerName: Joi.string().min(2).max(255).optional(),
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
        email: Joi.string().email().optional(),
        leadStatus: Joi.string().valid('new', 'contacted', 'qualified', 'converted', 'lost', 'follow_up').default('new'),
        leadSource: Joi.string().max(100).default('inbound_call'),
        bikeInterest: Joi.object({
          type: Joi.string().valid('road', 'mountain', 'electric', 'hybrid', 'kids', 'other').optional(),
          budget: Joi.object({
            min: Joi.number().min(0).optional(),
            max: Joi.number().min(0).optional()
          }).optional(),
          usage: Joi.string().valid('commuting', 'recreation', 'fitness', 'racing', 'touring').optional(),
          timeline: Joi.string().valid('immediate', 'weeks', 'months', 'researching').optional()
        }).optional(),
        contactPreferences: Joi.object({
          sms: Joi.boolean().default(true),
          email: Joi.boolean().default(true),
          call: Joi.boolean().default(true),
          preferredTime: Joi.string().valid('morning', 'afternoon', 'evening', 'business_hours').default('business_hours'),
          language: Joi.string().valid('en', 'fr').default('en')
        }).optional()
      }),
      
      // SMS schemas
      smsMessage: Joi.object({
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
        templateId: Joi.string().min(1).max(100).required(),
        variables: Joi.object().optional(),
        language: Joi.string().valid('en', 'fr').default('en'),
        messageType: Joi.string().valid('manual', 'automated', 'reminder').default('manual')
      }),
      
      // Outbound call schemas
      outboundCall: Joi.object({
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
        leadId: Joi.string().optional(),
        callReason: Joi.string().valid('follow_up', 'service_reminder', 'sales_call', 'support_callback').required(),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
        scheduledTime: Joi.string().isoDate().optional(),
        serviceDetails: Joi.object().optional()
      }),
      
      // Analytics schemas
      analyticsQuery: Joi.object({
        timeframe: Joi.string().valid('1h', '24h', '7d', '30d', '90d', 'custom').default('24h'),
        startDate: Joi.string().isoDate().when('timeframe', {
          is: 'custom',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        endDate: Joi.string().isoDate().when('timeframe', {
          is: 'custom',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        metrics: Joi.array().items(
          Joi.string().valid('calls', 'conversations', 'leads', 'conversions', 'duration', 'sentiment')
        ).optional(),
        groupBy: Joi.string().valid('hour', 'day', 'week', 'month').optional()
      }),
      
      // Integration schemas
      integrationConfig: Joi.object({
        type: Joi.string().valid('shopify', 'hubspot', 'calendar', 'twilio').required(),
        config: Joi.object().required(),
        enabled: Joi.boolean().default(true)
      }),
      
      // Webhook schemas
      webhook: Joi.object({
        url: Joi.string().uri().required(),
        events: Joi.array().items(Joi.string()).min(1).required(),
        secret: Joi.string().min(32).optional(),
        enabled: Joi.boolean().default(true)
      }),
      
      // File upload schemas
      fileUpload: Joi.object({
        type: Joi.string().valid('knowledge_base', 'audio', 'image', 'document').required(),
        category: Joi.string().max(100).optional(),
        description: Joi.string().max(500).optional()
      }),
      
      // Common schemas
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().optional(),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      }),
      
      uuid: Joi.string().uuid(),
      phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/),
      email: Joi.string().email(),
      isoDate: Joi.string().isoDate()
    };
  }
  
  /**
   * Validate request body
   */
  validateBody(schemaName) {
    return (req, res, next) => {
      const schema = this.getSchema(schemaName);
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false
      });
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: this.formatValidationErrors(error),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
      
      req.body = value;
      next();
    };
  }
  
  /**
   * Validate query parameters
   */
  validateQuery(schemaName) {
    return (req, res, next) => {
      const schema = this.getSchema(schemaName);
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false
      });
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Query validation failed',
          code: 'QUERY_VALIDATION_ERROR',
          details: this.formatValidationErrors(error),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
      
      req.query = value;
      next();
    };
  }
  
  /**
   * Validate route parameters
   */
  validateParams(schemaObj) {
    return (req, res, next) => {
      const schema = Joi.object(schemaObj);
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Parameter validation failed',
          code: 'PARAM_VALIDATION_ERROR',
          details: this.formatValidationErrors(error),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
      
      req.params = value;
      next();
    };
  }
  
  /**
   * Custom validation middleware
   */
  validateCustom(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: this.formatValidationErrors(error),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
      
      req.body = value;
      next();
    };
  }
  
  /**
   * Sanitize user input
   */
  sanitizeInput() {
    return (req, res, next) => {
      // Sanitize body
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }
      
      // Sanitize query
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }
      
      // Sanitize params
      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }
      
      next();
    };
  }
  
  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return this.sanitizeValue(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeValue(key);
      sanitized[sanitizedKey] = this.sanitizeObject(value);
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize individual value
   */
  sanitizeValue(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Basic HTML sanitization
    return validator.escape(value.trim());
  }
  
  /**
   * Get schema by name
   */
  getSchema(schemaName) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema '${schemaName}' not found`);
    }
    return schema;
  }
  
  /**
   * Format Joi validation errors
   */
  formatValidationErrors(error) {
    return error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/"/g, "'"),
      value: detail.context?.value,
      type: detail.type
    }));
  }
  
  /**
   * Add custom schema
   */
  addSchema(name, schema) {
    this.schemas[name] = schema;
  }
  
  /**
   * Common validation patterns
   */
  static patterns = {
    phoneNumber: /^\+[1-9]\d{1,14}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    slug: /^[a-z0-9-]+$/,
    hexColor: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  };
  
  /**
   * Common validation helpers
   */
  static helpers = {
    isValidPhoneNumber: (phone) => ValidationMiddleware.patterns.phoneNumber.test(phone),
    isValidUUID: (uuid) => ValidationMiddleware.patterns.uuid.test(uuid),
    sanitizeFilename: (filename) => filename.replace(/[^a-zA-Z0-9.-]/g, '_'),
    normalizePhoneNumber: (phone) => phone.replace(/\D/g, '').replace(/^1/, '+1'),
    validateTimeZone: (timezone) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
      } catch (ex) {
        return false;
      }
    }
  };
}

// Create singleton instance
const validationMiddleware = new ValidationMiddleware();

module.exports = {
  validateBody: validationMiddleware.validateBody.bind(validationMiddleware),
  validateQuery: validationMiddleware.validateQuery.bind(validationMiddleware),
  validateParams: validationMiddleware.validateParams.bind(validationMiddleware),
  validateCustom: validationMiddleware.validateCustom.bind(validationMiddleware),
  sanitizeInput: validationMiddleware.sanitizeInput.bind(validationMiddleware),
  addSchema: validationMiddleware.addSchema.bind(validationMiddleware),
  schemas: validationMiddleware.schemas,
  patterns: ValidationMiddleware.patterns,
  helpers: ValidationMiddleware.helpers
};