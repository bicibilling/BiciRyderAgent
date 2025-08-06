/**
 * Webhook Routes
 * Handle webhooks from external services (ElevenLabs, Twilio, Shopify, HubSpot)
 */

const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * ElevenLabs webhook handler
 * Handles conversation events from ElevenLabs Conversational AI
 */
router.post('/elevenlabs/conversation',
  // Verify ElevenLabs signature
  (req, res, next) => {
    const signature = req.headers['x-elevenlabs-signature'];
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({
          success: false,
          error: 'Invalid ElevenLabs signature'
        });
      }
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const webhookData = req.body;
    const { type, conversation_id, data } = webhookData;
    
    console.log(`📞 ElevenLabs webhook: ${type} for conversation ${conversation_id}`);
    
    switch (type) {
      case 'conversation_started':
        await handleConversationStarted(conversation_id, data);
        break;
        
      case 'conversation_ended':
        await handleConversationEnded(conversation_id, data);
        break;
        
      case 'user_transcript':
        await handleUserTranscript(conversation_id, data);
        break;
        
      case 'agent_response':
        await handleAgentResponse(conversation_id, data);
        break;
        
      case 'client_tool_call':
        await handleClientToolCall(conversation_id, data);
        break;
        
      case 'conversation_metadata':
        await handleConversationMetadata(conversation_id, data);
        break;
        
      case 'error':
        await handleConversationError(conversation_id, data);
        break;
        
      default:
        console.warn(`Unknown ElevenLabs webhook type: ${type}`);
    }
    
    res.json({ success: true, processed: true });
  })
);

/**
 * Twilio webhook handler
 * Handles call status updates and events
 */
router.post('/twilio/call-status',
  // Verify Twilio signature
  (req, res, next) => {
    const signature = req.headers['x-twilio-signature'];
    const secret = process.env.TWILIO_AUTH_TOKEN;
    
    if (secret && signature) {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(Buffer.from(url + Object.keys(req.body).sort().map(key => key + req.body[key]).join(''), 'utf-8'))
        .digest('base64');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Twilio signature'
        });
      }
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const {
      CallSid,
      CallStatus,
      From,
      To,
      Duration,
      CallDuration,
      RecordingUrl,
      RecordingSid
    } = req.body;
    
    console.log(`📞 Twilio webhook: ${CallStatus} for call ${CallSid}`);
    
    switch (CallStatus) {
      case 'ringing':
        await handleCallRinging(CallSid, From, To);
        break;
        
      case 'in-progress':
        await handleCallInProgress(CallSid, From, To);
        break;
        
      case 'completed':
        await handleCallCompleted(CallSid, From, To, Duration, RecordingUrl);
        break;
        
      case 'busy':
      case 'no-answer':
      case 'failed':
        await handleCallFailed(CallSid, From, To, CallStatus);
        break;
        
      default:
        console.warn(`Unknown Twilio call status: ${CallStatus}`);
    }
    
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  })
);

/**
 * Shopify webhook handler
 * Handles order and inventory updates
 */
router.post('/shopify/orders',
  // Verify Shopify signature
  (req, res, next) => {
    const signature = req.headers['x-shopify-hmac-sha256'];
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('base64');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Shopify signature'
        });
      }
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const order = req.body;
    const webhookTopic = req.headers['x-shopify-topic'];
    
    console.log(`🛒 Shopify webhook: ${webhookTopic} for order ${order.id}`);
    
    switch (webhookTopic) {
      case 'orders/create':
        await handleOrderCreated(order);
        break;
        
      case 'orders/updated':
        await handleOrderUpdated(order);
        break;
        
      case 'orders/paid':
        await handleOrderPaid(order);
        break;
        
      case 'orders/cancelled':
        await handleOrderCancelled(order);
        break;
        
      case 'orders/fulfilled':
        await handleOrderFulfilled(order);
        break;
        
      default:
        console.warn(`Unknown Shopify webhook topic: ${webhookTopic}`);
    }
    
    res.json({ success: true });
  })
);

/**
 * HubSpot webhook handler
 * Handles contact and deal updates
 */
router.post('/hubspot/contacts',
  // Verify HubSpot signature (if configured)
  (req, res, next) => {
    // HubSpot signature verification would go here
    next();
  },
  asyncHandler(async (req, res) => {
    const webhookData = req.body;
    const { subscriptionType, eventId, propertyName, changeSource } = webhookData;
    
    console.log(`👥 HubSpot webhook: ${subscriptionType} event ${eventId}`);
    
    if (subscriptionType === 'contact.propertyChange') {
      await handleContactPropertyChange(webhookData);
    } else if (subscriptionType === 'contact.creation') {
      await handleContactCreation(webhookData);
    } else if (subscriptionType === 'contact.deletion') {
      await handleContactDeletion(webhookData);
    }
    
    res.json({ success: true });
  })
);

/**
 * Calendar webhook handler
 * Handles appointment and event updates
 */
router.post('/calendar/events',
  asyncHandler(async (req, res) => {
    const eventData = req.body;
    const { type, event_id, calendar_id } = eventData;
    
    console.log(`📅 Calendar webhook: ${type} for event ${event_id}`);
    
    switch (type) {
      case 'event_created':
        await handleEventCreated(eventData);
        break;
        
      case 'event_updated':
        await handleEventUpdated(eventData);
        break;
        
      case 'event_cancelled':
        await handleEventCancelled(eventData);
        break;
        
      default:
        console.warn(`Unknown calendar webhook type: ${type}`);
    }
    
    res.json({ success: true });
  })
);

// ============================================
// ElevenLabs Handler Functions
// ============================================

async function handleConversationStarted(conversationId, data) {
  const { customer_phone, agent_id, organization_id } = data;
  
  // Store conversation state
  // Broadcast to dashboard
  // Create lead record
  
  console.log(`🎯 Conversation started: ${conversationId} with ${customer_phone}`);
}

async function handleConversationEnded(conversationId, data) {
  const { duration, outcome, customer_satisfaction, transcript } = data;
  
  // Update conversation record
  // Calculate analytics
  // Trigger follow-up actions
  
  console.log(`✅ Conversation ended: ${conversationId} - Duration: ${duration}s, Outcome: ${outcome}`);
}

async function handleUserTranscript(conversationId, data) {
  const { text, confidence, timestamp } = data;
  
  // Store transcript
  // Update real-time display
  // Trigger AI analysis
  
  console.log(`💬 User said: "${text}" (confidence: ${confidence})`);
}

async function handleAgentResponse(conversationId, data) {
  const { text, confidence, intent, entities } = data;
  
  // Store agent response
  // Update dashboard
  // Log AI performance metrics
  
  console.log(`🤖 AI responded: "${text}" (intent: ${intent})`);
}

async function handleClientToolCall(conversationId, data) {
  const { tool_name, parameters, tool_call_id } = data;
  
  // Execute tool call
  // Return result to ElevenLabs
  
  console.log(`🔧 Tool called: ${tool_name} with params:`, parameters);
  
  // Mock tool execution result
  const result = await executeToolCall(tool_name, parameters);
  
  // In production, send result back to ElevenLabs
  return result;
}

async function handleConversationMetadata(conversationId, data) {
  const { customer_info, lead_qualification, sentiment_analysis } = data;
  
  // Update customer profile
  // Update lead scoring
  // Store analytics data
  
  console.log(`📊 Conversation metadata updated for ${conversationId}`);
}

async function handleConversationError(conversationId, data) {
  const { error_type, error_message, timestamp } = data;
  
  // Log error
  // Alert administrators
  // Attempt recovery
  
  console.error(`❌ Conversation error: ${error_type} - ${error_message}`);
}

// ============================================
// Twilio Handler Functions
// ============================================

async function handleCallRinging(callSid, from, to) {
  console.log(`📞 Call ringing: ${callSid} from ${from} to ${to}`);
  
  // Update call status
  // Notify dashboard
}

async function handleCallInProgress(callSid, from, to) {
  console.log(`📞 Call in progress: ${callSid}`);
  
  // Update call status
  // Start recording if needed
}

async function handleCallCompleted(callSid, from, to, duration, recordingUrl) {
  console.log(`📞 Call completed: ${callSid} - Duration: ${duration}s`);
  
  // Update call record
  // Process recording
  // Calculate costs
  // Trigger follow-up
}

async function handleCallFailed(callSid, from, to, status) {
  console.log(`📞 Call failed: ${callSid} - Status: ${status}`);
  
  // Log failure
  // Schedule retry if appropriate
  // Alert administrators
}

// ============================================
// Shopify Handler Functions
// ============================================

async function handleOrderCreated(order) {
  const { id, customer, line_items, total_price } = order;
  
  console.log(`🛒 Order created: ${id} for $${total_price}`);
  
  // Update customer profile
  // Trigger order confirmation
  // Update inventory insights
}

async function handleOrderUpdated(order) {
  console.log(`🛒 Order updated: ${order.id}`);
  
  // Sync order changes
  // Update customer journey
}

async function handleOrderPaid(order) {
  console.log(`💰 Order paid: ${order.id}`);
  
  // Confirm payment
  // Trigger fulfillment
  // Update revenue metrics
}

async function handleOrderCancelled(order) {
  console.log(`❌ Order cancelled: ${order.id}`);
  
  // Process cancellation
  // Update inventory
  // Trigger customer retention
}

async function handleOrderFulfilled(order) {
  console.log(`📦 Order fulfilled: ${order.id}`);
  
  // Update order status
  // Send tracking info
  // Schedule follow-up
}

// ============================================
// HubSpot Handler Functions
// ============================================

async function handleContactPropertyChange(data) {
  const { objectId, propertyName, propertyValue } = data;
  
  console.log(`👥 Contact ${objectId} property changed: ${propertyName} = ${propertyValue}`);
  
  // Sync contact changes
  // Update lead scoring
  // Trigger automations
}

async function handleContactCreation(data) {
  console.log(`👥 New contact created:`, data);
  
  // Sync new contact
  // Initialize lead scoring
  // Trigger welcome sequence
}

async function handleContactDeletion(data) {
  console.log(`👥 Contact deleted:`, data);
  
  // Clean up records
  // Update analytics
}

// ============================================
// Calendar Handler Functions
// ============================================

async function handleEventCreated(data) {
  const { event_id, title, start_time, attendees } = data;
  
  console.log(`📅 Event created: ${title} at ${start_time}`);
  
  // Store appointment
  // Send confirmations
  // Update availability
}

async function handleEventUpdated(data) {
  console.log(`📅 Event updated:`, data);
  
  // Sync changes
  // Notify attendees
}

async function handleEventCancelled(data) {
  console.log(`📅 Event cancelled:`, data);
  
  // Update status
  // Notify attendees
  // Free up time slot
}

// ============================================
// Utility Functions  
// ============================================

async function executeToolCall(toolName, parameters) {
  // Mock tool execution - in production, implement actual tool logic
  
  const tools = {
    'get_store_hours': () => ({
      hours: 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
      timezone: 'America/Toronto'
    }),
    
    'check_inventory': (params) => ({
      product: params.product_name,
      in_stock: true,
      quantity: 15,
      price: 899.99
    }),
    
    'book_appointment': (params) => ({
      appointment_id: `apt_${Date.now()}`,
      confirmed: true,
      date_time: params.preferred_time,
      service: params.service_type
    }),
    
    'create_lead': (params) => ({
      lead_id: `lead_${Date.now()}`,
      customer_phone: params.phone,
      status: 'created',
      score: 75
    })
  };
  
  const toolFunction = tools[toolName];
  if (toolFunction) {
    return toolFunction(parameters);
  }
  
  return { error: `Unknown tool: ${toolName}` };
}

module.exports = router;