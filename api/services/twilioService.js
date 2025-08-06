/**
 * Twilio Service
 * Integration with Twilio for SMS and call management
 */

const twilio = require('twilio');
const { EventEmitter } = require('events');

class TwilioService extends EventEmitter {
  constructor() {
    super();
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.client = null;
    this.isInitialized = false;
    
    this.smsTemplates = new Map();
    this.callHistory = new Map();
    this.smsHistory = new Map();
  }
  
  /**
   * Initialize Twilio service
   */
  async initialize() {
    if (!this.accountSid || !this.authToken) {
      console.warn('⚠️  Twilio credentials not provided');
      return false;
    }
    
    try {
      this.client = twilio(this.accountSid, this.authToken);
      
      // Test connection by fetching account info
      const account = await this.client.api.accounts(this.accountSid).fetch();
      
      if (account.status === 'active') {
        console.log('✅ Twilio service initialized');
        this.isInitialized = true;
        this.initializeSMSTemplates();
        return true;
      }
      
      throw new Error('Twilio account not active');
      
    } catch (error) {
      console.error('❌ Twilio initialization failed:', error.message);
      return false;
    }
  }
  
  /**
   * Initialize SMS templates
   */
  initializeSMSTemplates() {
    const templates = {
      welcome: {
        en: 'Welcome to Bici Bike Store! Thanks for your interest. How can we help you today?',
        fr: 'Bienvenue chez Bici Bike Store! Merci pour votre intérêt. Comment pouvons-nous vous aider aujourd\'hui?'
      },
      
      appointment_confirmation: {
        en: 'Your {{service_type}} appointment is confirmed for {{date_time}}. Address: {{store_address}}. Questions? Call us!',
        fr: 'Votre rendez-vous {{service_type}} est confirmé pour {{date_time}}. Adresse: {{store_address}}. Questions? Appelez-nous!'
      },
      
      appointment_reminder: {
        en: 'Reminder: Your {{service_type}} appointment is tomorrow at {{time}}. See you then!',
        fr: 'Rappel: Votre rendez-vous {{service_type}} est demain à {{time}}. À bientôt!'
      },
      
      follow_up: {
        en: 'Hi {{customer_name}}! Thanks for calling Bici. Did you have any other questions about {{topic}}?',
        fr: 'Salut {{customer_name}}! Merci d\'avoir appelé Bici. Aviez-vous d\'autres questions sur {{topic}}?'
      },
      
      order_status: {
        en: 'Your order #{{order_number}} status: {{status}}. {{details}} Track: {{tracking_url}}',
        fr: 'Statut de votre commande #{{order_number}}: {{status}}. {{details}} Suivi: {{tracking_url}}'
      },
      
      promotion: {
        en: '🚴‍♂️ Special offer! {{discount}}% off {{product_category}} this week. Visit us or call to learn more!',
        fr: '🚴‍♂️ Offre spéciale! {{discount}}% de réduction sur {{product_category}} cette semaine. Visitez-nous ou appelez!'
      },
      
      store_hours: {
        en: 'Bici store hours: {{hours}}. Address: {{address}}. Phone: {{phone}}',
        fr: 'Heures d\'ouverture Bici: {{hours}}. Adresse: {{address}}. Téléphone: {{phone}}'
      },
      
      service_complete: {
        en: 'Your {{service_type}} is complete! Pick up anytime during store hours. Total: ${{amount}}',
        fr: 'Votre {{service_type}} est terminé! Récupération pendant les heures d\'ouverture. Total: {{amount}}$'
      }
    };
    
    Object.entries(templates).forEach(([templateId, translations]) => {
      this.smsTemplates.set(templateId, translations);
    });
  }
  
  /**
   * Send SMS message
   */
  async sendSMS(phoneNumber, templateId, variables = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }
    
    const {
      language = 'en',
      scheduledTime = null,
      priority = 'normal'
    } = options;
    
    try {
      // Get template
      const template = this.smsTemplates.get(templateId);
      if (!template) {
        throw new Error(`SMS template not found: ${templateId}`);
      }
      
      // Get message text in specified language
      let messageText = template[language] || template['en'];
      if (!messageText) {
        throw new Error(`Template ${templateId} not available in language ${language}`);
      }
      
      // Replace variables
      messageText = this.replaceTemplateVariables(messageText, variables);
      
      // Send message
      const messageOptions = {
        body: messageText,
        from: this.phoneNumber,
        to: phoneNumber
      };
      
      // Schedule message if specified
      if (scheduledTime) {
        messageOptions.sendAt = new Date(scheduledTime);
        messageOptions.scheduleType = 'fixed';
      }
      
      const message = await this.client.messages.create(messageOptions);
      
      // Store in history
      this.storeSMSHistory({
        messageId: message.sid,
        phoneNumber,
        templateId,
        language,
        variables,
        messageText,
        status: message.status,
        sentAt: new Date().toISOString(),
        scheduledTime,
        priority
      });
      
      console.log(`📱 SMS sent to ${phoneNumber}: ${templateId}`);
      
      this.emit('sms_sent', {
        messageId: message.sid,
        phoneNumber,
        templateId,
        status: message.status
      });
      
      return {
        success: true,
        messageId: message.sid,
        status: message.status,
        messageText
      };
      
    } catch (error) {
      console.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
      
      this.emit('sms_error', {
        phoneNumber,
        templateId,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(recipients, templateId, commonVariables = {}, options = {}) {
    const results = [];
    const batchSize = 10; // Twilio rate limiting
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(async (recipient) => {
        const variables = { ...commonVariables, ...recipient.variables };
        return await this.sendSMS(recipient.phoneNumber, templateId, variables, {
          ...options,
          language: recipient.language || options.language
        });
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => result.value || { success: false, error: result.reason }));
      
      // Rate limiting delay
      if (i + batchSize < recipients.length) {
        await this.delay(1000);
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
   * Get SMS delivery status
   */
  async getSMSStatus(messageId) {
    try {
      const message = await this.client.messages(messageId).fetch();
      
      return {
        messageId,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
      
    } catch (error) {
      console.error(`Failed to get SMS status for ${messageId}:`, error.message);
      return {
        messageId,
        status: 'unknown',
        error: error.message
      };
    }
  }
  
  /**
   * Handle incoming SMS (webhook handler)
   */
  handleIncomingSMS(req, res) {
    const { From, To, Body, MessageSid } = req.body;
    
    console.log(`📱 Incoming SMS from ${From}: "${Body}"`);
    
    // Store incoming SMS
    this.storeSMSHistory({
      messageId: MessageSid,
      phoneNumber: From,
      direction: 'inbound',
      messageText: Body,
      receivedAt: new Date().toISOString()
    });
    
    this.emit('sms_received', {
      from: From,
      to: To,
      body: Body,
      messageId: MessageSid
    });
    
    // Auto-respond based on content
    this.processIncomingSMS(From, Body);
    
    // Return TwiML response
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
  
  /**
   * Process incoming SMS for auto-responses
   */
  async processIncomingSMS(phoneNumber, messageBody) {
    const lowerBody = messageBody.toLowerCase();
    
    // Auto-response patterns
    if (lowerBody.includes('hours') || lowerBody.includes('open')) {
      await this.sendSMS(phoneNumber, 'store_hours', {
        hours: 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
        address: '123 Main St, Toronto',
        phone: '(555) 123-4567'
      });
    } else if (lowerBody.includes('stop') || lowerBody.includes('unsubscribe')) {
      // Handle opt-out
      await this.handleSMSOptOut(phoneNumber);
    } else if (lowerBody.includes('help')) {
      await this.sendSMS(phoneNumber, 'welcome');
    }
  }
  
  /**
   * Handle SMS opt-out
   */
  async handleSMSOptOut(phoneNumber) {
    try {
      // In production, update database to mark as opted out
      console.log(`📱 SMS opt-out for ${phoneNumber}`);
      
      this.emit('sms_optout', { phoneNumber });
      
      // Send confirmation
      await this.sendSMS(phoneNumber, 'optout_confirmation', {}, {
        bypassOptOut: true // Send this even if opted out
      });
      
    } catch (error) {
      console.error(`Failed to process opt-out for ${phoneNumber}:`, error.message);
    }
  }
  
  /**
   * Make outbound call (for human agents)
   */
  async makeCall(phoneNumber, agentNumber, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }
    
    try {
      const call = await this.client.calls.create({
        url: options.webhookUrl || `${process.env.BASE_URL}/api/webhooks/twilio/call-status`,
        to: phoneNumber,
        from: this.phoneNumber,
        record: options.record !== false,
        recordingStatusCallback: options.recordingCallback,
        statusCallback: options.statusCallback,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST'
      });
      
      // Store call history
      this.storeCallHistory({
        callId: call.sid,
        from: this.phoneNumber,
        to: phoneNumber,
        agentNumber,
        status: call.status,
        direction: 'outbound',
        startedAt: new Date().toISOString(),
        options
      });
      
      console.log(`📞 Outbound call initiated: ${call.sid} to ${phoneNumber}`);
      
      this.emit('call_initiated', {
        callId: call.sid,
        phoneNumber,
        status: call.status
      });
      
      return {
        success: true,
        callId: call.sid,
        status: call.status
      };
      
    } catch (error) {
      console.error(`Failed to make call to ${phoneNumber}:`, error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get call status
   */
  async getCallStatus(callId) {
    try {
      const call = await this.client.calls(callId).fetch();
      
      return {
        callId,
        status: call.status,
        direction: call.direction,
        from: call.from,
        to: call.to,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        price: call.price,
        priceUnit: call.priceUnit
      };
      
    } catch (error) {
      console.error(`Failed to get call status for ${callId}:`, error.message);
      return {
        callId,
        status: 'unknown',
        error: error.message
      };
    }
  }
  
  /**
   * Get phone number info
   */
  async getPhoneNumberInfo(phoneNumber) {
    try {
      const lookup = await this.client.lookups.v1.phoneNumbers(phoneNumber).fetch({
        type: ['carrier', 'caller-name']
      });
      
      return {
        phoneNumber: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        carrier: lookup.carrier,
        callerName: lookup.callerName,
        nationalFormat: lookup.nationalFormat
      };
      
    } catch (error) {
      console.error(`Failed to lookup phone number ${phoneNumber}:`, error.message);
      return {
        phoneNumber,
        error: error.message
      };
    }
  }
  
  /**
   * Replace template variables in message text
   */
  replaceTemplateVariables(template, variables) {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return result;
  }
  
  /**
   * Store SMS history
   */
  storeSMSHistory(smsData) {
    const key = `${smsData.phoneNumber}_${Date.now()}`;
    this.smsHistory.set(key, {
      ...smsData,
      storedAt: new Date().toISOString()
    });
    
    // Keep only recent history (last 1000 messages)
    if (this.smsHistory.size > 1000) {
      const oldestKey = this.smsHistory.keys().next().value;
      this.smsHistory.delete(oldestKey);
    }
  }
  
  /**
   * Store call history
   */
  storeCallHistory(callData) {
    this.callHistory.set(callData.callId, {
      ...callData,
      storedAt: new Date().toISOString()
    });
    
    // Keep only recent history (last 1000 calls)
    if (this.callHistory.size > 1000) {
      const oldestKey = this.callHistory.keys().next().value;
      this.callHistory.delete(oldestKey);
    }
  }
  
  /**
   * Get SMS history for phone number
   */
  getSMSHistory(phoneNumber, limit = 50) {
    const history = [];
    
    for (const [key, sms] of this.smsHistory.entries()) {
      if (sms.phoneNumber === phoneNumber) {
        history.push(sms);
      }
      
      if (history.length >= limit) break;
    }
    
    return history.sort((a, b) => new Date(b.storedAt) - new Date(a.storedAt));
  }
  
  /**
   * Get call history for phone number
   */
  getCallHistory(phoneNumber, limit = 50) {
    const history = [];
    
    for (const [key, call] of this.callHistory.entries()) {
      if (call.to === phoneNumber || call.from === phoneNumber) {
        history.push(call);
      }
      
      if (history.length >= limit) break;
    }
    
    return history.sort((a, b) => new Date(b.storedAt) - new Date(a.storedAt));
  }
  
  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TwilioService;