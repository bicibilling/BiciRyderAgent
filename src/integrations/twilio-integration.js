/**
 * Twilio Integration with ElevenLabs Personalization
 * Handles inbound/outbound calls with personalization webhooks
 */

import twilio from 'twilio';
import fetch from 'node-fetch';

export class TwilioIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.agentId = process.env.ELEVENLABS_AGENT_ID;
    this.phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  }

  /**
   * Set up Twilio webhook endpoint for ElevenLabs integration
   */
  setupTwilioWebhook() {
    return {
      // Twilio webhook URL for incoming calls
      webhookUrl: `${process.env.BASE_URL}/api/webhooks/twilio/incoming`,
      
      // ElevenLabs personalization webhook  
      personalizationWebhook: `${process.env.BASE_URL}/api/webhooks/elevenlabs/twilio-personalization`,
      
      // Status callback URL
      statusCallbackUrl: `${process.env.BASE_URL}/api/webhooks/twilio/status`
    };
  }

  /**
   * Handle incoming Twilio call webhook
   */
  async handleIncomingCall(req, res) {
    try {
      const { From: callerPhone, To: calledNumber, CallSid } = req.body;
      
      console.log(`📞 Incoming call from ${callerPhone} to ${calledNumber}, CallSid: ${CallSid}`);
      
      // Normalize phone number
      const normalizedPhone = this.normalizePhoneNumber(callerPhone);
      
      // Get or create lead
      const leadId = await this.getOrCreateLead(normalizedPhone, this.organizationId);
      
      // Look up customer data for personalization
      const customerData = await this.lookupCustomer(normalizedPhone, this.organizationId);
      
      // Log call in database
      await this.logIncomingCall({
        call_sid: CallSid,
        caller_phone: normalizedPhone,
        called_number: calledNumber,
        lead_id: leadId,
        organization_id: this.organizationId,
        status: 'ringing',
        created_at: new Date().toISOString()
      });
      
      // Route call to ElevenLabs using native Twilio integration
      const twiml = this.createElevenLabsTwiML({
        callSid: CallSid,
        callerPhone: normalizedPhone,
        leadId: leadId,
        customerData: customerData
      });
      
      res.type('text/xml');
      res.send(twiml);
      
    } catch (error) {
      console.error('Error handling incoming call:', error);
      
      // Fallback TwiML for errors
      const errorTwiml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
        <Response>
          <Say voice=\"alice\">Sorry, we're experiencing technical difficulties. Please try calling back in a few minutes.</Say>
          <Hangup/>
        </Response>`;</n>
      
      res.type('text/xml');
      res.send(errorTwiml);
    }
  }

  /**
   * Create TwiML to route call to ElevenLabs
   */
  createElevenLabsTwiML({ callSid, callerPhone, leadId, customerData }) {
    // Use ElevenLabs native Twilio integration
    const twiml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
      <Response>
        <Connect>
          <Stream url=\"wss://api.elevenlabs.io/v1/convai/conversation/twilio\">
            <Parameter name=\"agent_id\" value=\"${this.agentId}\" />
            <Parameter name=\"authorization\" value=\"Bearer ${this.elevenlabsApiKey}\" />
            <Parameter name=\"call_sid\" value=\"${callSid}\" />
            <Parameter name=\"caller_phone\" value=\"${callerPhone}\" />
            <Parameter name=\"lead_id\" value=\"${leadId}\" />
            <Parameter name=\"organization_id\" value=\"${this.organizationId}\" />
          </Stream>
        </Connect>
      </Response>`;
    
    return twiml;
  }

  /**
   * ElevenLabs personalization webhook handler
   * Called by ElevenLabs to get dynamic variables for personalization
   */
  async handlePersonalizationWebhook(req, res) {
    try {
      const { 
        caller_id: callerPhone, 
        called_number: calledNumber, 
        agent_id: agentId, 
        call_sid: callSid 
      } = req.body;
      
      console.log(`🎯 Personalization webhook for ${callerPhone}, CallSid: ${callSid}`);
      
      // Get organization from called number
      const organization = await this.getOrganizationByPhoneNumber(calledNumber);
      
      if (!organization) {
        throw new Error(`No organization found for phone number: ${calledNumber}`);
      }
      
      // Look up customer data
      const customerData = await this.lookupCustomer(callerPhone, organization.id);
      
      // Get conversation history
      const conversationHistory = await this.getConversationHistory(callerPhone, organization.id);
      
      // Build dynamic variables for personalization
      const dynamicVariables = await this.buildDynamicVariables({
        customerData,
        callerPhone,
        organization,
        conversationHistory,
        callSid
      });
      
      // Get current store information
      const storeInfo = await this.getCurrentStoreInfo(organization.id);
      
      // Build conversation config overrides
      const conversationConfigOverride = {
        agent: {
          language: customerData?.preferred_language || 'en',
          first_message: this.getPersonalizedFirstMessage(customerData, organization)
        }
      };
      
      // Return personalization data
      res.json({
        dynamic_variables: dynamicVariables,
        conversation_config_override: conversationConfigOverride,
        success: true
      });
      
    } catch (error) {
      console.error('Personalization webhook error:', error);
      
      // Return fallback data
      res.json({
        dynamic_variables: this.getFallbackDynamicVariables(),
        conversation_config_override: {
          agent: {
            language: 'en',
            first_message: \"Hi! I'm Bici's AI assistant. How can I help you today?\"
          }
        },
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Build comprehensive dynamic variables for personalization
   */
  async buildDynamicVariables({ customerData, callerPhone, organization, conversationHistory, callSid }) {
    const variables = {
      // Customer context
      customer_name: customerData?.name || 'Valued Customer',
      customer_phone: callerPhone,
      customer_email: customerData?.email || '',
      customer_tier: customerData?.tier || 'New',
      previous_purchases: JSON.stringify(customerData?.purchase_history || []),
      
      // Conversation context
      conversation_context: this.buildConversationContext(conversationHistory),
      previous_summary: customerData?.previous_summary || 'No previous interactions',
      lead_status: customerData?.lead_status || 'New',
      interaction_count: conversationHistory.length.toString(),
      last_contact_date: customerData?.last_contact || 'Never',
      
      // Business context
      organization_name: organization.name || 'Bici Bike Store',
      organization_id: organization.id,
      store_hours: await this.getCurrentStoreHours(organization.id),
      current_promotions: await this.getCurrentPromotions(organization.id),
      
      // Call context
      caller_type: 'inbound',
      call_reason: 'general_inquiry',
      urgency_level: 'medium',
      preferred_language: customerData?.preferred_language || 'en',
      
      // Additional context
      call_sid: callSid,
      season: this.getCurrentSeason(),
      weather_context: await this.getWeatherContext(organization.location),
      business_hours_status: await this.getBusinessHoursStatus(organization.id)
    };
    
    return variables;
  }

  /**
   * Get personalized first message based on customer data
   */
  getPersonalizedFirstMessage(customerData, organization) {
    const language = customerData?.preferred_language || 'en';
    const customerName = customerData?.name;
    
    const messages = {
      en: {
        new: \"Hi! I'm Bici's AI assistant. How can I help you with your biking needs today?\",
        returning: customerName 
          ? `Hi ${customerName}! Great to hear from you again. How can I help you today?`
          : \"Hi! Welcome back to Bici. How can I help you today?\",
        vip: customerName
          ? `Hi ${customerName}! As one of our valued VIP customers, how can I assist you today?`
          : \"Hi! As one of our valued customers, how can I assist you today?\"
      },
      fr: {
        new: \"Bonjour! Je suis l'assistant IA de Bici. Comment puis-je vous aider avec vos besoins de vélo aujourd'hui?\",
        returning: customerName
          ? `Bonjour ${customerName}! Ravi de vous entendre à nouveau. Comment puis-je vous aider aujourd'hui?`
          : \"Bonjour! Bienvenue de retour chez Bici. Comment puis-je vous aider aujourd'hui?\",
        vip: customerName
          ? `Bonjour ${customerName}! En tant que client VIP précieux, comment puis-je vous aider aujourd'hui?`
          : \"Bonjour! En tant que client précieux, comment puis-je vous aider aujourd'hui?\"
      }
    };
    
    const tier = customerData?.tier?.toLowerCase() || 'new';
    const messageType = tier === 'vip' ? 'vip' : (tier === 'new' ? 'new' : 'returning');
    
    return messages[language]?.[messageType] || messages.en.new;
  }

  /**
   * Handle Twilio status callbacks
   */
  async handleStatusCallback(req, res) {
    try {
      const { CallSid, CallStatus, Duration, From, To } = req.body;
      
      console.log(`📊 Call status update: ${CallSid} - ${CallStatus}`);
      
      // Update call record in database
      await this.updateCallStatus({
        call_sid: CallSid,
        status: CallStatus,
        duration: Duration || 0,
        ended_at: ['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus) 
          ? new Date().toISOString() 
          : null
      });
      
      // If call ended, trigger post-call processing
      if (['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
        await this.handleCallEnded({
          callSid: CallSid,
          status: CallStatus,
          duration: Duration,
          callerPhone: From,
          calledNumber: To
        });
      }
      
      res.status(200).send('OK');
      
    } catch (error) {
      console.error('Status callback error:', error);
      res.status(500).send('Error processing status callback');
    }
  }

  /**
   * Initiate outbound call using ElevenLabs Twilio API
   */
  async initiateOutboundCall(callData) {
    const {
      phoneNumber,
      leadId,
      callReason,
      priority = 'medium',
      scheduledTime = null
    } = callData;
    
    try {
      console.log(`📞 Initiating outbound call to ${phoneNumber} for lead ${leadId}`);
      
      // Get customer context
      const customerData = await this.getCustomerContext(phoneNumber, leadId);
      
      // Build conversation initiation data
      const conversationInitData = {
        dynamic_variables: await this.buildOutboundDynamicVariables(customerData, callReason),
        conversation_config_override: this.buildConversationOverrides(customerData, callReason)
      };
      
      // Make outbound call via ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenlabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          agent_phone_number_id: this.phoneNumberId,
          to_number: phoneNumber,
          conversation_initiation_client_data: conversationInitData
        })
      });
      
      const result = await response.json();
      
      if (result.conversation_id) {
        // Log outbound call
        await this.logOutboundCall({
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          lead_id: leadId,
          phone_number: phoneNumber,
          call_reason: callReason,
          priority: priority,
          organization_id: this.organizationId,
          initiated_at: new Date().toISOString()
        });
        
        return {
          success: true,
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          message: `Outbound call initiated for ${callReason}`
        };
      } else {
        throw new Error('Failed to initiate outbound call');
      }
      
    } catch (error) {
      console.error('Outbound call error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build dynamic variables for outbound calls
   */
  async buildOutboundDynamicVariables(customerData, callReason) {
    const conversationHistory = await this.getConversationHistory(
      customerData.phoneNumber, 
      this.organizationId
    );
    
    return {
      // Customer context
      customer_name: customerData.name || 'Valued Customer',
      customer_phone: customerData.phoneNumber,
      customer_email: customerData.email || '',
      customer_tier: customerData.tier || 'Regular',
      previous_purchases: JSON.stringify(customerData.purchaseHistory || []),
      
      // Conversation context
      conversation_context: this.buildConversationContext(conversationHistory),
      previous_summary: customerData.previousSummary || 'No previous calls',
      lead_status: customerData.leadStatus || 'Active Lead',
      interaction_count: conversationHistory.length.toString(),
      last_contact_date: customerData.lastContact || 'Never',
      
      // Business context
      organization_name: await this.getOrganizationName(),
      organization_id: this.organizationId,
      store_hours: await this.getCurrentStoreHours(),
      current_promotions: await this.getCurrentPromotions(),
      
      // Call context
      caller_type: 'outbound',
      call_reason: callReason,
      urgency_level: this.determineUrgency(callReason),
      preferred_language: customerData.preferredLanguage || 'en'
    };
  }

  /**
   * Utility methods
   */
  normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters and add country code if needed
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `+1${digits}`; // Add North American country code
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return phoneNumber; // Return as-is if can't normalize
  }

  buildConversationContext(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'First-time caller';
    }
    
    const lastConversation = conversationHistory[conversationHistory.length - 1];
    const summary = lastConversation.summary || 'Previous interaction logged';
    
    return `Previous conversation: ${summary}. Total interactions: ${conversationHistory.length}`;
  }

  getCurrentSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';  
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  }

  determineUrgency(callReason) {
    const urgencyMap = {
      'service_reminder': 'high',
      'appointment_confirmation': 'high',
      'warranty_issue': 'high',
      'sales_follow_up': 'medium',
      'general_follow_up': 'low'
    };
    
    return urgencyMap[callReason] || 'medium';
  }

  getFallbackDynamicVariables() {
    return {
      customer_name: 'Valued Customer',
      customer_phone: '',
      customer_email: '',
      customer_tier: 'New',
      previous_purchases: '[]',
      conversation_context: 'First-time caller',
      previous_summary: 'No previous interactions',
      lead_status: 'New',
      interaction_count: '0',
      last_contact_date: 'Never',
      organization_name: 'Bici Bike Store',
      organization_id: this.organizationId,
      store_hours: 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
      current_promotions: 'Ask about our current deals!',
      caller_type: 'inbound',
      call_reason: 'general_inquiry',
      urgency_level: 'medium',
      preferred_language: 'en'
    };
  }

  /**
   * Database integration methods (to be implemented with your specific database)
   */
  async getOrganizationByPhoneNumber(phoneNumber) {
    // Implement database lookup
    return {
      id: this.organizationId,
      name: 'Bici Bike Store',
      phone: phoneNumber,
      location: 'Toronto, ON'
    };
  }

  async lookupCustomer(phoneNumber, organizationId) {
    // Implement customer lookup from database/CRM
    return null; // Return customer data if found
  }

  async getOrCreateLead(phoneNumber, organizationId) {
    // Implement lead creation/retrieval
    return `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getConversationHistory(phoneNumber, organizationId) {
    // Implement conversation history retrieval
    return [];
  }

  async getCurrentStoreHours(organizationId) {
    // Implement store hours lookup
    return 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM';
  }

  async getCurrentPromotions(organizationId) {
    // Implement promotions lookup
    return 'Ask about our summer bike sale - up to 20% off!';
  }

  async logIncomingCall(callData) {
    // Implement call logging
    console.log('Logging incoming call:', callData);
  }

  async logOutboundCall(callData) {
    // Implement outbound call logging
    console.log('Logging outbound call:', callData);
  }

  async updateCallStatus(statusData) {
    // Implement call status updates
    console.log('Updating call status:', statusData);
  }

  async handleCallEnded(callData) {
    // Implement post-call processing
    console.log('Call ended, processing:', callData);
  }
}

export default TwilioIntegration;