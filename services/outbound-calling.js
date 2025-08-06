/**
 * BICI AI Voice System - Outbound Calling Manager
 * ElevenLabs-powered outbound calls with comprehensive context
 */

const { config } = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { CustomerService } = require('./customer-service');
const { ConversationStateManager } = require('./conversation-state');
const { normalizePhoneNumber } = require('../utils/phone');
const cron = require('node-cron');

class OutboundCallingManager {
  constructor(organizationId = 'bici-main') {
    this.organizationId = organizationId;
    this.elevenlabsApiKey = config.elevenlabs.apiKey;
    this.agentId = config.elevenlabs.agentId;
    this.phoneNumberId = config.elevenlabs.phoneNumberId;
    
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    
    this.customerService = new CustomerService(organizationId);
    this.stateManager = new ConversationStateManager();
    
    // Initialize automated scheduling
    this.initializeScheduling();
  }

  /**
   * Initiate outbound call with full customer context (SOW requirement)
   */
  async initiateOutboundCall(callData) {
    const {
      phoneNumber,
      leadId,
      callReason,
      priority = 'medium',
      scheduledTime = null,
      serviceDetails = null
    } = callData;

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    try {
      console.log(`📞 Initiating outbound call to ${normalizedPhone} for ${callReason}`);

      // Get comprehensive customer context
      const customerData = await this.customerService.identifyCustomer(normalizedPhone, this.organizationId);
      
      // Build conversation initiation data with dynamic context
      const conversationInitData = {
        dynamic_variables: await this.buildDynamicVariables(customerData, callReason, serviceDetails),
        conversation_config_override: await this.buildConversationOverrides(customerData, callReason)
      };

      // Make outbound call via ElevenLabs API
      const response = await fetch(config.elevenlabs.endpoints.outboundCall, {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenlabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          agent_phone_number_id: this.phoneNumberId,
          to_number: normalizedPhone,
          conversation_initiation_client_data: conversationInitData
        })
      });

      const result = await response.json();

      if (result.conversation_id) {
        // Log outbound call initiation
        const outboundCallRecord = await this.logOutboundCall({
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          lead_id: leadId,
          phone_number: normalizedPhone,
          call_reason: callReason,
          priority: priority,
          organization_id: this.organizationId,
          initiated_at: new Date().toISOString(),
          status: 'initiated',
          call_context: {
            customer_data: customerData,
            service_details: serviceDetails,
            scheduled_time: scheduledTime
          }
        });

        // Update lead with outbound call activity
        if (leadId) {
          await this.customerService.updateLeadInteraction(leadId, {
            last_contact_date: new Date().toISOString(),
            interaction_count: (customerData?.interaction_count || 0) + 1,
            lead_status: this.determineLeadStatusUpdate(callReason, customerData?.lead_status)
          });
        }

        // Store active call state for dashboard
        await this.stateManager.setActiveConversation(leadId || normalizedPhone, {
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          phone_number: normalizedPhone,
          call_direction: 'outbound',
          call_reason: callReason,
          customer_data: customerData,
          organization_id: this.organizationId
        });

        console.log(`✅ Outbound call initiated: ${result.conversation_id}`);
        
        return {
          success: true,
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          outbound_call_id: outboundCallRecord.id,
          message: `Outbound call initiated for ${callReason}`
        };
      } else {
        throw new Error(`ElevenLabs API error: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Outbound call initiation failed:', error);
      
      // Log failed attempt
      await this.logOutboundCall({
        lead_id: leadId,
        phone_number: normalizedPhone,
        call_reason: callReason,
        priority: priority,
        organization_id: this.organizationId,
        status: 'failed',
        result: error.message,
        initiated_at: new Date().toISOString()
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build comprehensive dynamic variables for outbound calls
   */
  async buildDynamicVariables(customerData, callReason, serviceDetails = null) {
    const conversationHistory = await this.getConversationHistory(
      customerData?.phone_number || customerData?.phoneNumber,
      this.organizationId
    );

    const currentPromotions = await this.getCurrentPromotions();
    const storeHours = await this.getCurrentStoreHours();

    return {
      // Customer context
      customer_name: customerData?.customer_name || 'Valued Customer',
      customer_phone: customerData?.phone_number || customerData?.phoneNumber || '',
      customer_email: customerData?.email || '',
      customer_tier: customerData?.customer_tier || 'Regular',
      previous_purchases: JSON.stringify(customerData?.purchase_history || []),

      // Lead information
      lead_status: customerData?.lead_status || 'Active Lead',
      bike_interest: JSON.stringify(customerData?.bike_interest || {}),
      budget_range: customerData?.bike_interest?.budget ? 
        `$${customerData.bike_interest.budget.min}-${customerData.bike_interest.budget.max}` : '',
      timeline: customerData?.timeline || '',

      // Conversation context
      conversation_context: this.buildConversationContext(conversationHistory),
      previous_summary: customerData?.previous_summary || 'No previous calls',
      interaction_count: (customerData?.interaction_count || 0).toString(),
      last_contact_date: customerData?.last_contact_date || 'Never',

      // Business context
      organization_name: config.business.organization.name,
      organization_id: this.organizationId,
      store_hours: storeHours,
      store_address: config.business.store.address,
      store_phone: config.business.store.phone,
      current_promotions: JSON.stringify(currentPromotions),

      // Call context
      caller_type: 'outbound',
      call_reason: callReason,
      urgency_level: this.determineUrgency(callReason),
      preferred_language: customerData?.preferred_language || 'en',
      
      // Service-specific context
      ...(serviceDetails && {
        service_type: serviceDetails.service_type,
        appointment_date: serviceDetails.appointment_date,
        appointment_time: serviceDetails.appointment_time,
        service_location: serviceDetails.location || config.business.store.address
      }),

      // Timing context
      current_time: new Date().toISOString(),
      current_day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      store_open_status: await this.getStoreOpenStatus(),
      timezone: config.business.organization.timezone
    };
  }

  /**
   * Build conversation configuration overrides for outbound calls
   */
  async buildConversationOverrides(customerData, callReason) {
    const preferredLanguage = customerData?.preferred_language || 'en';
    
    return {
      agent: {
        language: preferredLanguage,
        first_message: this.getOutboundFirstMessage(callReason, customerData, preferredLanguage),
        
        // Specialized prompts based on call reason
        system_prompt_override: this.getSystemPromptForCallReason(callReason, preferredLanguage),
        
        // Voice settings
        voice_config: {
          voice_id: this.getVoiceIdForLanguage(preferredLanguage),
          stability: config.elevenlabs.voiceConfig.stability,
          similarity_boost: config.elevenlabs.voiceConfig.similarity,
          speed: config.elevenlabs.voiceConfig.speed
        }
      },

      // Call-specific settings
      conversation_timeout: this.getTimeoutForCallReason(callReason),
      max_call_duration: this.getMaxDurationForCallReason(callReason),
      
      // Features enabled for this call type
      features: {
        appointment_booking: callReason === 'appointment_booking' || callReason === 'service_reminder',
        human_escalation: true,
        order_lookup: callReason === 'order_followup' || callReason === 'support_call',
        product_recommendations: callReason === 'sales_followup' || callReason === 'product_interest'
      }
    };
  }

  /**
   * Schedule outbound call for later execution
   */
  async scheduleOutboundCall(callData, scheduledDateTime) {
    try {
      const scheduledFor = new Date(scheduledDateTime);
      const delaySeconds = Math.max(0, (scheduledFor.getTime() - Date.now()) / 1000);

      const taskId = await this.stateManager.scheduleTask('outbound_call', {
        ...callData,
        organization_id: this.organizationId,
        scheduled_for: scheduledFor.toISOString()
      }, delaySeconds);

      // Also log in outbound_calls table
      await this.logOutboundCall({
        ...callData,
        organization_id: this.organizationId,
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
        call_context: { scheduled: true, task_id: taskId }
      });

      console.log(`⏰ Scheduled outbound call for ${scheduledFor.toISOString()} (Task: ${taskId})`);
      
      return {
        success: true,
        task_id: taskId,
        scheduled_for: scheduledFor.toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to schedule outbound call:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process due outbound calls
   */
  async processScheduledCalls() {
    try {
      const dueTasks = await this.stateManager.getDueTasks(10); // Process up to 10 calls
      
      for (const task of dueTasks) {
        if (task.type === 'outbound_call') {
          await this.processOutboundCallTask(task);
        }
      }

      if (dueTasks.length > 0) {
        console.log(`📞 Processed ${dueTasks.length} scheduled outbound calls`);
      }

    } catch (error) {
      console.error('❌ Error processing scheduled calls:', error);
    }
  }

  /**
   * Process individual outbound call task
   */
  async processOutboundCallTask(task) {
    try {
      const result = await this.initiateOutboundCall(task.data);

      if (result.success) {
        await this.stateManager.completeTask(task.id);
        console.log(`✅ Completed scheduled call task: ${task.id}`);
      } else {
        // Retry logic for failed calls
        const retryCount = task.data.retry_count || 0;
        if (retryCount < 2) {
          // Reschedule for retry
          const retryDelay = (retryCount + 1) * 30 * 60; // 30 minutes, then 60 minutes
          await this.stateManager.scheduleTask('outbound_call', {
            ...task.data,
            retry_count: retryCount + 1
          }, retryDelay);
          
          console.log(`🔄 Rescheduled failed call for retry ${retryCount + 1}`);
        } else {
          console.error(`❌ Outbound call task failed after max retries: ${task.id}`);
        }
        
        await this.stateManager.completeTask(task.id);
      }

    } catch (error) {
      console.error(`❌ Error processing outbound call task ${task.id}:`, error);
      await this.stateManager.completeTask(task.id);
    }
  }

  /**
   * Automated service reminder system (SOW requirement)
   */
  async processServiceReminders() {
    try {
      // Get appointments in next 24 hours that need reminders
      const { data: upcomingAppointments, error } = await this.supabase
        .from('appointments')
        .select(`
          *,
          leads(customer_name, phone_number_normalized, contact_preferences)
        `)
        .eq('organization_id', this.organizationId)
        .eq('status', 'confirmed')
        .eq('reminder_sent', false)
        .gte('appointment_datetime', new Date().toISOString())
        .lte('appointment_datetime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw error;
      }

      for (const appointment of upcomingAppointments || []) {
        if (this.shouldSendReminder(appointment)) {
          await this.initiateOutboundCall({
            phoneNumber: appointment.customer_phone,
            leadId: appointment.lead_id,
            callReason: 'service_reminder',
            priority: 'high',
            serviceDetails: {
              service_type: appointment.service_type,
              appointment_date: appointment.appointment_datetime,
              appointment_time: new Date(appointment.appointment_datetime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }),
              location: appointment.location || config.business.store.address
            }
          });

          // Mark reminder as sent
          await this.markReminderSent(appointment.id);
        }
      }

      console.log(`📞 Processed ${upcomingAppointments?.length || 0} service reminders`);

    } catch (error) {
      console.error('❌ Error processing service reminders:', error);
    }
  }

  /**
   * Initialize automated scheduling with cron jobs
   */
  initializeScheduling() {
    // Process scheduled calls every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      if (config.features.outboundCalling) {
        await this.processScheduledCalls();
      }
    });

    // Process service reminders every hour during business hours
    cron.schedule('0 9-18 * * *', async () => {
      if (config.features.outboundCalling) {
        await this.processServiceReminders();
      }
    });

    console.log('⏰ Outbound calling scheduler initialized');
  }

  /**
   * Utility Methods
   */

  getOutboundFirstMessage(callReason, customerData, language) {
    const customerName = customerData?.customer_name || '';
    
    const messages = {
      en: {
        service_reminder: customerName ? 
          `Hi ${customerName}! This is BICI calling to remind you about your upcoming service appointment.` :
          `Hi! This is BICI calling to remind you about your upcoming service appointment.`,
        
        sales_followup: customerName ?
          `Hi ${customerName}! This is BICI following up on your interest in our bikes.` :
          `Hi! This is BICI following up on your interest in our bikes.`,
        
        appointment_booking: customerName ?
          `Hi ${customerName}! This is BICI calling to help you schedule your bike service.` :
          `Hi! This is BICI calling to help you schedule your bike service.`,
        
        order_followup: customerName ?
          `Hi ${customerName}! This is BICI calling about your recent order.` :
          `Hi! This is BICI calling about your recent order.`,
        
        default: customerName ?
          `Hi ${customerName}! This is BICI's AI assistant calling to help you with your biking needs.` :
          `Hi! This is BICI's AI assistant calling to help you with your biking needs.`
      },
      
      fr: {
        service_reminder: customerName ?
          `Bonjour ${customerName}! C'est BICI qui appelle pour vous rappeler votre rendez-vous de service.` :
          `Bonjour! C'est BICI qui appelle pour vous rappeler votre rendez-vous de service.`,
        
        sales_followup: customerName ?
          `Bonjour ${customerName}! C'est BICI qui fait le suivi de votre intérêt pour nos vélos.` :
          `Bonjour! C'est BICI qui fait le suivi de votre intérêt pour nos vélos.`,
        
        default: customerName ?
          `Bonjour ${customerName}! C'est l'assistant IA de BICI qui appelle pour vous aider.` :
          `Bonjour! C'est l'assistant IA de BICI qui appelle pour vous aider.`
      }
    };

    return messages[language]?.[callReason] || messages[language]?.default || messages.en.default;
  }

  getSystemPromptForCallReason(callReason, language) {
    // Return specialized system prompts based on call reason
    const prompts = {
      service_reminder: language === 'fr' ? 
        'Vous appelez pour rappeler un rendez-vous de service. Soyez amical et utile.' :
        'You are calling to remind about a service appointment. Be friendly and helpful.',
      
      sales_followup: language === 'fr' ?
        'Vous faites le suivi d\'un intérêt pour des vélos. Focalisez sur leurs besoins.' :
        'You are following up on bike interest. Focus on their needs and preferences.',
      
      default: language === 'fr' ?
        'Vous êtes l\'assistant IA de BICI. Soyez professionnel et serviable.' :
        'You are BICI\'s AI assistant. Be professional and helpful.'
    };

    return prompts[callReason] || prompts.default;
  }

  determineUrgency(callReason) {
    const urgencyMap = {
      'service_reminder': 'high',
      'appointment_booking': 'medium',
      'order_followup': 'medium',
      'sales_followup': 'low',
      'support_call': 'high'
    };

    return urgencyMap[callReason] || 'medium';
  }

  getTimeoutForCallReason(callReason) {
    // Timeout in seconds
    const timeoutMap = {
      'service_reminder': 300, // 5 minutes
      'sales_followup': 600,   // 10 minutes
      'support_call': 900      // 15 minutes
    };

    return timeoutMap[callReason] || 300;
  }

  getMaxDurationForCallReason(callReason) {
    // Max duration in seconds
    const durationMap = {
      'service_reminder': 180,  // 3 minutes
      'sales_followup': 600,    // 10 minutes
      'support_call': 1200      // 20 minutes
    };

    return durationMap[callReason] || 300;
  }

  shouldSendReminder(appointment) {
    const appointmentTime = new Date(appointment.appointment_datetime);
    const now = new Date();
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    // Send reminder 24 hours before, during business hours
    return hoursUntilAppointment <= 24 && hoursUntilAppointment >= 12 && this.isBusinessHours();
  }

  async markReminderSent(appointmentId) {
    await this.supabase
      .from('appointments')
      .update({ reminder_sent: true })
      .eq('id', appointmentId);
  }

  async logOutboundCall(callData) {
    const { data, error } = await this.supabase
      .from('outbound_calls')
      .insert(callData)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to log outbound call:', error);
      return null;
    }

    return data;
  }

  buildConversationContext(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'No previous call history.';
    }

    return conversationHistory.slice(0, 3).map(call => 
      `Previous call: ${call.call_classification || 'General'} - ${call.content?.substring(0, 100) || 'No summary'}`
    ).join('; ');
  }

  async getCurrentPromotions() {
    // Mock promotions - in real implementation, fetch from database
    return [
      {
        name: 'Winter Bike Sale',
        discount: '20% off all mountain bikes',
        expires: '2024-03-31'
      }
    ];
  }

  async getCurrentStoreHours() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const hours = isWeekend ? 
      config.business.hours.weekends : 
      config.business.hours.weekdays;
    
    return `${hours.open} - ${hours.close}`;
  }

  async getStoreOpenStatus() {
    return this.isBusinessHours() ? 'open' : 'closed';
  }

  isBusinessHours() {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const hours = isWeekend ? 
      config.business.hours.weekends : 
      config.business.hours.weekdays;
    
    return currentTime >= hours.open && currentTime <= hours.close;
  }

  getVoiceIdForLanguage(language) {
    if (language === 'fr') {
      return process.env.ELEVENLABS_VOICE_ID_FRENCH || config.elevenlabs.voiceId;
    }
    
    return config.elevenlabs.voiceId;
  }

  determineLeadStatusUpdate(callReason, currentStatus) {
    if (callReason === 'sales_followup' && currentStatus === 'new') {
      return 'contacted';
    }
    
    if (callReason === 'service_reminder') {
      return 'follow_up';
    }
    
    return currentStatus;
  }

  async getConversationHistory(phoneNumber, organizationId, limit = 5) {
    if (!phoneNumber || !organizationId) return [];

    try {
      const { data } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', phoneNumber)
        .order('timestamp', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get conversation history:', error);
      return [];
    }
  }
}

module.exports = { OutboundCallingManager };