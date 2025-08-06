/**
 * SMS Service
 * Complete SMS integration with Twilio, templates, delivery tracking, and conversation context
 */

const TwilioService = require('./twilioService');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class SMSService extends EventEmitter {
  constructor() {
    super();
    this.twilioService = new TwilioService();
    this.isInitialized = false;
    this.templates = new Map();
    this.deliveryTracking = new Map(); // messageId -> delivery status
    this.retryQueue = new Map(); // messageId -> retry config
    this.rateLimitStore = new Map(); // phoneNumber -> request timestamps
    
    // Initialize templates and service
    this.initializeTemplates();
    this.initializeService();
  }

  /**
   * Initialize the SMS service
   */
  async initializeService() {
    try {
      const initialized = await this.twilioService.initialize();
      if (initialized) {
        this.isInitialized = true;
        console.log('✅ SMS Service initialized successfully');
        
        // Set up event listeners from Twilio service
        this.twilioService.on('sms_sent', (data) => {
          this.handleSMSSent(data);
        });
        
        this.twilioService.on('sms_error', (data) => {
          this.handleSMSError(data);
        });
        
        this.startRetryProcessor();
        this.startCleanupJobs();
        
      } else {
        console.warn('⚠️ SMS Service initialization failed - Twilio not available');
      }
    } catch (error) {
      console.error('❌ SMS Service initialization failed:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Initialize SMS templates for different scenarios
   */
  initializeTemplates() {
    const templates = {
      // English templates
      en: {
        welcome: {
          id: 'welcome_en',
          subject: 'Welcome to BICI!',
          body: 'Hi {{customer_name}}! 🚴‍♂️\n\nWelcome to BICI Bike Store! We\'re excited to help you find the perfect bike.\n\nHours: Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM\nLocation: {{store_address}}\nCall us: {{store_phone}}',
          category: 'welcome',
          variables: ['customer_name', 'store_address', 'store_phone']
        },

        appointment_confirmation: {
          id: 'appointment_confirmation_en',
          subject: 'Appointment Confirmed',
          body: '✅ Appointment Confirmed!\n\nService: {{service_type}}\nDate: {{date}}\nTime: {{time}}\nTechnician: {{technician_name}}\n\nLocation: BICI - {{store_address}}\n\nNeed to reschedule? Call {{store_phone}}',
          category: 'appointment',
          variables: ['service_type', 'date', 'time', 'technician_name', 'store_address', 'store_phone']
        },

        appointment_reminder: {
          id: 'appointment_reminder_en',
          subject: 'Appointment Reminder',
          body: '🔔 Reminder: Your {{service_type}} appointment is tomorrow at {{time}}!\n\nLocation: BICI - {{store_address}}\nTechnician: {{technician_name}}\n\nRunning late? Call {{store_phone}}',
          category: 'appointment',
          variables: ['service_type', 'time', 'store_address', 'technician_name', 'store_phone']
        },

        follow_up_general: {
          id: 'follow_up_general_en',
          subject: 'Thanks for calling!',
          body: 'Hi {{customer_name}}! Thanks for calling BICI today. 🚴‍♂️\n\n{{custom_message}}\n\nIf you have more questions about {{topic}}, don\'t hesitate to call us!\n\nHappy cycling! 🌟',
          category: 'follow_up',
          variables: ['customer_name', 'custom_message', 'topic']
        },

        product_inquiry: {
          id: 'product_inquiry_en',
          subject: 'Bike Information',
          body: '🚴‍♂️ Thanks for your interest in {{bike_type}}!\n\nWe have great options in your {{budget_range}} budget range:\n\n{{product_suggestions}}\n\nVisit us for a test ride!\n📍 {{store_address}}\n📞 {{store_phone}}',
          category: 'product',
          variables: ['bike_type', 'budget_range', 'product_suggestions', 'store_address', 'store_phone']
        },

        order_update: {
          id: 'order_update_en',
          subject: 'Order Update',
          body: '📦 Order Update #{{order_number}}\n\nStatus: {{status}}\n{{status_details}}\n\nEstimated {{delivery_pickup}}: {{estimated_date}}\n\nQuestions? Call {{store_phone}}',
          category: 'order',
          variables: ['order_number', 'status', 'status_details', 'delivery_pickup', 'estimated_date', 'store_phone']
        },

        human_agent_introduction: {
          id: 'human_agent_introduction_en',
          subject: 'Human Agent Connected',
          body: 'Hi {{customer_name}}! This is {{agent_name}} from BICI. 👋\n\n{{custom_message}}\n\nI\'m here to help with any questions you have!',
          category: 'human_control',
          variables: ['customer_name', 'agent_name', 'custom_message']
        },

        missed_call_followup: {
          id: 'missed_call_followup_en',
          subject: 'We tried to reach you',
          body: 'Hi {{customer_name}}! We tried calling but couldn\'t connect. 📞\n\n{{call_reason}}\n\nCall us back: {{store_phone}}\nOr visit: {{store_address}}\n\nHours: Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
          category: 'missed_call',
          variables: ['customer_name', 'call_reason', 'store_phone', 'store_address']
        }
      },

      // French templates
      fr: {
        welcome: {
          id: 'welcome_fr',
          subject: 'Bienvenue chez BICI!',
          body: 'Salut {{customer_name}}! 🚴‍♂️\n\nBienvenue chez BICI Bike Store! Nous sommes ravis de vous aider à trouver le vélo parfait.\n\nHeures: Lun-Ven 9h-19h, Sam-Dim 10h-18h\nAdresse: {{store_address}}\nAppelez-nous: {{store_phone}}',
          category: 'welcome',
          variables: ['customer_name', 'store_address', 'store_phone']
        },

        appointment_confirmation: {
          id: 'appointment_confirmation_fr',
          subject: 'Rendez-vous confirmé',
          body: '✅ Rendez-vous confirmé!\n\nService: {{service_type}}\nDate: {{date}}\nHeure: {{time}}\nTechnicien: {{technician_name}}\n\nAdresse: BICI - {{store_address}}\n\nBesoin de reporter? Appelez {{store_phone}}',
          category: 'appointment',
          variables: ['service_type', 'date', 'time', 'technician_name', 'store_address', 'store_phone']
        },

        human_agent_introduction: {
          id: 'human_agent_introduction_fr',
          subject: 'Agent humain connecté',
          body: 'Salut {{customer_name}}! Je suis {{agent_name}} de BICI. 👋\n\n{{custom_message}}\n\nJe suis là pour vous aider!',
          category: 'human_control',
          variables: ['customer_name', 'agent_name', 'custom_message']
        }
      }
    };

    // Store templates in Map for fast lookup
    Object.entries(templates).forEach(([lang, langTemplates]) => {
      Object.entries(langTemplates).forEach(([templateId, template]) => {
        const key = `${lang}:${templateId}`;
        this.templates.set(key, template);
      });
    });

    console.log(`📝 Initialized ${this.templates.size} SMS templates`);
  }

  /**
   * Send SMS with template or raw message
   */
  async sendSMS(phoneNumber, messageContent, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SMS Service not initialized');
    }

    const {
      templateId = null,
      variables = {},
      language = 'en',
      organizationId = 'bici-demo',
      leadId = null,
      priority = 'normal',
      scheduledTime = null,
      maxRetries = 3,
      conversationContext = null,
      agentId = null,
      messageType = 'standard'
    } = options;

    try {
      // Rate limiting check
      const rateLimitResult = this.checkRateLimit(phoneNumber, organizationId);
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limit exceeded. Reset time: ${new Date(rateLimitResult.resetTime)}`);
      }

      // Process message content
      let processedMessage;
      if (templateId) {
        processedMessage = await this.processTemplate(templateId, variables, language);
      } else {
        processedMessage = messageContent;
      }

      // Validate message
      this.validateMessage(processedMessage);

      // Send via Twilio
      const twilioResult = await this.twilioService.sendSMS(
        phoneNumber,
        templateId || 'custom',
        variables,
        {
          language: language,
          scheduledTime: scheduledTime,
          priority: priority
        }
      );

      if (!twilioResult.success) {
        throw new Error(twilioResult.error);
      }

      // Track delivery
      this.trackDelivery(twilioResult.messageId, {
        phoneNumber,
        organizationId,
        leadId,
        messageType,
        templateId,
        priority,
        maxRetries,
        sentAt: new Date().toISOString(),
        agentId,
        conversationContext
      });

      // Log success
      console.log(`📱 SMS sent successfully: ${twilioResult.messageId} to ${phoneNumber}`);

      // Emit success event
      this.emit('sms_sent_success', {
        messageId: twilioResult.messageId,
        phoneNumber,
        organizationId,
        leadId,
        templateId,
        messageType,
        priority
      });

      return {
        success: true,
        messageId: twilioResult.messageId,
        status: twilioResult.status,
        messageText: processedMessage,
        organizationId,
        leadId,
        sentAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ SMS sending failed to ${phoneNumber}:`, error.message);

      // Emit error event
      this.emit('sms_send_error', {
        phoneNumber,
        organizationId,
        leadId,
        templateId,
        error: error.message,
        messageType
      });

      return {
        success: false,
        error: error.message,
        phoneNumber,
        organizationId,
        leadId
      };
    }
  }

  /**
   * Send SMS to human agent when taking control
   */
  async sendHumanControlIntroduction(phoneNumber, agentData, options = {}) {
    const {
      customMessage = '',
      organizationId = 'bici-demo',
      leadId = null,
      language = 'en'
    } = options;

    const variables = {
      customer_name: agentData.customerName || 'Customer',
      agent_name: agentData.agentName,
      custom_message: customMessage || 'I\'ve taken over this conversation to better assist you.'
    };

    return await this.sendSMS(phoneNumber, null, {
      templateId: 'human_agent_introduction',
      variables,
      language,
      organizationId,
      leadId,
      messageType: 'human_control',
      agentId: agentData.agentId,
      priority: 'high'
    });
  }

  /**
   * Send follow-up SMS after call
   */
  async sendFollowUpSMS(phoneNumber, callContext, options = {}) {
    const {
      customMessage = '',
      organizationId = 'bici-demo',
      leadId = null,
      language = 'en',
      delayMinutes = 5
    } = options;

    const variables = {
      customer_name: callContext.customerName || 'Customer',
      custom_message: customMessage || 'Thanks for speaking with us about your biking needs!',
      topic: callContext.topic || 'bikes and cycling'
    };

    const scheduledTime = new Date(Date.now() + (delayMinutes * 60 * 1000));

    return await this.sendSMS(phoneNumber, null, {
      templateId: 'follow_up_general',
      variables,
      language,
      organizationId,
      leadId,
      messageType: 'follow_up',
      scheduledTime: scheduledTime,
      conversationContext: callContext,
      priority: 'normal'
    });
  }

  /**
   * Send appointment-related SMS
   */
  async sendAppointmentSMS(phoneNumber, appointmentData, type, options = {}) {
    const {
      organizationId = 'bici-demo',
      leadId = null,
      language = 'en'
    } = options;

    let templateId;
    let variables = {
      service_type: appointmentData.serviceType,
      date: new Date(appointmentData.date).toLocaleDateString(),
      time: new Date(appointmentData.date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      technician_name: appointmentData.technicianName || 'Our team',
      store_address: appointmentData.storeAddress || process.env.STORE_ADDRESS,
      store_phone: appointmentData.storePhone || process.env.STORE_PHONE
    };

    switch (type) {
      case 'confirmation':
        templateId = 'appointment_confirmation';
        break;
      case 'reminder':
        templateId = 'appointment_reminder';
        break;
      default:
        throw new Error(`Unknown appointment SMS type: ${type}`);
    }

    return await this.sendSMS(phoneNumber, null, {
      templateId,
      variables,
      language,
      organizationId,
      leadId,
      messageType: `appointment_${type}`,
      priority: type === 'reminder' ? 'high' : 'normal'
    });
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(recipients, templateId, commonVariables = {}, options = {}) {
    const {
      batchSize = 10,
      batchDelay = 1000,
      organizationId = 'bici-demo'
    } = options;

    const results = [];
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (recipient) => {
        const variables = { ...commonVariables, ...recipient.variables };
        return await this.sendSMS(recipient.phoneNumber, null, {
          templateId,
          variables,
          language: recipient.language || 'en',
          organizationId,
          leadId: recipient.leadId,
          messageType: 'bulk',
          priority: 'normal'
        });
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => result.value || { success: false, error: result.reason }));

      // Delay between batches to respect rate limits
      if (i + batchSize < recipients.length) {
        await this.delay(batchDelay);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    console.log(`📱 Bulk SMS completed: ${successful} sent, ${failed} failed`);

    return {
      total: results.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Process template with variables
   */
  async processTemplate(templateId, variables, language = 'en') {
    const templateKey = `${language}:${templateId}`;
    const template = this.templates.get(templateKey);

    if (!template) {
      // Fallback to English if template not found in requested language
      const fallbackKey = `en:${templateId}`;
      const fallbackTemplate = this.templates.get(fallbackKey);
      
      if (!fallbackTemplate) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      console.warn(`Template ${templateId} not available in ${language}, using English fallback`);
      return this.replaceVariables(fallbackTemplate.body, variables);
    }

    return this.replaceVariables(template.body, variables);
  }

  /**
   * Replace variables in template
   */
  replaceVariables(template, variables) {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(placeholder, value || '');
    });

    // Check for unreplaced variables
    const unreplacedVars = result.match(/{{[^}]+}}/g);
    if (unreplacedVars) {
      console.warn(`Unreplaced variables in template: ${unreplacedVars.join(', ')}`);
      // Replace with empty string or default values
      unreplacedVars.forEach(varMatch => {
        result = result.replace(new RegExp(varMatch.replace(/[{}]/g, '\\$&'), 'g'), '');
      });
    }

    return result.trim();
  }

  /**
   * Validate message before sending
   */
  validateMessage(message) {
    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    if (message.length > 1600) {
      throw new Error('Message too long (max 1600 characters)');
    }

    // Check for potentially problematic content
    const suspiciousPatterns = [
      /\b(click here|urgent|limited time|act now)\b/i,
      /\$\d+/g, // Money amounts without context
    ];

    suspiciousPatterns.forEach(pattern => {
      if (pattern.test(message)) {
        console.warn(`⚠️ Message contains potentially suspicious content: ${message.substring(0, 50)}...`);
      }
    });
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(phoneNumber, organizationId, limit = 10, windowMs = 3600000) {
    const key = `${organizationId}:${phoneNumber}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, []);
    }

    const requests = this.rateLimitStore.get(key);
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    this.rateLimitStore.set(key, recentRequests);

    if (recentRequests.length >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: windowStart + windowMs
      };
    }

    recentRequests.push(now);
    return {
      allowed: true,
      remaining: limit - recentRequests.length,
      resetTime: windowStart + windowMs
    };
  }

  /**
   * Track delivery status
   */
  trackDelivery(messageId, metadata) {
    this.deliveryTracking.set(messageId, {
      ...metadata,
      status: 'sent',
      retryCount: 0,
      lastUpdated: new Date().toISOString()
    });
  }

  /**
   * Update delivery status from webhook
   */
  updateDeliveryStatus(messageId, status, errorCode = null, errorMessage = null) {
    const tracking = this.deliveryTracking.get(messageId);
    if (!tracking) {
      console.warn(`⚠️ No tracking info found for message: ${messageId}`);
      return;
    }

    tracking.status = status;
    tracking.errorCode = errorCode;
    tracking.errorMessage = errorMessage;
    tracking.lastUpdated = new Date().toISOString();

    // Handle failed deliveries
    if (status === 'failed' || status === 'undelivered') {
      this.handleDeliveryFailure(messageId, tracking);
    }

    this.deliveryTracking.set(messageId, tracking);
    
    // Emit status update event
    this.emit('delivery_status_update', {
      messageId,
      status,
      errorCode,
      errorMessage,
      tracking
    });
  }

  /**
   * Handle delivery failure and retry logic
   */
  handleDeliveryFailure(messageId, tracking) {
    const { maxRetries = 3, retryCount = 0 } = tracking;

    if (retryCount >= maxRetries) {
      console.warn(`🛑 SMS ${messageId} exceeded max retries (${maxRetries})`);
      tracking.finalStatus = 'permanently_failed';
      this.emit('sms_permanently_failed', { messageId, tracking });
      return;
    }

    // Check if error is retryable
    if (!this.isRetryableError(tracking.errorCode)) {
      console.warn(`⚠️ SMS ${messageId} not retryable (Error: ${tracking.errorCode})`);
      tracking.finalStatus = 'not_retryable';
      return;
    }

    // Schedule retry
    const retryDelay = Math.pow(2, retryCount) * 60000; // Exponential backoff
    const retryTime = Date.now() + retryDelay;

    this.retryQueue.set(messageId, {
      ...tracking,
      retryTime,
      retryCount: retryCount + 1
    });

    console.log(`🔄 Scheduled SMS retry for ${messageId} in ${retryDelay / 1000} seconds`);
  }

  /**
   * Check if error code is retryable
   */
  isRetryableError(errorCode) {
    const retryableErrors = ['30001', '30003', '30005', '30008'];
    const nonRetryableErrors = ['21211', '21212', '21614'];

    if (nonRetryableErrors.includes(errorCode)) return false;
    if (retryableErrors.includes(errorCode)) return true;

    return false; // Default to not retry
  }

  /**
   * Start retry processor
   */
  startRetryProcessor() {
    setInterval(async () => {
      const now = Date.now();
      const retryableMessages = [];

      for (const [messageId, retryInfo] of this.retryQueue.entries()) {
        if (retryInfo.retryTime <= now) {
          retryableMessages.push([messageId, retryInfo]);
        }
      }

      for (const [messageId, retryInfo] of retryableMessages) {
        await this.processRetry(messageId, retryInfo);
        this.retryQueue.delete(messageId);
      }

    }, 30000); // Check every 30 seconds
  }

  /**
   * Process individual retry
   */
  async processRetry(messageId, retryInfo) {
    try {
      console.log(`🔄 Processing retry for SMS ${messageId} (attempt ${retryInfo.retryCount})`);

      // Re-send the message
      const result = await this.sendSMS(retryInfo.phoneNumber, retryInfo.originalMessage, {
        organizationId: retryInfo.organizationId,
        leadId: retryInfo.leadId,
        messageType: retryInfo.messageType + '_retry',
        priority: 'high',
        maxRetries: retryInfo.maxRetries - retryInfo.retryCount
      });

      if (result.success) {
        console.log(`✅ SMS retry successful: ${messageId} -> ${result.messageId}`);
        this.deliveryTracking.delete(messageId); // Remove old tracking
      }

    } catch (error) {
      console.error(`❌ SMS retry failed for ${messageId}:`, error.message);
    }
  }

  /**
   * Start cleanup jobs
   */
  startCleanupJobs() {
    // Clean up old rate limit entries
    setInterval(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      for (const [key, requests] of this.rateLimitStore.entries()) {
        const recentRequests = requests.filter(timestamp => timestamp > oneHourAgo);
        if (recentRequests.length === 0) {
          this.rateLimitStore.delete(key);
        } else {
          this.rateLimitStore.set(key, recentRequests);
        }
      }
    }, 300000); // Every 5 minutes

    // Clean up old delivery tracking
    setInterval(() => {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      for (const [messageId, tracking] of this.deliveryTracking.entries()) {
        const lastUpdated = new Date(tracking.lastUpdated).getTime();
        if (lastUpdated < oneDayAgo) {
          this.deliveryTracking.delete(messageId);
        }
      }
    }, 3600000); // Every hour
  }

  /**
   * Handle SMS sent event
   */
  handleSMSSent(data) {
    console.log(`📱 SMS sent event received: ${data.messageId}`);
  }

  /**
   * Handle SMS error event
   */
  handleSMSError(data) {
    console.error(`📱 SMS error event received: ${data.phoneNumber} - ${data.error}`);
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats() {
    const stats = {
      total: this.deliveryTracking.size,
      byStatus: {},
      retryQueue: this.retryQueue.size
    };

    for (const tracking of this.deliveryTracking.values()) {
      stats.byStatus[tracking.status] = (stats.byStatus[tracking.status] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get available templates
   */
  getAvailableTemplates(language = null) {
    const templates = {};
    
    for (const [key, template] of this.templates.entries()) {
      const [lang, templateId] = key.split(':');
      
      if (language && lang !== language) continue;
      
      if (!templates[lang]) {
        templates[lang] = {};
      }
      
      templates[lang][templateId] = {
        id: template.id,
        subject: template.subject,
        category: template.category,
        variables: template.variables
      };
    }
    
    return templates;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SMSService;