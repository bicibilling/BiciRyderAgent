/**
 * BICI AI Voice System - Twilio Native Integration with ElevenLabs
 * Handles inbound call routing, personalization webhooks, and SMS automation
 */

const twilio = require('twilio');
const { config } = require('../config');
const { CustomerService } = require('./customer-service');
const { ConversationLogger } = require('./conversation-logger');  
const { SMSAutomation } = require('./sms-automation');
const { normalizePhoneNumber } = require('../utils/phone');

class TwilioIntegration {
  constructor(organizationId = 'bici-main') {
    this.organizationId = organizationId;
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
    this.customerService = new CustomerService(organizationId);
    this.conversationLogger = new ConversationLogger(organizationId);
    this.smsAutomation = new SMSAutomation(organizationId);
    
    // Webhook verification
    this.webhookValidator = twilio.validateRequest;
  }

  /**
   * ElevenLabs Personalization Webhook Handler (SOW Requirement)
   * Called by ElevenLabs when inbound call is received
   */
  async handlePersonalizationWebhook(req, res) {
    const startTime = Date.now();
    
    try {
      const {
        caller_id,
        called_number,
        agent_id,
        call_sid,
        conversation_id
      } = req.body;

      console.log(`📞 Inbound call from ${caller_id} to ${called_number}`);

      // Validate webhook (security)
      if (!this.validateElevenLabsWebhook(req)) {
        return res.status(401).json({ error: 'Unauthorized webhook' });
      }

      // Normalize phone number for consistent lookup
      const normalizedPhone = normalizePhoneNumber(caller_id);
      
      // Get organization from called number
      const organization = await this.getOrganizationByPhoneNumber(called_number);
      
      if (!organization) {
        console.error(`❌ No organization found for number ${called_number}`);
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Customer identification and context building
      const customerData = await this.customerService.identifyCustomer(
        normalizedPhone, 
        organization.id
      );

      // Build comprehensive dynamic variables for personalization
      const dynamicVariables = await this.buildDynamicVariables(
        customerData,
        normalizedPhone,
        organization
      );

      // Build conversation configuration overrides
      const conversationConfig = await this.buildConversationConfig(
        customerData,
        organization
      );

      // Log call initiation
      await this.conversationLogger.logCallStart({
        conversation_id,
        call_sid,
        phone_number: normalizedPhone,
        organization_id: organization.id,
        customer_data: customerData,
        call_direction: 'inbound'
      });

      // Create or update lead record
      if (customerData) {
        await this.customerService.updateLeadInteraction(customerData.id, {
          last_contact_date: new Date().toISOString(),
          interaction_count: (customerData.interaction_count || 0) + 1,
          call_sid: call_sid,
          conversation_id: conversation_id
        });
      } else {
        // Create new lead from caller ID
        await this.customerService.createLeadFromPhone(normalizedPhone, {
          organization_id: organization.id,
          call_sid: call_sid,
          conversation_id: conversation_id,
          lead_source: 'inbound_call'
        });
      }

      const responseTime = Date.now() - startTime;
      console.log(`✅ Personalization webhook processed in ${responseTime}ms`);

      // Return personalization data to ElevenLabs
      return res.json({
        dynamic_variables: dynamicVariables,
        conversation_config_override: conversationConfig,
        webhook_processing_time: responseTime
      });

    } catch (error) {
      console.error('❌ Personalization webhook error:', error);
      
      // Return minimal safe configuration on error
      return res.json({
        dynamic_variables: {
          customer_name: 'Valued Customer',
          organization_name: config.business.organization.name,
          store_hours: await this.getCurrentStoreHours()
        },
        conversation_config_override: {
          agent: {
            language: config.business.organization.defaultLanguage
          }
        }
      });
    }
  }

  /**
   * Build comprehensive dynamic variables for call personalization
   */
  async buildDynamicVariables(customerData, phoneNumber, organization) {
    const conversationHistory = await this.conversationLogger.getConversationHistory(
      phoneNumber,
      organization.id,
      5 // Last 5 conversations
    );

    const currentPromotions = await this.getCurrentPromotions(organization.id);
    const storeHours = await this.getCurrentStoreHours();

    return {
      // Customer Context
      customer_name: customerData?.customer_name || 'Valued Customer',
      customer_phone: phoneNumber,
      customer_email: customerData?.email || '',
      customer_tier: customerData?.customer_tier || 'Regular',
      previous_purchases: JSON.stringify(customerData?.purchase_history || []),
      
      // Lead Information
      lead_status: customerData?.lead_status || 'New Lead',
      bike_interest: JSON.stringify(customerData?.bike_interest || {}),
      budget_range: customerData?.budget_range || '',
      timeline: customerData?.timeline || '',
      
      // Conversation Context
      conversation_context: this.buildConversationContext(conversationHistory),
      previous_summary: customerData?.previous_summary || 'No previous calls',
      interaction_count: (customerData?.interaction_count || 0).toString(),
      last_contact_date: customerData?.last_contact_date || 'Never',
      
      // Business Context
      organization_name: organization.name,
      organization_id: organization.id,
      store_hours: storeHours,
      store_address: config.business.store.address,
      store_phone: config.business.store.phone,
      current_promotions: JSON.stringify(currentPromotions),
      
      // Call Context
      caller_type: 'inbound',
      preferred_language: customerData?.preferred_language || config.business.organization.defaultLanguage,
      timezone: organization.timezone || config.business.organization.timezone,
      
      // Current datetime context
      current_time: new Date().toISOString(),
      current_day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      store_open_status: await this.getStoreOpenStatus()
    };
  }

  /**
   * Build conversation configuration overrides based on customer context
   */
  async buildConversationConfig(customerData, organization) {
    const preferredLanguage = customerData?.preferred_language || organization.default_language || 'en';
    
    return {
      agent: {
        language: preferredLanguage,
        first_message: this.getLocalizedFirstMessage(preferredLanguage, customerData),
        
        // Voice configuration based on customer preferences
        voice_config: {
          voice_id: this.getVoiceIdForLanguage(preferredLanguage),
          stability: config.elevenlabs.voiceConfig.stability,
          similarity_boost: config.elevenlabs.voiceConfig.similarity,
          speed: config.elevenlabs.voiceConfig.speed
        }
      },
      
      // Enable/disable features based on customer profile
      features: {
        appointment_booking: config.features.calendarBooking,
        human_escalation: config.features.humanEscalation,
        order_lookup: true,
        product_recommendations: true
      }
    };
  }

  /**
   * Handle Twilio call status webhooks
   */
  async handleCallStatusWebhook(req, res) {
    try {
      // Validate Twilio webhook signature
      if (!this.validateTwilioWebhook(req)) {
        return res.status(401).send('Unauthorized');
      }

      const {
        CallSid,
        CallStatus,
        From,
        To,
        Duration,
        RecordingUrl
      } = req.body;

      console.log(`📞 Call status update: ${CallSid} - ${CallStatus}`);

      // Log call status change
      await this.conversationLogger.logCallStatusChange({
        call_sid: CallSid,
        status: CallStatus,
        duration: Duration,
        recording_url: RecordingUrl,
        organization_id: this.organizationId
      });

      // Handle call completion
      if (CallStatus === 'completed') {
        await this.handleCallCompletion(CallSid, From, Duration);
      }

      // Handle call failures
      if (['failed', 'busy', 'no-answer'].includes(CallStatus)) {
        await this.handleCallFailure(CallSid, From, CallStatus);
      }

      res.status(200).send('OK');

    } catch (error) {
      console.error('❌ Call status webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Handle call completion - trigger follow-up actions
   */
  async handleCallCompletion(callSid, fromNumber, duration) {
    const normalizedPhone = normalizePhoneNumber(fromNumber);
    
    // Get call conversation data
    const conversation = await this.conversationLogger.getConversationByCallSid(callSid);
    
    if (conversation) {
      // Update lead with call completion
      await this.customerService.updateLeadCallCompletion(conversation.lead_id, {
        call_duration: duration,
        call_completed_at: new Date().toISOString(),
        call_status: 'completed'
      });

      // Trigger automated follow-up SMS if enabled
      if (config.features.smsAutomation) {
        await this.smsAutomation.scheduleFollowUpSMS(normalizedPhone, {
          call_duration: duration,
          conversation_summary: conversation.summary,
          lead_data: conversation.customer_data
        });
      }

      // Classify call and update analytics
      const classification = await this.classifyCall(conversation);
      await this.conversationLogger.updateCallClassification(callSid, classification);
      
      console.log(`✅ Call completion processed for ${callSid}`);
    }
  }

  /**
   * Handle call failures - log and potentially retry
   */
  async handleCallFailure(callSid, fromNumber, status) {
    const normalizedPhone = normalizePhoneNumber(fromNumber);
    
    await this.conversationLogger.logCallFailure({
      call_sid: callSid,
      phone_number: normalizedPhone,
      failure_reason: status,
      organization_id: this.organizationId
    });

    // For outbound calls, potentially schedule retry
    if (status === 'busy' || status === 'no-answer') {
      await this.smsAutomation.scheduleMissedCallSMS(normalizedPhone, {
        failure_reason: status,
        retry_available: true
      });
    }

    console.log(`📞 Call failure handled for ${callSid}: ${status}`);
  }

  /**
   * Utility Methods
   */

  validateElevenLabsWebhook(req) {
    // Implement ElevenLabs webhook signature validation
    const signature = req.headers['x-elevenlabs-signature'];
    if (!signature || !config.elevenlabs.webhookSecret) {
      return false;
    }
    
    // Add actual signature validation logic here
    return true; // Simplified for now
  }

  validateTwilioWebhook(req) {
    const signature = req.headers['x-twilio-signature'];
    const url = `${config.server.baseUrl}${req.originalUrl}`;
    
    return this.webhookValidator(
      config.twilio.authToken,
      signature,
      url,
      req.body
    );
  }

  async getOrganizationByPhoneNumber(phoneNumber) {
    // In a real implementation, this would query the database
    // For now, return default organization
    return {
      id: this.organizationId,
      name: config.business.organization.name,
      phone_number: phoneNumber,
      timezone: config.business.organization.timezone,
      default_language: config.business.organization.defaultLanguage
    };
  }

  buildConversationContext(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'This is the customer\'s first call to our store.';
    }

    const recentCalls = conversationHistory.slice(0, 3);
    return recentCalls.map(call => 
      `Previous call: ${call.summary || 'General inquiry'} (${call.call_date})`
    ).join('; ');
  }

  async getCurrentStoreHours() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const hours = isWeekend ? config.business.hours.weekends : config.business.hours.weekdays;
    
    return `${hours.open} - ${hours.close}`;
  }

  async getStoreOpenStatus() {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const hours = isWeekend ? config.business.hours.weekends : config.business.hours.weekdays;
    
    const isOpen = currentTime >= hours.open && currentTime <= hours.close;
    
    return isOpen ? 'open' : 'closed';
  }

  async getCurrentPromotions(organizationId) {
    // In a real implementation, this would query current promotions
    return [
      {
        name: 'Winter Bike Sale',
        discount: '20% off all mountain bikes',
        expires: '2024-02-29'
      }
    ];
  }

  getLocalizedFirstMessage(language, customerData) {
    const customerName = customerData?.customer_name || '';
    
    if (language === 'fr') {
      return customerName 
        ? `Bonjour ${customerName}! Je suis l'assistant IA de Bici. Comment puis-je vous aider aujourd'hui?`
        : `Bonjour! Je suis l'assistant IA de Bici. Comment puis-je vous aider avec vos besoins de vélo?`;
    }
    
    return customerName
      ? `Hi ${customerName}! I'm Bici's AI assistant. How can I help you today?`
      : `Hi! I'm Bici's AI assistant. How can I help you with your biking needs today?`;
  }

  getVoiceIdForLanguage(language) {
    // Return appropriate voice ID based on language
    if (language === 'fr') {
      return process.env.ELEVENLABS_VOICE_ID_FRENCH || config.elevenlabs.voiceId;
    }
    
    return config.elevenlabs.voiceId;
  }

  async classifyCall(conversation) {
    // Simple classification based on conversation content
    // In a real implementation, this could use AI/ML for better classification
    const content = conversation.content?.toLowerCase() || '';
    
    if (content.includes('order') || content.includes('status')) {
      return 'order_inquiry';
    } else if (content.includes('repair') || content.includes('service')) {
      return 'service_request';
    } else if (content.includes('bike') || content.includes('product')) {
      return 'product_inquiry';
    } else if (content.includes('appointment') || content.includes('book')) {
      return 'appointment_booking';
    } else {
      return 'general_inquiry';
    }
  }
}

module.exports = { TwilioIntegration };