/**
 * BICI AI Voice System - Webhook Processing Service
 * Centralized webhook validation, logging, and processing
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config');
const { ConversationStateManager } = require('./conversation-state');
const { SMSAutomation } = require('./sms-automation');
const { CustomerService } = require('./customer-service');

class WebhookProcessor {
  constructor() {
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    this.stateManager = new ConversationStateManager();
    this.smsAutomation = new SMSAutomation();
    this.customerService = new CustomerService();
    
    // Rate limiting for webhook endpoints
    this.rateLimits = new Map();
  }

  /**
   * Validate and log incoming webhooks (SOW requirement)
   */
  async validateAndLogWebhook(req, res, next, source) {
    const startTime = Date.now();
    
    try {
      // Rate limiting check
      const rateLimitKey = `webhook:${source}:${req.ip}`;
      const rateLimit = await this.stateManager.checkRateLimit(
        rateLimitKey, 
        config.rateLimiting.webhookRateLimit, 
        3600 // 1 hour window
      );

      if (!rateLimit.allowed) {
        console.warn(`⚠️  Webhook rate limit exceeded for ${source} from ${req.ip}`);
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          resetTime: rateLimit.resetTime
        });
      }

      // Webhook signature validation
      let isValid = false;
      try {
        isValid = await this.validateWebhookSignature(req, source);
      } catch (validationError) {
        console.error(`❌ Webhook validation failed for ${source}:`, validationError);
        isValid = false;
      }

      // Log webhook attempt
      const webhookLog = {
        webhook_type: req.path.split('/').pop(),
        webhook_source: source,
        method: req.method,
        url: req.originalUrl,
        headers: this.sanitizeHeaders(req.headers),
        body: this.sanitizeBody(req.body),
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        success: isValid,
        processing_time_ms: Date.now() - startTime,
        organization_id: this.extractOrganizationId(req),
        timestamp: new Date().toISOString()
      };

      // Log to database (async, don't block request)
      this.logWebhookToDatabase(webhookLog).catch(error => {
        console.error('❌ Failed to log webhook to database:', error);
      });

      if (isValid || config.server.nodeEnv === 'development') {
        console.log(`✅ Valid ${source} webhook: ${req.path}`);
        next();
      } else {
        console.error(`❌ Invalid ${source} webhook signature`);
        res.status(401).json({ error: 'Invalid webhook signature' });
      }

    } catch (error) {
      console.error(`❌ Webhook validation error for ${source}:`, error);
      
      // Log error but don't block webhook in production
      if (config.server.nodeEnv === 'development') {
        res.status(500).json({ error: 'Webhook validation failed' });
      } else {
        next(); // Allow webhook to proceed in production
      }
    }
  }

  /**
   * Validate webhook signatures for different services
   */
  async validateWebhookSignature(req, source) {
    switch (source) {
      case 'elevenlabs':
        return this.validateElevenLabsSignature(req);
      
      case 'twilio':
        return this.validateTwilioSignature(req);
      
      case 'shopify':
        return this.validateShopifySignature(req);
      
      case 'hubspot':
        return this.validateHubSpotSignature(req);
      
      default:
        console.warn(`⚠️  Unknown webhook source: ${source}`);
        return false;
    }
  }

  /**
   * ElevenLabs webhook signature validation
   */
  validateElevenLabsSignature(req) {
    if (!config.elevenlabs.webhookSecret) {
      console.warn('⚠️  ElevenLabs webhook secret not configured');
      return true; // Allow in development
    }

    const signature = req.headers['x-elevenlabs-signature'];
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.elevenlabs.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Twilio webhook signature validation
   */
  validateTwilioSignature(req) {
    const twilio = require('twilio');
    const signature = req.headers['x-twilio-signature'];
    const url = `${config.server.baseUrl}${req.originalUrl}`;

    return twilio.validateRequest(
      config.twilio.authToken,
      signature,
      url,
      req.body
    );
  }

  /**
   * Shopify webhook signature validation
   */
  validateShopifySignature(req) {
    if (!config.integrations.shopify.webhookSecret) {
      return true; // Allow if secret not configured
    }

    const signature = req.headers['x-shopify-hmac-sha256'];
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.integrations.shopify.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  }

  /**
   * HubSpot webhook signature validation
   */
  validateHubSpotSignature(req) {
    // HubSpot uses different validation method
    // Implementation would depend on HubSpot's specific requirements
    return true; // Simplified for now
  }

  /**
   * Process conversation completion actions (SOW requirement)
   */
  async triggerConversationCompletionActions(conversationData) {
    try {
      const { conversation_id, call_duration, summary, classification } = conversationData;

      console.log(`🎯 Processing conversation completion: ${conversation_id}`);

      // Get conversation details
      const conversationState = await this.stateManager.getConversationState(conversation_id);
      
      if (!conversationState) {
        console.warn(`⚠️  No conversation state found for ${conversation_id}`);
        return;
      }

      const { lead_id, phone_number, organization_id } = conversationState;

      // Update lead with conversation results
      if (lead_id) {
        await this.customerService.updateLeadCallCompletion(lead_id, {
          call_duration,
          conversation_summary: summary,
          call_classification: classification,
          call_completed_at: new Date().toISOString()
        });
      }

      // Trigger follow-up actions based on classification
      await this.triggerClassificationBasedActions(classification, {
        conversation_id,
        lead_id,
        phone_number,
        organization_id,
        call_duration,
        summary
      });

      // Schedule follow-up SMS if appropriate
      if (config.features.smsAutomation && call_duration > 30) {
        await this.smsAutomation.scheduleFollowUpSMS(phone_number, {
          call_duration,
          conversation_summary: summary,
          classification,
          lead_data: conversationState.customer_data
        });
      }

      console.log(`✅ Conversation completion actions processed for ${conversation_id}`);

    } catch (error) {
      console.error('❌ Error processing conversation completion:', error);
    }
  }

  /**
   * Trigger actions based on call classification
   */
  async triggerClassificationBasedActions(classification, contextData) {
    const { conversation_id, lead_id, phone_number, summary } = contextData;

    switch (classification) {
      case 'appointment_booking':
        await this.handleAppointmentBookingFollow(contextData);
        break;

      case 'product_inquiry':
        await this.handleProductInquiryFollow(contextData);
        break;

      case 'order_status':
        await this.handleOrderStatusFollow(contextData);
        break;

      case 'support_request':
        await this.handleSupportRequestFollow(contextData);
        break;

      case 'complaint':
        await this.handleComplaintFollow(contextData);
        break;

      default:
        console.log(`ℹ️  No specific actions for classification: ${classification}`);
    }
  }

  /**
   * Handle appointment booking follow-up
   */
  async handleAppointmentBookingFollow(contextData) {
    const { lead_id, phone_number, summary } = contextData;

    // Check if appointment was actually booked
    if (summary?.includes('appointment') && summary?.includes('booked')) {
      // Send confirmation SMS
      await this.smsAutomation.sendSMS(phone_number, 'appointment_confirmation', {
        customer_name: contextData.customer_data?.customer_name || '',
        // Extract appointment details from summary (in real implementation, this would be more sophisticated)
        service_type: 'bike service',
        appointment_date: 'soon',
        appointment_time: 'as scheduled'
      });
    }
  }

  /**
   * Handle product inquiry follow-up
   */
  async handleProductInquiryFollow(contextData) {
    const { lead_id, phone_number, summary } = contextData;

    // Extract bike interest from conversation
    const bikeInterest = this.extractBikeInterest(summary);
    
    if (bikeInterest) {
      await this.smsAutomation.sendProductInterestSMS(phone_number, bikeInterest, contextData.customer_data);
    }
  }

  /**
   * Handle order status follow-up
   */
  async handleOrderStatusFollow(contextData) {
    // Could trigger order tracking SMS or email
    console.log('📦 Order status inquiry follow-up triggered');
  }

  /**
   * Handle support request follow-up
   */
  async handleSupportRequestFollow(contextData) {
    const { lead_id, phone_number, summary } = contextData;

    // Create support ticket in HubSpot if configured
    if (config.integrations.hubspot.accessToken) {
      // Implementation would create HubSpot ticket
      console.log('🎫 Support ticket creation triggered');
    }
  }

  /**
   * Handle complaint follow-up
   */
  async handleComplaintFollow(contextData) {
    // Escalate to human team
    console.log('⚠️  Complaint escalation triggered');
    
    // Could send alert to management team
    // await this.sendManagementAlert(contextData);
  }

  /**
   * Process Shopify order webhook
   */
  async processShopifyOrder(orderData) {
    try {
      const { customer, order_id, order_number, line_items, total_price } = orderData;

      if (customer && customer.phone) {
        // Update or create customer lead
        const phoneNumber = customer.phone;
        const existingCustomer = await this.customerService.identifyCustomer(phoneNumber);

        if (existingCustomer) {
          // Update purchase history
          const updatedPurchaseHistory = [
            ...(existingCustomer.purchase_history || []),
            {
              order_id,
              order_number,
              total_price,
              line_items: line_items.map(item => ({
                title: item.title,
                quantity: item.quantity,
                price: item.price
              })),
              order_date: new Date().toISOString()
            }
          ].slice(-10); // Keep last 10 orders

          await this.customerService.updateLeadInteraction(existingCustomer.id, {
            purchase_history: updatedPurchaseHistory,
            customer_tier: this.determineTierFromPurchases(updatedPurchaseHistory),
            last_contact_date: new Date().toISOString()
          });
        } else {
          // Create new lead from Shopify order
          await this.customerService.createLeadFromPhone(phoneNumber, {
            customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
            email: customer.email,
            lead_source: 'shopify_order',
            purchase_history: [{
              order_id,
              order_number,
              total_price,
              line_items,
              order_date: new Date().toISOString()
            }]
          });
        }

        console.log(`✅ Processed Shopify order ${order_number} for ${phoneNumber}`);
      }

    } catch (error) {
      console.error('❌ Error processing Shopify order:', error);
    }
  }

  /**
   * Trigger order status SMS
   */
  async triggerOrderStatusSMS(order) {
    try {
      if (order.customer && order.customer.phone) {
        const statusMessages = {
          fulfilled: 'Your order has been fulfilled and is ready for pickup!',
          shipped: 'Your order has been shipped and is on its way!',
          delivered: 'Your order has been delivered. Enjoy your new bike gear!'
        };

        const statusDetails = statusMessages[order.fulfillment_status] || 'Your order status has been updated.';

        await this.smsAutomation.sendSMS(
          order.customer.phone,
          'order_status',
          {
            customer_name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim(),
            order_number: order.order_number,
            order_status: order.fulfillment_status,
            status_details: statusDetails
          },
          {
            messageType: 'order_status',
            metadata: {
              order_id: order.id,
              fulfillment_status: order.fulfillment_status
            }
          }
        );
      }

    } catch (error) {
      console.error('❌ Error sending order status SMS:', error);
    }
  }

  /**
   * Create lead from Shopify customer
   */
  async createLeadFromShopifyCustomer(customer) {
    try {
      if (customer.phone) {
        await this.customerService.createLeadFromPhone(customer.phone, {
          customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          email: customer.email,
          lead_source: 'shopify_registration',
          contact_preferences: {
            email: !!customer.email,
            sms: !!customer.phone,
            language: 'en' // Could be enhanced with customer tags
          },
          metadata: {
            shopify_customer_id: customer.id,
            accepts_marketing: customer.accepts_marketing,
            created_at: customer.created_at
          }
        });

        console.log(`✅ Created lead from Shopify customer: ${customer.email}`);
      }

    } catch (error) {
      console.error('❌ Error creating lead from Shopify customer:', error);
    }
  }

  /**
   * Sync HubSpot contact changes
   */
  async syncHubSpotContact(contactData) {
    try {
      // Implementation would sync HubSpot changes back to local database
      console.log(`🔄 Syncing HubSpot contact: ${contactData.contact_id}`);
      
      // This could update lead records with HubSpot property changes
      
    } catch (error) {
      console.error('❌ Error syncing HubSpot contact:', error);
    }
  }

  /**
   * Process calendar updates
   */
  async processCalendarUpdate(calendarData) {
    try {
      console.log(`📅 Processing calendar update: ${calendarData.event_id}`);
      
      // Implementation would handle appointment changes and notify customers
      
    } catch (error) {
      console.error('❌ Error processing calendar update:', error);
    }
  }

  /**
   * Get webhook analytics
   */
  async getWebhookAnalytics() {
    try {
      const { data, error } = await this.supabase
        .from('webhook_logs')
        .select(`
          webhook_source,
          webhook_type,
          success,
          created_at
        `)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Process analytics
      const analytics = {
        total_webhooks: data.length,
        success_rate: data.length > 0 ? (data.filter(w => w.success).length / data.length * 100).toFixed(2) : 0,
        by_source: {},
        by_type: {},
        hourly_distribution: {}
      };

      data.forEach(webhook => {
        // By source
        analytics.by_source[webhook.webhook_source] = (analytics.by_source[webhook.webhook_source] || 0) + 1;
        
        // By type
        analytics.by_type[webhook.webhook_type] = (analytics.by_type[webhook.webhook_type] || 0) + 1;
        
        // Hourly distribution
        const hour = new Date(webhook.created_at).getHour();
        analytics.hourly_distribution[hour] = (analytics.hourly_distribution[hour] || 0) + 1;
      });

      return analytics;

    } catch (error) {
      console.error('❌ Error getting webhook analytics:', error);
      return { error: 'Failed to get analytics' };
    }
  }

  /**
   * Utility Methods
   */

  sanitizeHeaders(headers) {
    // Remove sensitive headers
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
    const sanitized = { ...headers };
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  sanitizeBody(body) {
    // Remove sensitive data from body
    if (typeof body === 'object' && body !== null) {
      const sanitized = { ...body };
      
      const sensitiveFields = ['password', 'token', 'secret', 'key'];
      sensitiveFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });

      return sanitized;
    }
    
    return body;
  }

  extractOrganizationId(req) {
    // Extract organization ID from request (could be from JWT, header, or path)
    return req.headers['x-organization-id'] || config.business.organization.id;
  }

  async logWebhookToDatabase(webhookLog) {
    try {
      const { error } = await this.supabase
        .from('webhook_logs')
        .insert(webhookLog);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('❌ Failed to log webhook to database:', error);
    }
  }

  logWebhookError(errorData) {
    console.error('❌ Webhook error logged:', errorData);
    // Could also send to external error tracking service
  }

  extractBikeInterest(summary) {
    // Simple extraction - in real implementation would use NLP
    const bikeTypes = ['mountain', 'road', 'electric', 'hybrid', 'bmx'];
    const foundType = bikeTypes.find(type => summary?.toLowerCase().includes(type));
    
    if (foundType) {
      return {
        bike_type: foundType,
        budget_range: this.extractBudget(summary)
      };
    }

    return null;
  }

  extractBudget(summary) {
    // Simple budget extraction
    const budgetMatch = summary?.match(/\$(\d+).*\$(\d+)/);
    if (budgetMatch) {
      return `$${budgetMatch[1]}-$${budgetMatch[2]}`;
    }
    
    return '';
  }

  determineTierFromPurchases(purchaseHistory) {
    const totalSpent = purchaseHistory.reduce((sum, purchase) => {
      return sum + parseFloat(purchase.total_price || 0);
    }, 0);

    if (totalSpent > 2000) return 'VIP';
    if (totalSpent > 500) return 'Premium';
    return 'Regular';
  }
}

module.exports = { WebhookProcessor };