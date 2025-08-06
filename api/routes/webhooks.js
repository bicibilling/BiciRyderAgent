/**
 * Webhook Routes
 * Handle webhooks from external services (ElevenLabs, Twilio, Shopify, HubSpot)
 */

const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Import conversation management functions
const conversationRoutes = require('./conversations');
const {
  addToConversationHistory,
  broadcastConversationUpdate,
  buildDynamicVariables,
  continueConversationWithSMS,
  storeConversationSummary,
  isUnderHumanControl
} = conversationRoutes;

// Import human control management functions
let humanControlRoutes;
try {
  humanControlRoutes = require('./human-control');
} catch (error) {
  console.warn('Human control routes not available:', error.message);
}

/**
 * ElevenLabs Conversation Initiation Webhook
 * Inject context when calls start (inbound calls)
 */
router.post('/elevenlabs/conversation-initiation',
  // Verify ElevenLabs signature
  (req, res, next) => {
    const signature = req.headers['xi-signature'];
    const secret = process.env.ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid ElevenLabs conversation-initiation signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid ElevenLabs signature'
        });
      }
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const { caller_id, conversation_id, client_data } = req.body;
    
    console.log(`🎯 ElevenLabs conversation initiation: ${conversation_id} from ${caller_id}`);
    
    // Rate limiting check
    const rateLimitResult = checkWebhookRateLimit(`call_${caller_id}`, 20, 300000); // 20 calls per 5 minutes
    if (!rateLimitResult.allowed) {
      console.warn(`⚠️ Rate limit exceeded for calls from ${caller_id}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded'
      });
    }
    
    try {
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(caller_id);
      if (!normalizedPhone) {
        console.error('Invalid caller_id format:', caller_id);
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format'
        });
      }
      
      // Find organization by phone number
      const organizationId = await getOrganizationByPhoneNumber(caller_id);
      if (!organizationId) {
        console.warn('No organization found for phone number:', caller_id);
      }
      
      // Find lead data from database
      let leadData = await findLeadByPhone(caller_id, organizationId);
      
      // Auto-create lead if doesn't exist for inbound calls
      if (!leadData && organizationId) {
        console.log(`🔧 Auto-creating lead for inbound call from ${caller_id}`);
        
        try {
          // Create new lead with minimal info
          const newLeadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          leadData = {
            id: newLeadId,
            customerName: `Customer ${caller_id.slice(-4)}`, // Use last 4 digits as temp name
            phoneNumber: caller_id,
            leadStatus: 'new',
            leadSource: 'inbound_call',
            createdAt: new Date().toISOString(),
            organizationId: organizationId
          };
          
          // Store in leads system - this will be picked up by the leads API
          // The leadData object above contains all necessary fields for auto-creation
          
          console.log(`✅ Auto-created lead: ${newLeadId} for ${caller_id}`);
          
          // Broadcast lead creation to UI
          broadcastConversationUpdate({
            type: 'lead_auto_created',
            leadId: newLeadId,
            phoneNumber: caller_id,
            organizationId: organizationId,
            customerName: leadData.customerName,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error('Failed to auto-create lead:', error);
          // Continue without lead data
        }
      }
      
      // Build dynamic variables with comprehensive conversation context
      const dynamicVariables = await buildDynamicVariables(caller_id, organizationId, leadData);
      
      // Store call initiation in conversation history with detailed context
      addToConversationHistory(
        caller_id,
        `Inbound AI call initiated - Conversation ID: ${conversation_id}`,
        'system',
        'voice',
        organizationId
      );
      
      // Broadcast call initiation to UI with comprehensive data
      broadcastConversationUpdate({
        type: 'call_initiated',
        leadId: leadData?.id || null,
        phoneNumber: caller_id,
        organizationId,
        callType: 'inbound',
        conversationId: conversation_id,
        dynamicVariables: dynamicVariables,
        customerName: leadData?.customerName || dynamicVariables.customer_name,
        leadStatus: dynamicVariables.lead_status,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Context built for ${caller_id}:`, {
        conversationContextLength: dynamicVariables.conversation_context.length,
        customerName: dynamicVariables.customer_name,
        leadStatus: dynamicVariables.lead_status,
        organizationId
      });
      
      // Return dynamic variables to ElevenLabs
      res.json({ 
        success: true,
        dynamic_variables: dynamicVariables 
      });
    } catch (error) {
      console.error('Error building conversation context:', error);
      
      // Return safe defaults if context building fails
      const fallbackVariables = {
        conversation_context: "No previous conversation",
        customer_name: "Customer",
        organization_name: await getOrganizationName("default"),
        lead_status: "New Inquiry",
        previous_summary: "No previous calls",
        organization_id: organizationId || "default",
        caller_type: "new_caller",
        has_conversation_history: "false",
        total_messages: "0"
      };
      
      res.json({
        success: true,
        dynamic_variables: fallbackVariables
      });
    }
  })
);

/**
 * ElevenLabs Post-Call Webhook
 * Process call results and update lead data
 */
router.post('/elevenlabs/post-call',
  // Verify ElevenLabs signature with enhanced validation
  (req, res, next) => {
    const signature = req.headers['xi-signature'];
    const secret = process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid ElevenLabs post-call signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid ElevenLabs signature'
        });
      }
    } else {
      console.warn('⚠️ No HMAC signature verification for ElevenLabs post-call webhook');
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const { 
      conversation_id, 
      phone_number, 
      transcript, 
      analysis, 
      metadata,
      call_duration,
      customer_phone,
      agent_phone,
      call_outcome,
      client_data 
    } = req.body;
    
    console.log(`✅ ElevenLabs post-call: ${conversation_id} with ${phone_number || customer_phone}`);
    
    try {
      // Use phone_number or customer_phone
      const customerPhone = phone_number || customer_phone;
      if (!customerPhone) {
        console.error('No customer phone number provided in post-call webhook');
        return res.status(400).json({
          success: false,
          error: 'Customer phone number is required'
        });
      }
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(customerPhone);
      
      // Get organization from phone number
      const organizationId = await getOrganizationByPhoneNumber(customerPhone);
      
      // Find lead data
      const leadData = await findLeadByPhone(customerPhone, organizationId);
      const leadId = leadData?.id || client_data?.lead_id;
      
      // Process transcript and extract comprehensive insights
      const callAnalysis = await processCallTranscript(transcript, customerPhone, organizationId, {
        conversation_id,
        call_duration,
        call_outcome,
        analysis,
        metadata
      });
      
      // Store detailed call completion message in conversation history
      const callSummaryMessage = [
        `Call completed - ID: ${conversation_id}`,
        `Duration: ${call_duration || analysis?.duration || 'Unknown'}`,
        `Outcome: ${call_outcome || 'Unknown'}`,
        callAnalysis?.summary ? `Summary: ${callAnalysis.summary}` : null
      ].filter(Boolean).join(' | ');
      
      addToConversationHistory(
        customerPhone,
        callSummaryMessage,
        'system',
        'voice',
        organizationId
      );
      
      // Store comprehensive conversation summary
      if (callAnalysis?.summary) {
        storeConversationSummary(customerPhone, callAnalysis.summary, organizationId);
      }
      
      // Update lead with call results (database integration)
      try {
        if (leadId && callAnalysis) {
          await updateLeadFromCallData(leadId, callAnalysis, organizationId, {
            conversation_id,
            call_duration: call_duration || analysis?.duration,
            call_outcome,
            transcript: transcript || null
          });
        }
      } catch (updateError) {
        console.error('Error updating lead data:', updateError);
        // Don't fail the webhook for update errors
      }
      
      // Broadcast comprehensive call end data to UI
      broadcastConversationUpdate({
        type: 'call_ended',
        leadId: leadId,
        phoneNumber: customerPhone,
        organizationId: organizationId,
        conversationId: conversation_id,
        callType: 'inbound',
        duration: call_duration || analysis?.duration,
        outcome: call_outcome,
        summary: callAnalysis?.summary,
        analysis: callAnalysis,
        transcript: transcript ? transcript.substring(0, 500) : null, // Truncate for UI
        sentiment: callAnalysis?.sentiment,
        leadQualityScore: callAnalysis?.leadScore,
        timestamp: new Date().toISOString()
      });
      
      console.log(`📊 Post-call processing completed:`, {
        conversationId: conversation_id,
        customerPhone,
        organizationId,
        leadId,
        duration: call_duration || analysis?.duration,
        hasSummary: !!callAnalysis?.summary,
        hasTranscript: !!transcript
      });
      
      res.json({ 
        success: true,
        processed: {
          conversation_id,
          lead_updated: !!leadId,
          summary_stored: !!callAnalysis?.summary,
          broadcast_sent: true
        }
      });
    } catch (error) {
      console.error('Error processing post-call webhook:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process post-call data',
        details: error.message
      });
    }
  })
);

/**
 * ElevenLabs Conversation Events Webhook
 * Real-time call events during conversation (optional)
 */
router.post('/elevenlabs/conversation-events',
  // Verify ElevenLabs signature
  (req, res, next) => {
    const signature = req.headers['xi-signature'];
    const secret = process.env.ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid ElevenLabs conversation-events signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid ElevenLabs signature'
        });
      }
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const { 
      event_type, 
      conversation_id, 
      phone_number, 
      customer_phone,
      timestamp,
      data,
      event_data 
    } = req.body;
    
    console.log(`🔴 ElevenLabs event: ${event_type} for conversation ${conversation_id}`);
    
    try {
      const customerPhone = phone_number || customer_phone;
      if (!customerPhone) {
        console.warn('No customer phone in conversation event');
        return res.json({ success: true });
      }
      
      const organizationId = await getOrganizationByPhoneNumber(customerPhone);
      const leadData = await findLeadByPhone(customerPhone, organizationId);
      
      // Handle different event types
      switch (event_type) {
        case 'conversation_started':
          await handleConversationStartedEvent(conversation_id, customerPhone, organizationId, leadData, data);
          break;
          
        case 'user_speech_started':
          await handleUserSpeechStarted(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'user_speech_ended':
          await handleUserSpeechEnded(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'agent_response_started':
          await handleAgentResponseStarted(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'agent_response_ended':
          await handleAgentResponseEnded(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'interruption_detected':
          await handleInterruptionDetected(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'silence_timeout':
          await handleSilenceTimeout(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'conversation_transferred':
          await handleConversationTransferred(conversation_id, customerPhone, organizationId, data);
          break;
          
        case 'error_occurred':
          await handleConversationError(conversation_id, customerPhone, organizationId, data);
          break;
          
        default:
          console.log(`Unknown conversation event type: ${event_type}`);
      }
      
      res.json({ 
        success: true, 
        event_processed: event_type,
        conversation_id 
      });
      
    } catch (error) {
      console.error('Error processing conversation event:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process conversation event',
        event_type
      });
    }
  })
);

/**
 * Twilio SMS Incoming Webhook
 * Process incoming SMS and integrate with conversation streaming and human-in-the-loop
 */
router.post('/twilio/sms/incoming',
  // Enhanced Twilio signature verification
  (req, res, next) => {
    const signature = req.headers['x-twilio-signature'];
    const secret = process.env.TWILIO_AUTH_TOKEN;
    
    if (secret && signature) {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const params = Object.keys(req.body).sort().map(key => `${key}${req.body[key]}`).join('');
      const data = url + params;
      
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(data, 'utf8')
        .digest('base64');
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid Twilio SMS signature verification failed');
        return res.status(401).json({
          success: false,
          error: 'Invalid Twilio signature',
          code: 'TWILIO_SIGNATURE_INVALID'
        });
      }
    } else {
      console.warn('⚠️ No HMAC signature verification configured for Twilio SMS webhook');
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const { 
      From, 
      Body, 
      MessageSid, 
      To, 
      FromCity, 
      FromState, 
      FromCountry, 
      ToCity, 
      ToState, 
      ToCountry,
      FromZip,
      ToZip,
      NumMedia,
      MediaContentType0,
      MediaUrl0
    } = req.body;
    
    const truncatedBody = Body.length > 100 ? `${Body.substring(0, 100)}...` : Body;
    console.log(`📱 Incoming SMS from ${From} to ${To}: "${truncatedBody}"`);
    
    try {
      // Rate limiting check for incoming SMS
      const incomingRateLimit = checkWebhookRateLimit(`sms_incoming_${From}`, 30, 300000); // 30 SMS per 5 minutes
      if (!incomingRateLimit.allowed) {
        console.warn(`⚠️ Incoming SMS rate limit exceeded for ${From}`);
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          code: 'SMS_RATE_LIMIT_EXCEEDED',
          resetTime: incomingRateLimit.resetTime
        });
      }
      
      // Validate and normalize phone numbers
      const fromNormalized = normalizePhoneNumber(From);
      const toNormalized = normalizePhoneNumber(To);
      
      if (!fromNormalized || !toNormalized) {
        console.error('❌ Invalid phone number format in SMS:', { From, To });
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format',
          code: 'INVALID_PHONE_FORMAT'
        });
      }
      
      // Validate message content
      if (!Body || Body.trim().length === 0) {
        console.error('❌ Empty SMS body received');
        return res.status(400).json({
          success: false,
          error: 'Empty message body',
          code: 'EMPTY_MESSAGE_BODY'
        });
      }
      
      if (Body.length > 1600) {
        console.warn('⚠️ SMS body exceeds typical limit, truncating');
      }
      
      // Get organization context by the 'To' number (our business number)
      const organizationId = await getOrganizationByPhoneNumber(To);
      if (!organizationId) {
        console.warn(`⚠️ No organization found for business number: ${To}, using default`);
      }
      
      // Find or create lead with enhanced data
      let leadData = await findLeadByPhone(From, organizationId);
      if (!leadData) {
        leadData = await createLeadFromSMS(From, organizationId, {
          messageBody: Body,
          messageSid: MessageSid,
          location: { 
            city: FromCity, 
            state: FromState, 
            country: FromCountry,
            zipCode: FromZip
          },
          hasMedia: parseInt(NumMedia) > 0,
          mediaInfo: NumMedia > 0 ? {
            contentType: MediaContentType0,
            url: MediaUrl0
          } : null
        });
        console.log(`📝 Created new lead from SMS: ${leadData?.id}`);
      } else {
        // Update last contact and interaction count
        leadData.lastContactDate = new Date().toISOString();
        leadData.interactionCount = (leadData.interactionCount || 0) + 1;
      }
      
      // Store in conversation history with comprehensive metadata
      const conversationMessage = addToConversationHistory(From, Body, 'user', 'text', organizationId);
      
      // Log SMS message to database with full context
      await logSMSMessage({
        twilioMessageSid: MessageSid,
        phoneNumber: From,
        normalizedPhoneNumber: fromNormalized,
        toNumber: To,
        messageBody: Body,
        direction: 'inbound',
        organizationId: organizationId,
        leadId: leadData?.id,
        conversationMessageId: conversationMessage?.id,
        location: {
          city: FromCity,
          state: FromState,
          country: FromCountry,
          zipCode: FromZip
        },
        hasMedia: parseInt(NumMedia) > 0,
        mediaInfo: NumMedia > 0 ? {
          contentType: MediaContentType0,
          url: MediaUrl0
        } : null,
        status: 'received',
        receivedAt: new Date().toISOString()
      });
      
      // Check if under human control and handle appropriately
      if (isUnderHumanControl(From, organizationId)) {
        console.log('📱➡️🧑‍💼 SMS received during human control, routing to human agent');
        
        const humanSession = getHumanControlSession(From, organizationId);
        
        // Queue message for human agent if available
        if (humanControlRoutes && humanControlRoutes.handleIncomingSMSDuringHumanControl) {
          const handlingResult = await humanControlRoutes.handleIncomingSMSDuringHumanControl(
            From, 
            Body, 
            organizationId
          );
          
          if (handlingResult.handled) {
            console.log(`✅ SMS queued for human agent: ${humanSession?.agentName}`);
          }
        }
        
        // Broadcast to human agent interface with priority flag
        broadcastConversationUpdate({
          type: 'customer_sms_during_human_control',
          leadId: leadData?.id,
          phoneNumber: From,
          message: Body,
          messageSid: MessageSid,
          organizationId: organizationId,
          humanAgent: humanSession?.agentName,
          agentId: humanSession?.agentId,
          conversationMessage: conversationMessage,
          priority: 'high',
          hasMedia: parseInt(NumMedia) > 0,
          timestamp: new Date().toISOString()
        });
        
        return res.status(200).json({
          success: true,
          message: 'SMS queued for human agent',
          data: {
            messageId: MessageSid,
            handledBy: 'human_agent',
            agentName: humanSession?.agentName,
            queueStatus: 'queued'
          }
        });
      }
      
      // Broadcast SMS to UI with comprehensive data for real-time display
      broadcastConversationUpdate({
        type: 'sms_received',
        leadId: leadData?.id,
        phoneNumber: From,
        message: Body,
        messageSid: MessageSid,
        organizationId: organizationId,
        customerName: leadData?.customerName,
        conversationMessage: conversationMessage,
        isNewLead: !leadData?.hasExistingRecord,
        hasMedia: parseInt(NumMedia) > 0,
        location: {
          city: FromCity,
          state: FromState,
          country: FromCountry
        },
        leadData: {
          leadStatus: leadData?.leadStatus,
          leadQualityScore: leadData?.leadQualityScore,
          interactionCount: leadData?.interactionCount
        },
        timestamp: new Date().toISOString()
      });
      
      // Continue conversation with ElevenLabs if not under human control
      try {
        const continuationResult = await continueConversationWithSMS(From, Body, organizationId, {
          leadData: leadData,
          conversationMessage: conversationMessage,
          hasMedia: parseInt(NumMedia) > 0
        });
        
        if (continuationResult?.success) {
          console.log(`🤖 SMS conversation context built and forwarded to ElevenLabs`);
        }
        
        // Check if SMS content suggests immediate outbound call needed
        if (shouldTriggerOutboundCall(Body, leadData)) {
          console.log(`📞 SMS content suggests urgent call needed for ${From}`);
          
          // Broadcast call suggestion to dashboard
          broadcastConversationUpdate({
            type: 'outbound_call_suggested',
            leadId: leadData?.id,
            phoneNumber: From,
            organizationId: organizationId,
            reason: 'urgent_sms_content',
            priority: 'high',
            suggestedBy: 'sms_analysis',
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (smsError) {
        console.error('❌ Error continuing conversation with SMS:', smsError);
        // Don't fail the webhook for SMS continuation errors - log and continue
      }
      
      console.log(`✅ SMS processed successfully:`, {
        messageId: MessageSid,
        from: From,
        organizationId,
        leadId: leadData?.id,
        messageLength: Body.length,
        isNewLead: !leadData?.hasExistingRecord,
        hasMedia: parseInt(NumMedia) > 0,
        underHumanControl: false
      });
      
      res.status(200).json({
        success: true,
        message: 'SMS processed successfully',
        data: {
          messageId: MessageSid,
          leadId: leadData?.id,
          conversationMessageId: conversationMessage?.id,
          organizationId: organizationId,
          processed: true
        }
      });
      
    } catch (error) {
      console.error('❌ Critical error processing incoming SMS:', error);
      
      // Log critical error for monitoring
      try {
        await logSMSError({
          messageId: MessageSid,
          phoneNumber: From,
          error: error.message,
          stack: error.stack,
          requestBody: req.body,
          timestamp: new Date().toISOString()
        });
      } catch (logError) {
        console.error('❌ Failed to log SMS error:', logError);
      }
      
      res.status(500).json({
        success: false,
        error: 'Internal server error processing SMS',
        code: 'SMS_PROCESSING_ERROR',
        messageId: MessageSid
      });
    }
  })
);

/**
 * Twilio SMS Status Callback  
 * Track SMS delivery status and update conversation history
 */
router.post('/twilio/sms/status',
  // Twilio signature verification for status callbacks
  (req, res, next) => {
    const signature = req.headers['x-twilio-signature'];
    const secret = process.env.TWILIO_AUTH_TOKEN;
    
    if (secret && signature) {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const params = Object.keys(req.body).sort().map(key => `${key}${req.body[key]}`).join('');
      const data = url + params;
      
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(data, 'utf8')
        .digest('base64');
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid Twilio SMS status signature verification failed');
        return res.status(401).json({
          success: false,
          error: 'Invalid Twilio signature',
          code: 'TWILIO_STATUS_SIGNATURE_INVALID'
        });
      }
    } else {
      console.warn('⚠️ No HMAC signature verification configured for SMS status webhook');
    }
    
    next();
  },
  asyncHandler(async (req, res) => {
    const { 
      MessageSid, 
      MessageStatus, 
      To, 
      From, 
      ErrorCode, 
      ErrorMessage,
      Price,
      PriceUnit
    } = req.body;
    
    console.log(`📱 SMS status update: ${MessageSid} -> ${MessageStatus}${ErrorCode ? ` (Error: ${ErrorCode})` : ''}`);
    
    try {
      // Rate limiting for status callbacks
      const statusRateLimit = checkWebhookRateLimit(`sms_status_${MessageSid}`, 10, 60000); // 10 status updates per minute per message
      if (!statusRateLimit.allowed) {
        console.warn(`⚠️ SMS status callback rate limit exceeded for ${MessageSid}`);
        return res.status(429).json({
          success: false,
          error: 'Status callback rate limit exceeded',
          code: 'STATUS_RATE_LIMIT_EXCEEDED'
        });
      }
      
      // Determine organization from the From number (our business number for outbound SMS)
      const organizationId = await getOrganizationByPhoneNumber(From) || 
                           await getOrganizationByPhoneNumber(To) ||
                           process.env.DEFAULT_ORGANIZATION_ID ||
                           'bici-demo';
      
      // Find lead for the customer phone number
      const customerPhone = From === organizationId ? To : From;
      const leadData = await findLeadByPhone(customerPhone, organizationId);
      
      // Update SMS status in database
      await updateSMSStatus(MessageSid, {
        status: MessageStatus,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
        price: Price,
        priceUnit: PriceUnit,
        statusUpdatedAt: new Date().toISOString(),
        deliveryAttempts: await incrementDeliveryAttempts(MessageSid)
      });
      
      // Handle different status types
      let statusType = 'delivery_update';
      let shouldNotifyUI = true;
      let priority = 'normal';
      
      switch (MessageStatus.toLowerCase()) {
        case 'sent':
          console.log(`✅ SMS sent successfully: ${MessageSid}`);
          break;
          
        case 'delivered':
          console.log(`📬 SMS delivered: ${MessageSid}`);
          statusType = 'delivery_confirmed';
          break;
          
        case 'undelivered':
          console.warn(`❌ SMS undelivered: ${MessageSid} - ${ErrorCode}: ${ErrorMessage}`);
          statusType = 'delivery_failed';
          priority = 'high';
          await handleSMSDeliveryFailure(MessageSid, ErrorCode, ErrorMessage, customerPhone, organizationId);
          break;
          
        case 'failed':
          console.error(`❌ SMS failed: ${MessageSid} - ${ErrorCode}: ${ErrorMessage}`);
          statusType = 'delivery_failed';
          priority = 'high';
          await handleSMSDeliveryFailure(MessageSid, ErrorCode, ErrorMessage, customerPhone, organizationId);
          break;
          
        case 'queued':
        case 'accepted':
          console.log(`⏳ SMS ${MessageStatus}: ${MessageSid}`);
          priority = 'low';
          break;
          
        case 'receiving':
        case 'received':
          // These are for inbound messages, less critical for status tracking
          shouldNotifyUI = false;
          break;
          
        default:
          console.log(`🔄 SMS status update: ${MessageSid} -> ${MessageStatus}`);
      }
      
      // Broadcast status update to UI for real-time tracking
      if (shouldNotifyUI) {
        broadcastConversationUpdate({
          type: 'sms_status_update',
          statusType: statusType,
          leadId: leadData?.id,
          phoneNumber: customerPhone,
          messageSid: MessageSid,
          status: MessageStatus,
          errorCode: ErrorCode,
          errorMessage: ErrorMessage,
          price: Price,
          priceUnit: PriceUnit,
          organizationId: organizationId,
          priority: priority,
          timestamp: new Date().toISOString()
        });
      }
      
      // Handle delivery failures with retry logic
      if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
        await handleSMSRetryLogic(MessageSid, customerPhone, organizationId, {
          errorCode: ErrorCode,
          errorMessage: ErrorMessage,
          originalStatus: MessageStatus
        });
      }
      
      // Log successful status processing
      console.log(`✅ SMS status processed: ${MessageSid} (${MessageStatus}) for ${customerPhone}`);
      
      res.status(200).json({
        success: true,
        message: 'SMS status processed',
        data: {
          messageId: MessageSid,
          status: MessageStatus,
          organizationId: organizationId,
          processed: true
        }
      });
      
    } catch (error) {
      console.error('❌ Error processing SMS status update:', error);
      
      // Log status processing error
      try {
        await logSMSError({
          messageId: MessageSid,
          phoneNumber: To,
          error: `Status processing failed: ${error.message}`,
          stack: error.stack,
          requestBody: req.body,
          errorType: 'status_processing',
          timestamp: new Date().toISOString()
        });
      } catch (logError) {
        console.error('❌ Failed to log SMS status error:', logError);
      }
      
      // Still return 200 to prevent Twilio retries for processing errors
      res.status(200).json({
        success: false,
        error: 'Status processing error logged',
        messageId: MessageSid
      });
    }
  })
);

/**
 * ElevenLabs webhook handler (legacy)
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
// Conversation Event Handlers
// ============================================

async function handleConversationStartedEvent(conversationId, customerPhone, organizationId, leadData, eventData) {
  console.log(`🎤 Conversation started: ${conversationId}`);
  
  // Add system message
  addToConversationHistory(
    customerPhone,
    `Voice conversation started - ID: ${conversationId}`,
    'system',
    'voice',
    organizationId
  );
  
  // Broadcast to UI
  broadcastConversationUpdate({
    type: 'conversation_started',
    leadId: leadData?.id,
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    timestamp: new Date().toISOString()
  });
}

async function handleUserSpeechStarted(conversationId, customerPhone, organizationId, eventData) {
  console.log(`🎤 User speech started: ${conversationId}`);
  
  broadcastConversationUpdate({
    type: 'user_speech_started',
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    timestamp: new Date().toISOString()
  });
}

async function handleUserSpeechEnded(conversationId, customerPhone, organizationId, eventData) {
  const { transcript, confidence } = eventData || {};
  
  if (transcript) {
    console.log(`🎤 User said: "${transcript}" (confidence: ${confidence})`);
    
    // Store user speech in conversation history
    addToConversationHistory(
      customerPhone,
      transcript,
      'user',
      'voice',
      organizationId
    );
    
    // Broadcast to UI
    broadcastConversationUpdate({
      type: 'user_speech_ended',
      phoneNumber: customerPhone,
      organizationId,
      conversationId,
      transcript,
      confidence,
      timestamp: new Date().toISOString()
    });
  }
}

async function handleAgentResponseStarted(conversationId, customerPhone, organizationId, eventData) {
  console.log(`🤖 Agent response started: ${conversationId}`);
  
  broadcastConversationUpdate({
    type: 'agent_response_started',
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    timestamp: new Date().toISOString()
  });
}

async function handleAgentResponseEnded(conversationId, customerPhone, organizationId, eventData) {
  const { response_text, intent, entities } = eventData || {};
  
  if (response_text) {
    console.log(`🤖 Agent responded: "${response_text}" (intent: ${intent})`);
    
    // Store agent response in conversation history
    addToConversationHistory(
      customerPhone,
      response_text,
      'agent',
      'voice',
      organizationId
    );
    
    // Broadcast to UI
    broadcastConversationUpdate({
      type: 'agent_response_ended',
      phoneNumber: customerPhone,
      organizationId,
      conversationId,
      response: response_text,
      intent,
      entities,
      timestamp: new Date().toISOString()
    });
  }
}

async function handleInterruptionDetected(conversationId, customerPhone, organizationId, eventData) {
  console.log(`⚠️ Interruption detected: ${conversationId}`);
  
  addToConversationHistory(
    customerPhone,
    'Customer interrupted agent response',
    'system',
    'voice',
    organizationId
  );
  
  broadcastConversationUpdate({
    type: 'interruption_detected',
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    timestamp: new Date().toISOString()
  });
}

async function handleSilenceTimeout(conversationId, customerPhone, organizationId, eventData) {
  console.log(`🔇 Silence timeout: ${conversationId}`);
  
  addToConversationHistory(
    customerPhone,
    'Silence timeout detected during conversation',
    'system',
    'voice',
    organizationId
  );
  
  broadcastConversationUpdate({
    type: 'silence_timeout',
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    timestamp: new Date().toISOString()
  });
}

async function handleConversationTransferred(conversationId, customerPhone, organizationId, eventData) {
  const { transfer_reason, destination } = eventData || {};
  
  console.log(`🔄 Conversation transferred: ${conversationId}`);
  
  addToConversationHistory(
    customerPhone,
    `Conversation transferred - Reason: ${transfer_reason || 'Unknown'}`,
    'system',
    'voice',
    organizationId
  );
  
  broadcastConversationUpdate({
    type: 'conversation_transferred',
    phoneNumber: customerPhone,
    organizationId,
    conversationId,
    transfer_reason,
    destination,
    timestamp: new Date().toISOString()
  });
}

// ============================================
// Enhanced Conversation Helper Functions
// ============================================

// Normalize phone number to consistent format
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters except +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // Add + if missing and appears to be a US number
  if (normalized.match(/^\d{10}$/)) {
    normalized = '+1' + normalized;
  } else if (normalized.match(/^1\d{10}$/)) {
    normalized = '+' + normalized;
  } else if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  
  return normalized;
}

async function getOrganizationByPhoneNumber(phoneNumber) {
  try {
    // Normalize the phone number for lookup
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // In production, query database for organization by phone number
    // For now, implement a lookup based on known business numbers
    const businessNumbers = {
      '+14165551234': 'bici-demo',
      '+14165551235': 'bici-demo', // Additional numbers for same org
    };
    
    const orgId = businessNumbers[normalized];
    if (orgId) {
      return orgId;
    }
    
    // If not found in business numbers, this might be a customer number
    // Return default organization for incoming customer calls
    console.log(`Using default organization for phone number: ${phoneNumber}`);
    return process.env.DEFAULT_ORGANIZATION_ID || 'bici-demo';
    
  } catch (error) {
    console.error('Error looking up organization by phone number:', error);
    return 'bici-demo';
  }
}

async function findLeadByPhone(phoneNumber, organizationId) {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // In production, query database for existing lead
    // Mock implementation with enhanced data structure
    const leadId = `lead_${organizationId}_${normalized.replace(/\D/g, '')}_${Date.now()}`;
    
    // For demo purposes, return mock lead data
    // In production, this would be a database query
    return {
      id: leadId,
      customerName: null, // Would be populated from database
      phoneNumber: phoneNumber,
      phoneNumberNormalized: normalized,
      organizationId: organizationId,
      leadStatus: 'new',
      leadQualityScore: 0,
      lastContactDate: null,
      interactionCount: 0,
      createdAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error finding lead by phone:', error);
    return null;
  }
}

async function createLeadFromSMS(phoneNumber, organizationId, smsData) {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    const leadId = `lead_${organizationId}_${normalized.replace(/\D/g, '')}_${Date.now()}`;
    
    // In production, this would create a lead in the database
    const newLead = {
      id: leadId,
      organizationId: organizationId,
      phoneNumberNormalized: normalized,
      phoneNumber: phoneNumber,
      leadStatus: 'new',
      leadSource: 'sms_inbound',
      leadQualityScore: 50, // Initial score
      customerName: null,
      email: null,
      interactionCount: 1,
      lastContactDate: new Date().toISOString(),
      contactPreferences: {
        sms: true,
        email: false,
        call: true,
        preferredTime: 'business_hours',
        language: 'en'
      },
      bikeInterest: {
        type: null,
        budget: { min: 0, max: 0 },
        usage: null,
        timeline: null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log(`📝 New lead created from SMS: ${leadId}`);
    return newLead;
    
  } catch (error) {
    console.error('Error creating lead from SMS:', error);
    return null;
  }
}

async function processCallTranscript(transcript, phoneNumber, organizationId, additionalData = {}) {
  try {
    if (!transcript) {
      return { 
        summary: 'Call completed with no transcript available',
        sentiment: 'neutral',
        keywords: [],
        leadScore: 50,
        callOutcome: additionalData.call_outcome || 'completed'
      };
    }
    
    // Enhanced transcript analysis
    const transcriptLength = transcript.length;
    const wordCount = transcript.split(' ').length;
    
    // Extract keywords (simple implementation - in production use NLP)
    const keywords = extractKeywords(transcript);
    
    // Analyze sentiment (simple implementation)
    const sentiment = analyzeSentiment(transcript);
    
    // Calculate lead score based on transcript content
    const leadScore = calculateLeadScore(transcript, keywords, sentiment);
    
    // Generate summary using conversation context
    const conversationContext = getConversationHistory(phoneNumber, organizationId);
    const summary = await generateCallSummary(transcript, conversationContext, additionalData);
    
    const analysis = {
      summary,
      sentiment,
      keywords,
      leadScore,
      callOutcome: additionalData.call_outcome || 'completed',
      duration: additionalData.call_duration || Math.round(wordCount * 0.5),
      wordCount,
      transcriptLength,
      conversationId: additionalData.conversation_id,
      customerIntents: extractCustomerIntents(transcript),
      actionItems: extractActionItems(transcript),
      followUpRequired: determineFollowUpNeeds(transcript, keywords),
      qualificationLevel: determineQualificationLevel(transcript, keywords),
      processedAt: new Date().toISOString()
    };
    
    console.log(`🔍 Transcript analysis completed:`, {
      phoneNumber,
      wordCount: analysis.wordCount,
      sentiment: analysis.sentiment,
      leadScore: analysis.leadScore,
      keywordsCount: keywords.length
    });
    
    return analysis;
    
  } catch (error) {
    console.error('Error processing call transcript:', error);
    return {
      summary: 'Error processing call transcript',
      sentiment: 'neutral',
      keywords: [],
      leadScore: 50,
      error: error.message
    };
  }
}

async function updateLeadFromCallData(leadId, callAnalysis, organizationId, callData) {
  try {
    // In production, update lead in database with call results
    const updateData = {
      lastContactDate: new Date().toISOString(),
      interactionCount: 1, // Would increment existing count
      leadQualityScore: Math.max(callAnalysis.leadScore || 50, 0),
      leadStatus: callAnalysis.qualificationLevel || 'contacted',
      previousSummary: callAnalysis.summary,
      callHistory: [
        {
          conversationId: callData.conversation_id,
          duration: callData.call_duration,
          outcome: callData.call_outcome,
          summary: callAnalysis.summary,
          timestamp: new Date().toISOString()
        }
      ],
      updatedAt: new Date().toISOString()
    };
    
    console.log(`📊 Lead updated from call data: ${leadId}`);
    return updateData;
    
  } catch (error) {
    console.error('Error updating lead from call data:', error);
    throw error;
  }
}

function shouldTriggerOutboundCall(messageBody, leadData) {
  // Simple heuristics to determine if an outbound call should be triggered
  const urgentKeywords = [
    'urgent', 'emergency', 'asap', 'immediately', 'help',
    'problem', 'broken', 'stuck', 'appointment', 'quote'
  ];
  
  const messageWords = messageBody.toLowerCase().split(' ');
  const hasUrgentKeyword = urgentKeywords.some(keyword => 
    messageWords.some(word => word.includes(keyword))
  );
  
  const isHighValueLead = leadData && leadData.leadQualityScore > 75;
  const isBusinessHours = isCurrentlyBusinessHours();
  
  return hasUrgentKeyword || (isHighValueLead && isBusinessHours);
}

function isCurrentlyBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Business hours: Monday-Friday 9AM-7PM, Saturday-Sunday 10AM-6PM
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    return hour >= 9 && hour < 19;
  } else {
    return hour >= 10 && hour < 18;
  }
}

// Helper functions for transcript analysis
function extractKeywords(transcript) {
  const bikeKeywords = ['bike', 'bicycle', 'mountain', 'road', 'electric', 'ebike', 'repair', 'service', 'tune'];
  const found = [];
  const words = transcript.toLowerCase().split(' ');
  
  bikeKeywords.forEach(keyword => {
    if (words.some(word => word.includes(keyword))) {
      found.push(keyword);
    }
  });
  
  return found;
}

function analyzeSentiment(transcript) {
  const positiveWords = ['great', 'good', 'excellent', 'love', 'perfect', 'yes', 'interested', 'buy'];
  const negativeWords = ['bad', 'terrible', 'no', 'not', 'wrong', 'problem', 'issue', 'cancel'];
  
  const words = transcript.toLowerCase().split(' ');
  let positiveScore = 0;
  let negativeScore = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) positiveScore++;
    if (negativeWords.includes(word)) negativeScore++;
  });
  
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
}

function calculateLeadScore(transcript, keywords, sentiment) {
  let score = 50; // Base score
  
  // Adjust for keywords
  score += keywords.length * 10;
  
  // Adjust for sentiment
  if (sentiment === 'positive') score += 20;
  if (sentiment === 'negative') score -= 10;
  
  // Adjust for engagement indicators
  const engagementWords = ['interested', 'want', 'need', 'buy', 'purchase', 'when', 'how much', 'price'];
  const words = transcript.toLowerCase();
  engagementWords.forEach(word => {
    if (words.includes(word)) score += 5;
  });
  
  return Math.min(Math.max(score, 0), 100);
}

function extractCustomerIntents(transcript) {
  const intents = [];
  const words = transcript.toLowerCase();
  
  if (words.includes('buy') || words.includes('purchase')) intents.push('purchase_intent');
  if (words.includes('repair') || words.includes('fix')) intents.push('service_request');
  if (words.includes('appointment') || words.includes('schedule')) intents.push('appointment_booking');
  if (words.includes('price') || words.includes('cost') || words.includes('how much')) intents.push('price_inquiry');
  if (words.includes('information') || words.includes('tell me about')) intents.push('information_request');
  
  return intents;
}

function extractActionItems(transcript) {
  const actionItems = [];
  const words = transcript.toLowerCase();
  
  if (words.includes('call back') || words.includes('follow up')) {
    actionItems.push({ action: 'follow_up_call', priority: 'medium', dueDate: null });
  }
  if (words.includes('send') && words.includes('email')) {
    actionItems.push({ action: 'send_email', priority: 'low', dueDate: null });
  }
  if (words.includes('appointment')) {
    actionItems.push({ action: 'schedule_appointment', priority: 'high', dueDate: null });
  }
  
  return actionItems;
}

function determineFollowUpNeeds(transcript, keywords) {
  const words = transcript.toLowerCase();
  
  // High priority follow-up indicators
  if (words.includes('think about') || words.includes('consider') || words.includes('maybe')) {
    return { required: true, priority: 'high', reason: 'customer_considering' };
  }
  
  // Medium priority
  if (keywords.length > 2) {
    return { required: true, priority: 'medium', reason: 'high_interest_shown' };
  }
  
  return { required: false, priority: 'low', reason: 'standard_inquiry' };
}

function determineQualificationLevel(transcript, keywords) {
  const words = transcript.toLowerCase();
  let score = 0;
  
  // Budget indicators
  if (words.includes('budget') || words.includes('price') || words.includes('afford')) score += 20;
  
  // Urgency indicators
  if (words.includes('need') || words.includes('asap') || words.includes('urgent')) score += 30;
  
  // Interest level
  if (keywords.length > 3) score += 25;
  
  // Decision making authority
  if (words.includes('i will') || words.includes('i can') || words.includes('my decision')) score += 25;
  
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

async function generateCallSummary(transcript, conversationContext, additionalData) {
  try {
    // Simple summary generation - in production, use AI/ML
    const words = transcript.split(' ');
    const keyPhrases = [];
    
    // Extract key phrases (simplified)
    if (transcript.toLowerCase().includes('interested')) {
      keyPhrases.push('Customer expressed interest');
    }
    if (transcript.toLowerCase().includes('price') || transcript.toLowerCase().includes('cost')) {
      keyPhrases.push('Discussed pricing');
    }
    if (transcript.toLowerCase().includes('appointment')) {
      keyPhrases.push('Appointment mentioned');
    }
    
    let summary = `Call duration: ${additionalData.call_duration || 'unknown'}. `;
    
    if (keyPhrases.length > 0) {
      summary += keyPhrases.join(', ') + '. ';
    }
    
    summary += `Customer engagement level: ${words.length > 100 ? 'high' : 'medium'}.`;
    
    if (conversationContext && conversationContext.length > 0) {
      summary += ` Previous interactions: ${conversationContext.length} messages.`;
    }
    
    return summary;
    
  } catch (error) {
    console.error('Error generating call summary:', error);
    return 'Call completed successfully.';
  }
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

// ============================================
// Rate Limiting for Webhooks
// ============================================

const rateLimitStore = new Map();

function checkWebhookRateLimit(identifier, limit = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, []);
  }
  
  const requests = rateLimitStore.get(identifier);
  
  // Remove old requests outside the window
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);
  rateLimitStore.set(identifier, recentRequests);
  
  // Check if limit exceeded
  if (recentRequests.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: windowStart + windowMs
    };
  }
  
  // Add current request
  recentRequests.push(now);
  
  return {
    allowed: true,
    remaining: limit - recentRequests.length,
    resetTime: windowStart + windowMs
  };
}

// Cleanup rate limit store periodically
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 3600000; // 1 hour
  
  for (const [identifier, requests] of rateLimitStore.entries()) {
    const recentRequests = requests.filter(timestamp => timestamp > oneHourAgo);
    if (recentRequests.length === 0) {
      rateLimitStore.delete(identifier);
    } else {
      rateLimitStore.set(identifier, recentRequests);
    }
  }
}, 300000); // Clean up every 5 minutes

// ============================================
// SMS Helper Functions
// ============================================

async function logSMSMessage(smsData) {
  try {
    // In production, this would log to database
    // For now, store in memory for demo
    console.log(`📝 Logging SMS message: ${smsData.twilioMessageSid}`);
    
    // Mock database logging
    return {
      success: true,
      logged: true,
      messageId: smsData.twilioMessageSid
    };
  } catch (error) {
    console.error('❌ Failed to log SMS message:', error);
    return { success: false, error: error.message };
  }
}

async function logSMSError(errorData) {
  try {
    console.error(`📝 Logging SMS error: ${errorData.messageId} - ${errorData.error}`);
    
    // In production, this would log to error tracking system
    return {
      success: true,
      errorLogged: true,
      messageId: errorData.messageId
    };
  } catch (error) {
    console.error('❌ Failed to log SMS error:', error);
    return { success: false, error: error.message };
  }
}

async function updateSMSStatus(messageSid, statusData) {
  try {
    console.log(`🔄 Updating SMS status: ${messageSid} -> ${statusData.status}`);
    
    // In production, this would update database record
    return {
      success: true,
      updated: true,
      messageId: messageSid,
      status: statusData.status
    };
  } catch (error) {
    console.error('❌ Failed to update SMS status:', error);
    return { success: false, error: error.message };
  }
}

async function incrementDeliveryAttempts(messageSid) {
  try {
    // In production, this would increment delivery attempts counter in database
    console.log(`📊 Incrementing delivery attempts for: ${messageSid}`);
    return 1; // Mock return
  } catch (error) {
    console.error('❌ Failed to increment delivery attempts:', error);
    return 0;
  }
}

async function handleSMSDeliveryFailure(messageSid, errorCode, errorMessage, phoneNumber, organizationId) {
  try {
    console.warn(`🚨 SMS delivery failure: ${messageSid} to ${phoneNumber} - ${errorCode}: ${errorMessage}`);
    
    // Log the failure for monitoring and analysis
    const failureLog = {
      messageId: messageSid,
      phoneNumber: phoneNumber,
      organizationId: organizationId,
      errorCode: errorCode,
      errorMessage: errorMessage,
      failureTime: new Date().toISOString(),
      retryEligible: isRetryEligible(errorCode)
    };
    
    // In production, send to monitoring system
    console.log(`📊 SMS failure logged:`, failureLog);
    
    // Broadcast failure to UI for immediate attention
    broadcastConversationUpdate({
      type: 'sms_delivery_failed',
      phoneNumber: phoneNumber,
      organizationId: organizationId,
      messageSid: messageSid,
      errorCode: errorCode,
      errorMessage: errorMessage,
      retryEligible: failureLog.retryEligible,
      priority: 'high',
      timestamp: new Date().toISOString()
    });
    
    return failureLog;
  } catch (error) {
    console.error('❌ Failed to handle SMS delivery failure:', error);
    return { success: false, error: error.message };
  }
}

async function handleSMSRetryLogic(messageSid, phoneNumber, organizationId, failureData) {
  try {
    const { errorCode, errorMessage, originalStatus } = failureData;
    
    if (!isRetryEligible(errorCode)) {
      console.log(`⚠️ SMS ${messageSid} not eligible for retry (Error: ${errorCode})`);
      return { retryable: false, reason: 'error_not_retryable' };
    }
    
    // Check retry attempts (in production, get from database)
    const currentRetries = 0; // Mock value
    const maxRetries = 3;
    
    if (currentRetries >= maxRetries) {
      console.warn(`🛑 SMS ${messageSid} exceeded max retry attempts (${maxRetries})`);
      
      // Mark as permanently failed
      broadcastConversationUpdate({
        type: 'sms_permanently_failed',
        phoneNumber: phoneNumber,
        organizationId: organizationId,
        messageSid: messageSid,
        errorCode: errorCode,
        retryAttempts: currentRetries,
        priority: 'high',
        timestamp: new Date().toISOString()
      });
      
      return { retryable: false, reason: 'max_retries_exceeded' };
    }
    
    // Calculate retry delay (exponential backoff)
    const retryDelay = Math.pow(2, currentRetries) * 60000; // 1, 2, 4 minutes
    
    console.log(`🔄 Scheduling SMS retry for ${messageSid} in ${retryDelay / 1000} seconds`);
    
    // In production, schedule retry using job queue
    // For now, just log the retry intention
    return {
      retryable: true,
      retryDelay: retryDelay,
      retryAttempt: currentRetries + 1,
      scheduledFor: new Date(Date.now() + retryDelay).toISOString()
    };
    
  } catch (error) {
    console.error('❌ Failed to handle SMS retry logic:', error);
    return { success: false, error: error.message };
  }
}

function isRetryEligible(errorCode) {
  // Twilio error codes that are eligible for retry
  const retryableErrors = [
    '30001', // Queue overflow
    '30002', // Account suspended
    '30003', // Unreachable destination handset
    '30004', // Message blocked
    '30005', // Unknown destination handset
    '30006', // Landline or unreachable carrier
    '30007', // Carrier violation
    '30008', // Unknown error
    '30009', // Missing segment
    '30010', // Message price exceeds max price
  ];
  
  // Errors that should NOT be retried
  const nonRetryableErrors = [
    '21211', // Invalid 'To' phone number
    '21212', // Invalid 'From' phone number
    '21408', // Permission to send an SMS not enabled
    '21610', // Message cannot be sent to the 'To' number
    '21614', // 'To' number is not a valid mobile number
  ];
  
  if (nonRetryableErrors.includes(errorCode)) {
    return false;
  }
  
  if (retryableErrors.includes(errorCode)) {
    return true;
  }
  
  // Default to not retry for unknown errors to prevent spam
  return false;
}

// ============================================
// Additional Helper Functions
// ============================================

// Enhanced phone number normalization
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  // Basic normalization - in production use libphonenumber-js
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // Ensure it starts with + for international format
  if (!normalized.startsWith('+')) {
    // Assume North American number if no country code
    if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = '+' + normalized;
    }
  }
  
  return normalized;
}

// Organization lookup helper
async function getOrganizationByPhoneNumber(phoneNumber) {
  try {
    // In production, this would query the database
    // For now, return default organization for demo
    console.log(`Looking up organization for phone number: ${phoneNumber}`);
    
    // Mock organization lookup
    const mockOrganizations = {
      '+14165551234': 'bici-toronto',
      '+16045551234': 'bici-vancouver',
      '+15145551234': 'bici-montreal'
    };
    
    return mockOrganizations[phoneNumber] || process.env.DEFAULT_ORGANIZATION_ID || 'bici-demo';
  } catch (error) {
    console.error('Error looking up organization:', error);
    return process.env.DEFAULT_ORGANIZATION_ID || 'bici-demo';
  }
}

// Lead management helpers
async function findLeadByPhone(phoneNumber, organizationId) {
  try {
    // In production, this would query the database
    console.log(`Looking up lead for phone: ${phoneNumber} in org: ${organizationId}`);
    
    // Mock lead lookup - return existing lead data or null
    const mockLead = {
      id: `lead_${phoneNumber.replace(/[^\d]/g, '')}_${organizationId}`,
      customerName: null, // Will be populated from conversation
      phoneNumber: phoneNumber,
      leadStatus: 'new',
      leadQualityScore: 50,
      interactionCount: 0,
      bikeInterest: {
        type: null,
        budget: { min: 0, max: 0 }
      },
      hasExistingRecord: false,
      lastContactDate: null
    };
    
    return mockLead;
  } catch (error) {
    console.error('Error finding lead by phone:', error);
    return null;
  }
}

async function createLeadFromSMS(phoneNumber, organizationId, smsData) {
  try {
    console.log(`Creating new lead from SMS: ${phoneNumber} in org: ${organizationId}`);
    
    // Extract potential information from SMS
    const { messageBody, messageSid, location, hasMedia, mediaInfo } = smsData;
    
    // Analyze message for lead qualification
    const leadQuality = analyzeSMSForLeadQuality(messageBody);
    
    const newLead = {
      id: `lead_${phoneNumber.replace(/[^\d]/g, '')}_${Date.now()}`,
      customerName: null, // Will be extracted from conversation
      phoneNumber: phoneNumber,
      leadStatus: 'new',
      leadSource: 'inbound_sms',
      leadQualityScore: leadQuality.score,
      interactionCount: 1,
      bikeInterest: leadQuality.bikeInterest,
      contactPreferences: {
        sms: true,
        email: true,
        call: true,
        preferredTime: 'business_hours',
        language: 'en'
      },
      firstContact: {
        channel: 'sms',
        message: messageBody,
        messageSid: messageSid,
        location: location,
        hasMedia: hasMedia,
        mediaInfo: mediaInfo,
        timestamp: new Date().toISOString()
      },
      hasExistingRecord: false,
      organizationId: organizationId,
      createdAt: new Date().toISOString(),
      lastContactDate: new Date().toISOString()
    };
    
    // In production, save to database
    console.log(`Created new lead: ${newLead.id} with quality score: ${newLead.leadQualityScore}`);
    
    return newLead;
  } catch (error) {
    console.error('Error creating lead from SMS:', error);
    return null;
  }
}

// Analyze SMS content for lead qualification
function analyzeSMSForLeadQuality(messageBody) {
  const lowerBody = messageBody.toLowerCase();
  let score = 30; // Base score for SMS contact
  let bikeInterest = { type: null, budget: { min: 0, max: 0 } };
  
  // Interest indicators
  const bikeTypes = {
    'mountain': ['mountain', 'mtb', 'trail', 'downhill'],
    'road': ['road', 'racing', 'speed', 'triathlon'],
    'electric': ['electric', 'e-bike', 'ebike', 'motor'],
    'hybrid': ['hybrid', 'commute', 'city', 'urban'],
    'kids': ['kids', 'child', 'youth', 'small']
  };
  
  // Check for bike type interest
  for (const [type, keywords] of Object.entries(bikeTypes)) {
    if (keywords.some(keyword => lowerBody.includes(keyword))) {
      bikeInterest.type = type;
      score += 15;
      break;
    }
  }
  
  // Budget indicators
  const budgetMatch = messageBody.match(/\$(\d+)/g);
  if (budgetMatch) {
    const amounts = budgetMatch.map(match => parseInt(match.replace('$', '')));
    bikeInterest.budget = {
      min: Math.min(...amounts),
      max: Math.max(...amounts)
    };
    score += 20;
  }
  
  // Intent indicators
  const highIntentWords = ['buy', 'purchase', 'need', 'looking for', 'want to buy'];
  const mediumIntentWords = ['interested', 'considering', 'thinking about'];
  const infoWords = ['price', 'cost', 'how much', 'available', 'in stock'];
  
  if (highIntentWords.some(word => lowerBody.includes(word))) {
    score += 25;
  } else if (mediumIntentWords.some(word => lowerBody.includes(word))) {
    score += 15;
  } else if (infoWords.some(word => lowerBody.includes(word))) {
    score += 10;
  }
  
  // Urgency indicators
  const urgencyWords = ['today', 'asap', 'urgent', 'immediately'];
  if (urgencyWords.some(word => lowerBody.includes(word))) {
    score += 15;
  }
  
  // Question format often indicates serious interest
  if (messageBody.includes('?')) {
    score += 5;
  }
  
  // Longer messages often indicate more serious inquiries
  if (messageBody.length > 50) {
    score += 10;
  }
  
  // Cap score at 100
  score = Math.min(score, 100);
  
  return { score, bikeInterest };
}

// Check if SMS content suggests need for outbound call
function shouldTriggerOutboundCall(messageBody, leadData = null) {
  const lowerBody = messageBody.toLowerCase();
  
  // High urgency indicators
  const urgentWords = ['urgent', 'emergency', 'broken', 'stuck', 'help', 'problem', 'asap'];
  const appointmentWords = ['appointment', 'schedule', 'book', 'meet', 'visit'];
  const purchaseWords = ['buy today', 'purchase now', 'ready to buy', 'cash in hand'];
  
  // Check for urgent issues
  if (urgentWords.some(word => lowerBody.includes(word))) {
    return true;
  }
  
  // Check for appointment requests
  if (appointmentWords.some(word => lowerBody.includes(word))) {
    return true;
  }
  
  // Check for immediate purchase intent
  if (purchaseWords.some(word => lowerBody.includes(word))) {
    return true;
  }
  
  // High-value lead with complex inquiry
  if (leadData?.leadQualityScore > 80 && messageBody.length > 100) {
    return true;
  }
  
  // Multiple questions in one message
  const questionCount = (messageBody.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    return true;
  }
  
  return false;
}


module.exports = router;