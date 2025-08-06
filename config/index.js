/**
 * BICI AI Voice System - Configuration Manager
 * Centralized configuration management with environment validation
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    apiSecretToken: process.env.API_SECRET_TOKEN,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // ElevenLabs Configuration
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agentId: process.env.ELEVENLABS_AGENT_ID,
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET,
    
    // Voice Settings
    voiceConfig: {
      stability: parseFloat(process.env.VOICE_STABILITY) || 0.65,
      similarity: parseFloat(process.env.VOICE_SIMILARITY) || 0.85,
      speed: parseFloat(process.env.VOICE_SPEED) || 1.0
    },

    // API Endpoints
    endpoints: {
      conversationWs: 'wss://api.elevenlabs.io/v1/convai/conversation',
      outboundCall: 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
      signedUrl: 'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url'
    }
  },

  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    webhookSecret: process.env.TWILIO_WEBHOOK_SECRET,
    
    // Human Transfer Numbers
    humanAgents: {
      general: process.env.HUMAN_AGENT_PHONE_1,
      technical: process.env.HUMAN_AGENT_PHONE_2,
      manager: process.env.MANAGER_PHONE
    }
  },

  // Database Configuration
  database: {
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    redis: {
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    }
  },

  // Third-party Integrations
  integrations: {
    hubspot: {
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      portalId: process.env.HUBSPOT_PORTAL_ID
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      calendarId: process.env.GOOGLE_CALENDAR_ID
    },
    shopify: {
      shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
      webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET
    }
  },

  // Business Configuration
  business: {
    organization: {
      name: process.env.ORGANIZATION_NAME || 'BICI Bike Store',
      id: process.env.ORGANIZATION_ID || 'bici-main',
      timezone: process.env.STORE_TIMEZONE || 'America/Toronto',
      defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en'
    },
    
    store: {
      address: process.env.STORE_ADDRESS || '123 Main Street, Downtown',
      city: process.env.STORE_CITY || 'Toronto',
      province: process.env.STORE_PROVINCE || 'ON',
      postalCode: process.env.STORE_POSTAL_CODE || 'M5V 3A8',
      phone: process.env.STORE_PHONE || '+14165551234'
    },

    hours: {
      weekdays: {
        open: process.env.STORE_HOURS_MON_FRI_OPEN || '09:00',
        close: process.env.STORE_HOURS_MON_FRI_CLOSE || '19:00'
      },
      weekends: {
        open: process.env.STORE_HOURS_SAT_SUN_OPEN || '10:00',
        close: process.env.STORE_HOURS_SAT_SUN_CLOSE || '18:00'
      }
    }
  },

  // Feature Flags
  features: {
    outboundCalling: process.env.ENABLE_OUTBOUND_CALLING === 'true',
    smsAutomation: process.env.ENABLE_SMS_AUTOMATION === 'true',
    bilingualSupport: process.env.ENABLE_BILINGUAL_SUPPORT === 'true',
    realTimeDashboard: process.env.ENABLE_REAL_TIME_DASHBOARD === 'true',
    humanEscalation: process.env.ENABLE_HUMAN_ESCALATION === 'true',
    calendarBooking: process.env.ENABLE_CALENDAR_BOOKING === 'true'
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    webhookRateLimit: parseInt(process.env.WEBHOOK_RATE_LIMIT) || 1000,
    webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 30000
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/bici-voice-system.log',
    analyticsEnabled: process.env.ANALYTICS_ENABLED === 'true',
    webhookLogging: process.env.WEBHOOK_LOGGING === 'true',
    conversationRecording: process.env.CONVERSATION_RECORDING === 'true'
  }
};

/**
 * Validate required configuration values
 */
function validateConfig() {
  const required = [
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_AGENT_ID', 
    'ELEVENLABS_PHONE_NUMBER_ID',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  console.log('✅ Configuration validation passed');
}

/**
 * Get organization-specific configuration
 */
function getOrgConfig(organizationId = 'bici-main') {
  return {
    ...config,
    organizationId,
    webhookUrls: {
      personalization: `${config.server.baseUrl}/api/webhooks/elevenlabs/twilio-personalization`,
      callEvents: `${config.server.baseUrl}/api/webhooks/elevenlabs/call-events`,
      smsStatus: `${config.server.baseUrl}/api/webhooks/twilio/sms-status`
    }
  };
}

// Validate configuration on module load
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

module.exports = {
  config,
  validateConfig,
  getOrgConfig
};