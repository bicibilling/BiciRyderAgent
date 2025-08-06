/**
 * BICI AI Voice System - Comprehensive Webhook Handlers
 * Handles all webhook events from ElevenLabs, Twilio, Shopify, and other integrations
 */

const express = require('express');
const router = express.Router();
const { TwilioIntegration } = require('../services/twilio-integration');
const { SMSAutomation } = require('../services/sms-automation');
const { ConversationLogger } = require('../services/conversation-logger');
const { WebhookProcessor } = require('../services/webhook-processor');
const { config } = require('../config');

// Initialize services
const twilioIntegration = new TwilioIntegration();
const smsAutomation = new SMSAutomation();
const conversationLogger = new ConversationLogger();
const webhookProcessor = new WebhookProcessor();

// Middleware for webhook validation and logging
router.use('/elevenlabs/*', async (req, res, next) => {
  await webhookProcessor.validateAndLogWebhook(req, res, next, 'elevenlabs');
});

router.use('/twilio/*', async (req, res, next) => {
  await webhookProcessor.validateAndLogWebhook(req, res, next, 'twilio');
});

router.use('/shopify/*', async (req, res, next) => {
  await webhookProcessor.validateAndLogWebhook(req, res, next, 'shopify');
});

// =============================================
// ELEVENLABS WEBHOOK HANDLERS
// =============================================

/**
 * ElevenLabs Twilio Personalization Webhook (SOW requirement)
 * Called when inbound call is received to inject customer context
 */
router.post('/elevenlabs/twilio-personalization', async (req, res) => {
  try {
    await twilioIntegration.handlePersonalizationWebhook(req, res);
  } catch (error) {
    console.error('❌ Personalization webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ElevenLabs Call Events Webhook
 * Handles conversation events and updates
 */
router.post('/elevenlabs/call-events', async (req, res) => {
  try {
    const {
      event_type,
      conversation_id,
      call_sid,
      phone_number,
      event_data
    } = req.body;

    console.log(`🎤 ElevenLabs event: ${event_type} for conversation ${conversation_id}`);

    // Process different event types
    switch (event_type) {
      case 'conversation_started':
        await conversationLogger.logConversationStart({
          conversation_id,
          call_sid,
          phone_number,
          event_data
        });
        break;

      case 'conversation_ended':
        await conversationLogger.logConversationEnd({
          conversation_id,
          call_sid,
          phone_number,
          event_data
        });
        break;

      case 'user_speech':
        await conversationLogger.logUserSpeech({
          conversation_id,
          transcript: event_data.transcript,
          confidence: event_data.confidence,
          timestamp: event_data.timestamp
        });
        break;

      case 'agent_response':
        await conversationLogger.logAgentResponse({
          conversation_id,
          response: event_data.response,
          timestamp: event_data.timestamp
        });
        break;

      case 'tool_call':
        await conversationLogger.logToolCall({
          conversation_id,
          tool_name: event_data.tool_name,
          tool_arguments: event_data.arguments,
          tool_result: event_data.result
        });
        break;

      case 'error_occurred':
        await conversationLogger.logError({
          conversation_id,
          error_type: event_data.error_type,
          error_message: event_data.error_message
        });
        break;

      default:
        console.warn(`⚠️  Unknown ElevenLabs event type: ${event_type}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ ElevenLabs call events webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ElevenLabs Conversation Status Webhook
 * Handles conversation lifecycle events
 */
router.post('/elevenlabs/conversation-status', async (req, res) => {
  try {
    const {
      conversation_id,
      status,
      call_duration,
      summary,
      classification,
      participants
    } = req.body;

    console.log(`🎤 Conversation status update: ${conversation_id} - ${status}`);

    await conversationLogger.updateConversationStatus({
      conversation_id,
      status,
      call_duration,
      summary,
      classification,
      participants
    });

    // Trigger follow-up actions based on status
    if (status === 'completed') {
      await webhookProcessor.triggerConversationCompletionActions({
        conversation_id,
        call_duration,
        summary,
        classification
      });
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Conversation status webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// TWILIO WEBHOOK HANDLERS
// =============================================

/**
 * Twilio Call Status Webhook
 * Handles call lifecycle events
 */
router.post('/twilio/call-status', async (req, res) => {
  try {
    await twilioIntegration.handleCallStatusWebhook(req, res);
  } catch (error) {
    console.error('❌ Twilio call status webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Twilio SMS Status Webhook
 * Handles SMS delivery status updates
 */
router.post('/twilio/sms-status', async (req, res) => {
  try {
    await smsAutomation.handleSMSStatusWebhook(req, res);
  } catch (error) {
    console.error('❌ Twilio SMS status webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Twilio Incoming SMS Webhook
 * Handles incoming SMS messages
 */
router.post('/twilio/sms-incoming', async (req, res) => {
  try {
    await smsAutomation.handleIncomingSMS(req, res);
  } catch (error) {
    console.error('❌ Twilio incoming SMS webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Twilio Recording Status Webhook
 * Handles call recording status updates
 */
router.post('/twilio/recording-status', async (req, res) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingStatus,
      RecordingDuration
    } = req.body;

    console.log(`🎙️  Recording status: ${RecordingSid} - ${RecordingStatus}`);

    await conversationLogger.updateRecordingStatus({
      call_sid: CallSid,
      recording_sid: RecordingSid,
      recording_url: RecordingUrl,
      recording_status: RecordingStatus,
      recording_duration: RecordingDuration
    });

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Twilio recording status webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// =============================================
// SHOPIFY WEBHOOK HANDLERS
// =============================================

/**
 * Shopify Order Creation Webhook
 * Handles new order notifications
 */
router.post('/shopify/orders/create', async (req, res) => {
  try {
    console.log('🛒 New Shopify order received');
    
    const order = req.body;
    
    // Process order for potential follow-up actions
    await webhookProcessor.processShopifyOrder({
      order_id: order.id,
      order_number: order.order_number,
      customer: order.customer,
      line_items: order.line_items,
      total_price: order.total_price,
      created_at: order.created_at
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Shopify order webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Shopify Order Update Webhook
 * Handles order status changes
 */
router.post('/shopify/orders/update', async (req, res) => {
  try {
    const order = req.body;
    
    console.log(`🛒 Shopify order updated: ${order.order_number} - ${order.fulfillment_status}`);
    
    // Trigger SMS notifications for significant status changes
    if (order.fulfillment_status === 'fulfilled' || order.fulfillment_status === 'shipped') {
      await webhookProcessor.triggerOrderStatusSMS(order);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Shopify order update webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Shopify Customer Creation Webhook
 * Handles new customer registrations
 */
router.post('/shopify/customers/create', async (req, res) => {
  try {
    const customer = req.body;
    
    console.log(`👤 New Shopify customer: ${customer.email}`);
    
    // Create lead record for new customer
    await webhookProcessor.createLeadFromShopifyCustomer(customer);

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Shopify customer webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// HUBSPOT WEBHOOK HANDLERS
// =============================================

/**
 * HubSpot Contact Update Webhook
 * Handles contact property changes
 */
router.post('/hubspot/contact-update', async (req, res) => {
  try {
    const { objectId, propertyName, propertyValue, eventType } = req.body;
    
    console.log(`👤 HubSpot contact update: ${objectId} - ${propertyName}`);
    
    // Sync changes back to local database
    await webhookProcessor.syncHubSpotContact({
      contact_id: objectId,
      property_name: propertyName,
      property_value: propertyValue,
      event_type: eventType
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ HubSpot webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// GOOGLE CALENDAR WEBHOOK HANDLERS
// =============================================

/**
 * Google Calendar Event Update Webhook
 * Handles appointment changes
 */
router.post('/google/calendar-update', async (req, res) => {
  try {
    const { eventId, eventType, calendarId } = req.body;
    
    console.log(`📅 Google Calendar update: ${eventId} - ${eventType}`);
    
    await webhookProcessor.processCalendarUpdate({
      event_id: eventId,
      event_type: eventType,
      calendar_id: calendarId
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Google Calendar webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// HEALTH CHECK AND TESTING ENDPOINTS
// =============================================

/**
 * Webhook Health Check
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    webhooks: {
      elevenlabs: 'active',
      twilio: 'active',
      shopify: config.integrations.shopify.accessToken ? 'active' : 'inactive',
      hubspot: config.integrations.hubspot.accessToken ? 'active' : 'inactive'
    }
  });
});

/**
 * Test Webhook Endpoint (Development only)
 */
if (config.server.nodeEnv === 'development') {
  router.post('/test/:service', async (req, res) => {
    try {
      const { service } = req.params;
      
      console.log(`🧪 Test webhook received for ${service}:`, req.body);
      
      res.status(200).json({
        success: true,
        service: service,
        timestamp: new Date().toISOString(),
        body: req.body
      });

    } catch (error) {
      console.error('❌ Test webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

/**
 * Webhook Analytics Endpoint
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await webhookProcessor.getWebhookAnalytics();
    res.status(200).json(analytics);
  } catch (error) {
    console.error('❌ Webhook analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// ERROR HANDLING MIDDLEWARE
// =============================================

router.use((error, req, res, next) => {
  console.error('❌ Webhook route error:', error);
  
  // Log error for debugging
  webhookProcessor.logWebhookError({
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    headers: req.headers
  });

  res.status(500).json({
    error: 'Webhook processing failed',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;