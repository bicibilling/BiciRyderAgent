/**
 * BICI AI Voice System - SMS Automation Service
 * Automated SMS follow-ups, templates, and Twilio integration
 */

const twilio = require('twilio');
const { config } = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { normalizePhoneNumber } = require('../utils/phone');
const { ConversationStateManager } = require('./conversation-state');

class SMSAutomation {
  constructor(organizationId = 'bici-main') {
    this.organizationId = organizationId;
    this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    this.stateManager = new ConversationStateManager();
    
    // SMS templates for different scenarios
    this.templates = this.initializeTemplates();
  }

  /**
   * Initialize SMS templates for different scenarios (SOW requirement)
   */
  initializeTemplates() {
    return {
      // English templates
      en: {
        store_hours: {
          id: 'store_hours_en',
          body: `Thanks for calling BICI! 🚴‍♂️\n\nOur hours:\nMon-Fri: 9AM-7PM\nSat-Sun: 10AM-6PM\n\nVisit us at ${config.business.store.address}\nQuestions? Call ${config.business.store.phone}`,
          category: 'information'
        },
        
        directions: {
          id: 'directions_en',
          body: `🚴‍♂️ BICI Bike Store Location:\n\n📍 ${config.business.store.address}\n${config.business.store.city}, ${config.business.store.province}\n\nFree parking available!\nNeed directions? https://maps.google.com/?q=${encodeURIComponent(config.business.store.address)}`,
          category: 'information'
        },
        
        follow_up_general: {
          id: 'follow_up_general_en',
          body: `Hi {customer_name}! Thanks for calling BICI today. 🚴‍♂️\n\nIf you have any more questions about bikes or need help finding the perfect ride, don't hesitate to call us back!\n\nHappy cycling! 🌟`,
          category: 'follow_up'
        },
        
        appointment_confirmation: {
          id: 'appointment_confirmation_en',
          body: `✅ Appointment Confirmed!\n\nService: {service_type}\nDate: {appointment_date}\nTime: {appointment_time}\nLocation: BICI - ${config.business.store.address}\n\nSee you there! Call ${config.business.store.phone} if you need to reschedule.`,
          category: 'appointment'
        },
        
        appointment_reminder: {
          id: 'appointment_reminder_en',
          body: `🔔 Reminder: Your {service_type} appointment is tomorrow at {appointment_time}!\n\nLocation: BICI - ${config.business.store.address}\n\nRunning late? Call ${config.business.store.phone}\n\nSee you soon! 🚴‍♂️`,
          category: 'appointment'
        },
        
        missed_call: {
          id: 'missed_call_en',
          body: `Hi! We tried calling you but couldn't connect. 📞\n\nWe're here to help with all your biking needs!\n\nCall us back: ${config.business.store.phone}\nOr visit: ${config.business.store.address}\n\nHours: Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM`,
          category: 'missed_call'
        },
        
        product_interest: {
          id: 'product_interest_en',
          body: `🚴‍♂️ Thanks for your interest in {bike_type}!\n\nWe have great options in your budget range. Visit us to test ride:\n\n📍 ${config.business.store.address}\n📞 ${config.business.store.phone}\n\nOur bike experts are ready to help!`,
          category: 'product'
        },
        
        order_status: {
          id: 'order_status_en',
          body: `📦 Order Update!\n\nOrder #{order_number}: {order_status}\n\n{status_details}\n\nQuestions? Call ${config.business.store.phone} or visit ${config.business.store.address}`,
          category: 'order'
        }
      },

      // French templates (SOW bilingual requirement)
      fr: {
        store_hours: {
          id: 'store_hours_fr',
          body: `Merci d'avoir appelé BICI! 🚴‍♂️\n\nNos heures:\nLun-Ven: 9h-19h\nSam-Dim: 10h-18h\n\nVisitez-nous au ${config.business.store.address}\nQuestions? Appelez ${config.business.store.phone}`,
          category: 'information'
        },
        
        directions: {
          id: 'directions_fr',
          body: `🚴‍♂️ Magasin de vélos BICI:\n\n📍 ${config.business.store.address}\n${config.business.store.city}, ${config.business.store.province}\n\nStationnement gratuit!\nBesoin d'directions? https://maps.google.com/?q=${encodeURIComponent(config.business.store.address)}`,
          category: 'information'
        },
        
        follow_up_general: {
          id: 'follow_up_general_fr',
          body: `Salut {customer_name}! Merci d'avoir appelé BICI aujourd'hui. 🚴‍♂️\n\nSi vous avez d'autres questions sur les vélos, n'hésitez pas à nous rappeler!\n\nBonne cyclisme! 🌟`,
          category: 'follow_up'
        },
        
        appointment_confirmation: {
          id: 'appointment_confirmation_fr',
          body: `✅ Rendez-vous confirmé!\n\nService: {service_type}\nDate: {appointment_date}\nHeure: {appointment_time}\nLieu: BICI - ${config.business.store.address}\n\nÀ bientôt! Appelez ${config.business.store.phone} pour reporter.`,
          category: 'appointment'
        },
        
        missed_call: {
          id: 'missed_call_fr',
          body: `Salut! Nous avons essayé de vous appeler. 📞\n\nNous sommes là pour vous aider avec vos besoins de vélo!\n\nRappelez-nous: ${config.business.store.phone}\nOu visitez: ${config.business.store.address}\n\nHeures: Lun-Ven 9h-19h, Sam-Dim 10h-18h`,
          category: 'missed_call'
        }
      }
    };
  }

  /**
   * Send SMS message with template processing
   */
  async sendSMS(phoneNumber, templateId, variables = {}, options = {}) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      console.log(`📱 Sending SMS to ${normalizedPhone} using template ${templateId}`);

      // Get template
      const language = options.language || 'en';
      const template = this.getTemplate(templateId, language);
      
      if (!template) {
        throw new Error(`Template not found: ${templateId} (${language})`);
      }

      // Process template variables
      const messageBody = this.processTemplate(template.body, variables);

      // Check rate limiting
      const rateLimitKey = `sms_rate:${this.organizationId}:${normalizedPhone}`;
      const rateLimit = await this.stateManager.checkRateLimit(rateLimitKey, 10, 3600); // 10 SMS per hour

      if (!rateLimit.allowed) {
        console.warn(`⚠️  SMS rate limit exceeded for ${normalizedPhone}`);
        return {
          success: false,
          error: 'Rate limit exceeded',
          resetTime: rateLimit.resetTime
        };
      }

      // Send SMS via Twilio
      const message = await this.twilioClient.messages.create({
        body: messageBody,
        from: config.twilio.phoneNumber,
        to: normalizedPhone,
        statusCallback: `${config.server.baseUrl}/api/webhooks/twilio/sms-status`
      });

      // Log SMS in database
      await this.logSMS({
        twilio_message_sid: message.sid,
        phone_number_normalized: normalizedPhone,
        message_body: messageBody,
        message_type: options.messageType || 'manual',
        template_id: templateId,
        status: 'queued',
        direction: 'outbound',
        organization_id: this.organizationId,
        metadata: {
          template_variables: variables,
          language: language,
          ...options.metadata
        }
      });

      console.log(`✅ SMS sent successfully: ${message.sid}`);
      
      return {
        success: true,
        message_sid: message.sid,
        body: messageBody,
        status: message.status
      };

    } catch (error) {
      console.error('❌ SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Schedule follow-up SMS based on call context (SOW requirement)
   */
  async scheduleFollowUpSMS(phoneNumber, callContext, delayMinutes = 5) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      // Determine appropriate follow-up template based on call context
      const followUpType = this.determineFollowUpType(callContext);
      const templateId = this.getFollowUpTemplate(followUpType);
      
      // Build template variables from call context
      const variables = await this.buildFollowUpVariables(callContext);
      
      // Determine language from customer preferences
      const language = callContext.lead_data?.preferred_language || 'en';
      
      // Schedule SMS for later delivery
      const scheduledFor = new Date(Date.now() + (delayMinutes * 60 * 1000));
      
      const taskId = await this.stateManager.scheduleTask('send_sms', {
        phone_number: normalizedPhone,
        template_id: templateId,
        variables: variables,
        language: language,
        message_type: 'follow_up',
        call_context: callContext
      }, delayMinutes * 60);

      console.log(`⏰ Scheduled follow-up SMS for ${normalizedPhone} in ${delayMinutes} minutes (Task: ${taskId})`);
      
      return {
        success: true,
        task_id: taskId,
        scheduled_for: scheduledFor,
        template_id: templateId
      };

    } catch (error) {
      console.error('❌ Failed to schedule follow-up SMS:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Schedule missed call SMS
   */
  async scheduleMissedCallSMS(phoneNumber, callContext, delayMinutes = 2) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      const language = callContext.preferred_language || 'en';
      const templateId = 'missed_call';
      
      const variables = {
        customer_name: callContext.customer_name || '',
        failure_reason: callContext.failure_reason,
        store_phone: config.business.store.phone,
        store_address: config.business.store.address
      };

      const taskId = await this.stateManager.scheduleTask('send_sms', {
        phone_number: normalizedPhone,
        template_id: templateId,
        variables: variables,
        language: language,
        message_type: 'missed_call',
        call_context: callContext
      }, delayMinutes * 60);

      console.log(`📞 Scheduled missed call SMS for ${normalizedPhone}`);
      
      return {
        success: true,
        task_id: taskId,
        template_id: templateId
      };

    } catch (error) {
      console.error('❌ Failed to schedule missed call SMS:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send appointment confirmation SMS
   */
  async sendAppointmentConfirmation(appointmentData) {
    const variables = {
      customer_name: appointmentData.customer_name,
      service_type: appointmentData.service_type,
      appointment_date: new Date(appointmentData.appointment_datetime).toLocaleDateString(),
      appointment_time: new Date(appointmentData.appointment_datetime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      store_address: config.business.store.address,
      store_phone: config.business.store.phone
    };

    return await this.sendSMS(
      appointmentData.customer_phone,
      'appointment_confirmation',
      variables,
      {
        messageType: 'appointment_confirmation',
        language: appointmentData.preferred_language || 'en',
        metadata: {
          appointment_id: appointmentData.id,
          service_type: appointmentData.service_type
        }
      }
    );
  }

  /**
   * Send appointment reminder SMS (24 hours before)
   */
  async sendAppointmentReminder(appointmentData) {
    const variables = {
      customer_name: appointmentData.customer_name,
      service_type: appointmentData.service_type,
      appointment_time: new Date(appointmentData.appointment_datetime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      store_address: config.business.store.address,
      store_phone: config.business.store.phone
    };

    return await this.sendSMS(
      appointmentData.customer_phone,
      'appointment_reminder',
      variables,
      {
        messageType: 'appointment_reminder',
        language: appointmentData.preferred_language || 'en',
        metadata: {
          appointment_id: appointmentData.id,
          reminder_type: '24h_before'
        }
      }
    );
  }

  /**
   * Send product interest follow-up SMS
   */
  async sendProductInterestSMS(phoneNumber, productData, customerData = {}) {
    const variables = {
      customer_name: customerData.customer_name || '',
      bike_type: productData.bike_type || 'bikes',
      budget_range: productData.budget_range || '',
      store_address: config.business.store.address,
      store_phone: config.business.store.phone
    };

    return await this.sendSMS(
      phoneNumber,
      'product_interest',
      variables,
      {
        messageType: 'product_interest',
        language: customerData.preferred_language || 'en',
        metadata: {
          product_interest: productData,
          customer_tier: customerData.customer_tier
        }
      }
    );
  }

  /**
   * Process scheduled SMS tasks
   */
  async processSMSTasks() {
    try {
      const dueTasks = await this.stateManager.getDueTasks(20); // Process up to 20 tasks
      
      for (const task of dueTasks) {
        if (task.type === 'send_sms') {
          await this.processSMSTask(task);
        }
      }

      if (dueTasks.length > 0) {
        console.log(`📱 Processed ${dueTasks.length} SMS tasks`);
      }

    } catch (error) {
      console.error('❌ Error processing SMS tasks:', error);
    }
  }

  /**
   * Process individual SMS task
   */
  async processSMSTask(task) {
    try {
      const { phone_number, template_id, variables, language, message_type, call_context } = task.data;
      
      const result = await this.sendSMS(phone_number, template_id, variables, {
        messageType: message_type,
        language: language,
        metadata: { 
          task_id: task.id,
          scheduled_task: true,
          call_context: call_context
        }
      });

      if (result.success) {
        await this.stateManager.completeTask(task.id);
        console.log(`✅ Completed SMS task: ${task.id}`);
      } else {
        console.error(`❌ SMS task failed: ${task.id} - ${result.error}`);
      }

    } catch (error) {
      console.error(`❌ Error processing SMS task ${task.id}:`, error);
    }
  }

  /**
   * Handle incoming SMS webhooks from Twilio
   */
  async handleIncomingSMS(req, res) {
    try {
      const { From, To, Body, MessageSid } = req.body;
      const normalizedPhone = normalizePhoneNumber(From);

      console.log(`📱 Incoming SMS from ${normalizedPhone}: ${Body}`);

      // Log incoming SMS
      await this.logSMS({
        twilio_message_sid: MessageSid,
        phone_number_normalized: normalizedPhone,
        message_body: Body,
        message_type: 'inbound',
        status: 'received',
        direction: 'inbound',
        organization_id: this.organizationId
      });

      // Auto-respond to common queries
      const autoResponse = await this.generateAutoResponse(Body, normalizedPhone);
      if (autoResponse) {
        await this.sendSMS(normalizedPhone, autoResponse.template_id, autoResponse.variables, {
          messageType: 'auto_response',
          metadata: { responding_to: MessageSid }
        });
      }

      res.status(200).send('OK');

    } catch (error) {
      console.error('❌ Incoming SMS handling error:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Handle SMS status webhooks from Twilio
   */
  async handleSMSStatusWebhook(req, res) {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

      console.log(`📱 SMS status update: ${MessageSid} - ${MessageStatus}`);

      // Update SMS status in database
      await this.updateSMSStatus(MessageSid, {
        status: MessageStatus,
        error_code: ErrorCode,
        error_message: ErrorMessage,
        status_updated_at: new Date().toISOString()
      });

      res.status(200).send('OK');

    } catch (error) {
      console.error('❌ SMS status webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Utility Methods
   */

  getTemplate(templateId, language = 'en') {
    return this.templates[language]?.[templateId] || this.templates['en']?.[templateId] || null;
  }

  processTemplate(templateBody, variables) {
    let processedBody = templateBody;
    
    Object.keys(variables).forEach(key => {
      const placeholder = `{${key}}`;
      processedBody = processedBody.replace(new RegExp(placeholder, 'g'), variables[key] || '');
    });

    return processedBody;
  }

  determineFollowUpType(callContext) {
    const { call_duration, conversation_summary } = callContext;
    
    if (call_duration < 30) return 'brief_call';
    if (conversation_summary?.includes('appointment')) return 'appointment_interest';
    if (conversation_summary?.includes('bike') || conversation_summary?.includes('product')) return 'product_interest';
    
    return 'general';
  }

  getFollowUpTemplate(followUpType) {
    const templateMap = {
      'brief_call': 'follow_up_general',
      'appointment_interest': 'follow_up_general',
      'product_interest': 'product_interest',
      'general': 'follow_up_general'
    };

    return templateMap[followUpType] || 'follow_up_general';
  }

  async buildFollowUpVariables(callContext) {
    return {
      customer_name: callContext.lead_data?.customer_name || '',
      bike_type: callContext.bike_interest?.type || 'bikes',
      budget_range: callContext.bike_interest?.budget ? 
        `$${callContext.bike_interest.budget.min}-${callContext.bike_interest.budget.max}` : '',
      store_phone: config.business.store.phone,
      store_address: config.business.store.address
    };
  }

  async generateAutoResponse(messageBody, phoneNumber) {
    const lowerBody = messageBody.toLowerCase();
    
    if (lowerBody.includes('hours') || lowerBody.includes('open')) {
      return {
        template_id: 'store_hours',
        variables: {}
      };
    }
    
    if (lowerBody.includes('location') || lowerBody.includes('address') || lowerBody.includes('directions')) {
      return {
        template_id: 'directions',
        variables: {}
      };
    }

    return null;
  }

  async logSMS(smsData) {
    try {
      const { error } = await this.supabase
        .from('sms_messages')
        .insert(smsData);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('❌ Failed to log SMS:', error);
    }
  }

  async updateSMSStatus(messageSid, statusData) {
    try {
      const { error } = await this.supabase
        .from('sms_messages')
        .update(statusData)
        .eq('twilio_message_sid', messageSid);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('❌ Failed to update SMS status:', error);
    }
  }
}

module.exports = { SMSAutomation };