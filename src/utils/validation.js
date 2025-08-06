const Joi = require('joi');

// Common validation schemas
const schemas = {
  // Phone number validation (supports international formats)
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .message('Invalid phone number format'),

  // Email validation
  email: Joi.string().email().lowercase(),

  // Organization ID validation
  organizationId: Joi.string().min(3).max(50).alphanum(),

  // Shopify order validation
  shopifyOrder: Joi.object({
    identifier: Joi.string().required(),
    identifier_type: Joi.string().valid('phone', 'email', 'order_number').required()
  }),

  // HubSpot contact validation
  hubspotContact: Joi.object({
    email: Joi.string().email(),
    phone_number: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    first_name: Joi.string().min(1).max(100),
    last_name: Joi.string().min(1).max(100),
    company: Joi.string().max(200)
  }).or('email', 'phone_number'),

  // Google Calendar appointment validation
  calendarAppointment: Joi.object({
    customer_name: Joi.string().min(1).max(200).required(),
    customer_phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    customer_email: Joi.string().email().required(),
    service_type: Joi.string().valid(
      'bike_repair', 'bike_tuneup', 'bike_fitting', 
      'consultation', 'warranty_service'
    ).required(),
    appointment_datetime: Joi.date().iso().min('now').required(),
    notes: Joi.string().max(1000).allow(''),
    duration_minutes: Joi.number().integer().min(30).max(240).default(60)
  }),

  // ElevenLabs webhook validation
  elevenlabsWebhook: Joi.object({
    conversation_id: Joi.string().required(),
    agent_id: Joi.string().required(),
    type: Joi.string().valid(
      'conversation_started', 'conversation_ended', 'user_transcript',
      'agent_response', 'tool_call', 'error'
    ).required(),
    timestamp: Joi.date().iso().required(),
    data: Joi.object().required()
  }),

  // Server tool response validation
  serverToolResponse: Joi.object({
    success: Joi.boolean().required(),
    data: Joi.object().when('success', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    error: Joi.string().when('success', {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    message: Joi.string().optional()
  })
};

// Validation middleware factory
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errorDetails
      });
    }

    req.body = value;
    next();
  };
};

// Validation for query parameters
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    req.query = value;
    next();
  };
};

// Utility functions
const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters except +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // Add + if not present and number doesn't start with 1
  if (!normalized.startsWith('+')) {
    if (normalized.startsWith('1') && normalized.length === 11) {
      normalized = `+${normalized}`;
    } else if (normalized.length === 10) {
      normalized = `+1${normalized}`;
    } else {
      normalized = `+${normalized}`;
    }
  }
  
  return normalized;
};

const validatePhoneNumber = (phoneNumber) => {
  const normalized = normalizePhoneNumber(phoneNumber);
  const { error } = schemas.phoneNumber.validate(normalized);
  return { isValid: !error, normalized };
};

const validateEmail = (email) => {
  const { error, value } = schemas.email.validate(email);
  return { isValid: !error, normalized: value };
};

// Sanitize input to prevent XSS
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>'"&]/g, (char) => {
      const entities = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
      return entities[char];
    })
    .trim();
};

module.exports = {
  schemas,
  validateBody,
  validateQuery,
  normalizePhoneNumber,
  validatePhoneNumber,
  validateEmail,
  sanitizeInput
};