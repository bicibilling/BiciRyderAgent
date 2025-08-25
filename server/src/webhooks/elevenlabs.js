const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Helper functions for dynamic variables
function formatCurrentDateTime() {
  const now = new Date();
  const timeOptions = {
    timeZone: 'America/Vancouver',
    hour: 'numeric',
    minute: '2-digit', 
    hour12: true
  };
  
  return {
    current_date: now.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Vancouver'
    }),
    current_time: now.toLocaleTimeString('en-CA', timeOptions),
    current_datetime: `${now.toLocaleDateString('en-CA', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Vancouver'
    })} at ${now.toLocaleTimeString('en-CA', timeOptions)}`
  };
}

function buildCustomerFlags(customerContext) {
  const isNewCustomer = customerContext.customer_name === 'New Customer' || customerContext.customer_name === 'Valued Customer';
  const needsBikeData = customerContext.bike_interest === 'unknown' || customerContext.bike_interest === 'exploring options';
  
  return {
    has_customer_name: !isNewCustomer,
    needs_name: isNewCustomer,
    needs_bike_interest: needsBikeData
  };
}

function buildGreetingMessage(customerContext, timeData) {
  if (customerContext.customer_name !== 'New Customer' && customerContext.customer_name !== 'Valued Customer') {
    // Returning customer with known name
    return `Hi ${customerContext.customer_name}! Welcome back to Bici on ${timeData.current_datetime}. I'm Ryder, your AI teammate.`;
  } else if (customerContext.conversation_count > 0) {
    // Returning customer without name
    return `Hi there! Welcome back to Bici on ${timeData.current_datetime}. I'm Ryder, your AI teammate. I remember you've called before, but I don't have your name on file.`;
  } else {
    // New customer
    return `Hi! You've reached Bici on ${timeData.current_datetime}. I'm Ryder, your AI teammate.`;
  }
}

function buildTransferContext(transferData) {
  return {
    human_agent_available: transferData.is_active,
    transfer_phone_number: transferData.phone_number || 'none'
  };
}

// Enhanced webhook signature verification following ElevenLabs best practices
async function verifyWebhookSignature(req, res, next) {
  const signatureHeader = req.headers['elevenlabs-signature'];
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  
  if (!signatureHeader || !secret) {
    console.log('⚠️ Missing signature or secret - allowing in development');
    return next(); // Skip verification in development
  }

  try {
    // Get raw body for signature verification
    const body = req.rawBody || JSON.stringify(req.body);
    
    // Construct webhook event using ElevenLabs method (if available)
    try {
      const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
      const elevenlabs = new ElevenLabsClient();
      
      const { event, error } = await elevenlabs.webhooks.constructEvent(
        body,
        signatureHeader,
        secret
      );
      
      if (error) {
        console.log('🔒 Webhook signature verification failed:', error);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      
      // Store verified event data for use in route handlers
      req.verifiedEvent = event;
      console.log('✅ Webhook signature verified');
      
    } catch (libError) {
      // Fallback to manual verification if ElevenLabs SDK not available
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (signatureHeader !== expectedSignature) {
        console.log('🔒 Manual signature verification failed');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      
      console.log('✅ Manual webhook signature verified');
    }

    next();
  } catch (error) {
    console.error('🔒 Webhook verification error:', error);
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
}

// Conversation initiation webhook - ZERO LATENCY CONTEXT INJECTION
router.post('/conversation-start', verifyWebhookSignature, async (req, res) => {
  try {
    console.log('🔍 RAW WEBHOOK DATA:', JSON.stringify(req.body, null, 2));
    
    // ElevenLabs webhook structure analysis
    const { conversation_id, agent_id, user_id, metadata, caller_id, called_number } = req.body;
    
    // Multiple ways to get caller phone number
    const callerPhone = caller_id || 
                       metadata?.caller_phone || 
                       metadata?.from || 
                       metadata?.phone_number ||
                       metadata?.external_number;
    
    console.log('🎯 Conversation started with context lookup:', {
      conversation_id,
      caller_phone: callerPhone,
      metadata: metadata,
      timestamp: new Date().toISOString()
    });

    // INSTANT CONTEXT LOOKUP using ElevenLabs conversation summaries
    const customerMemory = require('../services/customerMemory');
    const customerContext = await customerMemory.getEnhancedCustomerContext(callerPhone);
    
    // Store conversation start
    const conversationStore = require('../services/conversationStore');
    conversationStore.storeConversation(conversation_id, {
      conversation_id,
      agent_id,
      user_id,
      caller_phone: callerPhone,
      status: 'active',
      created_at: new Date().toISOString(),
      transcript: [],
      customer_context: customerContext
    });

    // Get current transfer number from human control system
    const humanControl = require('../routes/humanControl');
    const transferData = humanControl.getCurrentTransferData();
    
    // Build dynamic variables with helper functions
    const storeHours = require('../services/storeHours');
    const timeData = formatCurrentDateTime();
    const customerFlags = buildCustomerFlags(customerContext);
    const transferContext = buildTransferContext(transferData);
    
    const dynamicVariables = {
      // Real-time store and time data
      store_greeting: storeHours.formatGreeting(),
      caller_phone: callerPhone || 'unknown',
      ...timeData,
      
      // Dynamic greeting message
      dynamic_greeting: buildGreetingMessage(customerContext, timeData),
      
      // Transfer system
      ...transferContext,
      
      // Customer context
      customer_tier: customerContext.customer_tier,
      customer_name: customerContext.customer_name,
      conversation_count: customerContext.conversation_count.toString(),
      previous_context: customerContext.previous_context,
      preferred_communication: customerContext.preferred_communication,
      bike_interest: customerContext.bike_interest,
      last_conversation: customerContext.last_conversation,
      customer_sentiment: customerContext.customer_sentiment,
      suggested_approach: customerContext.suggested_approach,
      
      // Conversation history summaries from ElevenLabs
      conversation_summaries: customerContext.elevenlabs_history ? 
        customerContext.elevenlabs_history.slice(0, 5).map(conv => 
          `${conv.date.split('T')[0]}: ${conv.summary}`
        ).join(' | ') : 'No previous conversation summaries',
      
      // Data collection flags
      ...customerFlags
    };

    console.log('🧠 Context injected for customer:', customerContext.customer_tier, 
                'tier,', customerContext.conversation_count, 'previous calls');

    res.status(200).json({
      success: true,
      message: 'Conversation initiated with customer context',
      dynamic_variables: dynamicVariables
    });
  } catch (error) {
    console.error('Conversation start error:', error);
    
    // Fallback: basic context if memory system fails
    res.status(200).json({
      success: true,
      message: 'Conversation initiated with basic context',
      dynamic_variables: {
        store_greeting: require('../services/storeHours').formatGreeting(),
        current_date: new Date().toLocaleDateString('en-CA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long', 
          day: 'numeric',
          timeZone: 'America/Vancouver'
        }),
        caller_phone: metadata?.caller_phone || metadata?.from || 'unknown',
        customer_tier: 'new',
        previous_context: 'No previous conversation data available'
      }
    });
  }
});

// Conversation interruption webhook (for human handoff with FULL CONTEXT)
router.post('/conversation-interrupt', verifyWebhookSignature, async (req, res) => {
  try {
    const { conversation_id, agent_id, reason, metadata, transcript } = req.body;
    const callerPhone = metadata?.caller_phone || metadata?.from;
    
    console.log('⚠️ Human handoff requested with full context:', {
      conversation_id,
      caller_phone: callerPhone,
      reason,
      timestamp: new Date().toISOString()
    });

    // Get FULL customer context including ALL previous conversations
    const customerMemory = require('../services/customerMemory');
    const customerContext = customerMemory.getCustomerContext(callerPhone);
    
    // Get current conversation transcript from ElevenLabs
    let currentTranscript = [];
    try {
      const axios = require('axios');
      const apiKey = process.env.ELEVENLABS_API_KEY;
      
      const response = await axios.get(`https://api.elevenlabs.io/v1/convai/conversations/${conversation_id}`, {
        headers: { 'xi-api-key': apiKey }
      });
      
      if (response.data.transcript && Array.isArray(response.data.transcript)) {
        currentTranscript = response.data.transcript.map(turn => ({
          speaker: turn.role === 'user' ? 'Customer' : 'Ryder',
          message: turn.message,
          time: turn.time_in_call_secs || 0
        }));
      }
    } catch (e) {
      console.log('Could not fetch current conversation transcript');
    }

    // BUILD COMPREHENSIVE HANDOFF CONTEXT
    const handoffContext = {
      conversation_id,
      caller_phone: callerPhone,
      customer_tier: customerContext.customer_tier,
      total_previous_calls: customerContext.conversation_count,
      previous_context: customerContext.previous_context,
      bike_interest: customerContext.bike_interest,
      last_conversation_summary: customerContext.last_conversation,
      customer_sentiment: customerContext.customer_sentiment,
      
      // Current conversation context
      current_transcript: currentTranscript,
      transfer_reason: reason,
      conversation_duration: currentTranscript.length > 0 ? 
        currentTranscript[currentTranscript.length - 1].time : 0,
      
      // Suggested approach for human agent
      suggested_approach: customerContext.suggested_approach,
      recommended_actions: [
        customerContext.bike_interest !== 'unknown' ? `Customer interested in ${customerContext.bike_interest} bikes` : 'Explore customer needs',
        customerContext.conversation_count > 1 ? 'Returning customer - acknowledge previous interactions' : 'New customer - provide comprehensive assistance',
        reason === 'customer_request' ? 'Customer specifically asked for human help' : 'Agent determined human assistance needed'
      ],
      
      handoff_timestamp: new Date().toISOString()
    };

    // Store handoff context for human agent dashboard
    const conversationStore = require('../services/conversationStore');
    conversationStore.storeConversation(conversation_id, {
      ...conversationStore.getConversation(conversation_id),
      human_handoff_context: handoffContext,
      status: 'pending_human_takeover'
    });

    const storeHours = require('../services/storeHours');
    const status = storeHours.getCurrentStatus();

    if (status.isOpen) {
      console.log('👤 Human agent context prepared with full customer history');
      
      res.status(200).json({
        success: true,
        action: 'transfer_to_human',
        message: 'Transferring to human agent with full customer context',
        handoff_context: handoffContext
      });
    } else {
      res.status(200).json({
        success: true,
        action: 'offer_callback',
        message: 'No agents available, offering callback',
        handoff_context: handoffContext,
        next_available: status.nextOpen
      });
    }
  } catch (error) {
    console.error('Conversation interrupt error:', error);
    res.status(500).json({
      error: 'Failed to handle conversation interrupt',
      message: error.message
    });
  }
});

// Post-call webhook - BUILD CUSTOMER MEMORY FOR FUTURE CALLS  
router.post('/post-call', verifyWebhookSignature, async (req, res) => {
  try {
    console.log('📞 RAW POST-CALL DATA:', JSON.stringify(req.body, null, 2));
    
    // Handle ElevenLabs webhook structure properly
    if (req.body.type === 'post_call_transcription') {
      const webhookData = req.body.data;
      const {
        conversation_id,
        agent_id, 
        transcript,
        metadata,
        analysis
      } = webhookData;
    
    // Extract from metadata or phone_call data
    const phoneData = metadata?.phone_call || metadata;
    const callerPhone = phoneData?.external_number || 
                       phoneData?.caller_phone ||
                       phoneData?.from ||
                       metadata?.caller_id;
    
      const duration_seconds = metadata?.call_duration_secs || 0;
      const call_summary_title = analysis?.call_summary_title || 'General inquiry'; 
      const call_successful = analysis?.call_successful || 'success';
      
      // Extract structured data from ElevenLabs analysis
      const dataCollection = analysis?.data_collection_results || {};
      const extractedData = {
        customer_name: dataCollection.customer_name?.value || null,
        bike_interest: dataCollection.bike_interest?.value || null,
        budget_range: dataCollection.budget_range?.value || null,
        experience_level: dataCollection.experience_level?.value || null
      };
    
    console.log('📊 ElevenLabs extracted data:', extractedData);
    
    console.log('📞 Call ended - building customer memory:', {
      conversation_id,
      caller_phone: callerPhone,
      duration_seconds,
      summary: call_summary_title,
      timestamp: new Date().toISOString()
    });

    // BUILD CUSTOMER MEMORY FOR FUTURE CALLS (zero latency impact)
    const customerMemory = require('../services/customerMemory');
    
    // Process conversation data for insights
    const conversationData = {
      conversation_id,
      caller_phone: callerPhone,
      duration_seconds,
      summary: call_summary_title,
      transcript,
      transcript_summary: generateTranscriptSummary(transcript),
      outcome: call_successful === 'success' ? 'successful' : 'incomplete',
      agent_id,
      // ElevenLabs structured data extraction
      extracted_data: extractedData
    };

    // Store customer profile and conversation insights
    const customerProfile = customerMemory.storeConversationSummary(callerPhone, conversationData);
    
    console.log('🧠 Customer memory updated:', {
      customer_tier: customerProfile.conversation_count >= 3 ? 'frequent' : 'returning',
      total_conversations: customerProfile.conversation_count,
      bike_interest: customerProfile.preferences?.bike_type || 'exploring'
    });

    // Extract lead information for CRM
    if (transcript && typeof transcript === 'string') {
      const hasLeadInfo = transcript.toLowerCase().includes('interested in') || 
                         transcript.toLowerCase().includes('looking for') ||
                         transcript.toLowerCase().includes('want to buy');
      
      if (hasLeadInfo) {
        console.log('🎯 Lead detected - customer showing purchase intent:', conversation_id);
      }
    }

      res.status(200).json({
        success: true,
        message: 'Call processed and customer memory updated',
        customer_profile: {
          tier: customerProfile.conversation_count >= 3 ? 'frequent' : 'returning',
          conversation_count: customerProfile.conversation_count,
          has_context_for_next_call: true
        },
        follow_up_actions: [
          'Transcript analyzed and insights extracted',
          'Customer profile updated for future context',
          'Memory ready for next conversation'
        ]
      });
    } else {
      console.log('⚠️ Unexpected webhook type:', req.body.type);
      res.status(200).json({ success: true, message: 'Webhook received but not post_call_transcription' });
    }
  } catch (error) {
    console.error('Post-call error:', error);
    res.status(200).json({
      success: true,
      message: 'Call processed (memory update failed)',
      error: error.message
    });
  }
});

// Helper function to generate transcript summary  
function generateTranscriptSummary(transcript) {
  if (!transcript || !Array.isArray(transcript)) return 'No transcript available';
  
  const customerMessages = transcript.filter(t => t.role === 'user').map(t => t.message);
  const customerText = customerMessages.join(' ').toLowerCase();
  
  // Quick summary generation
  let summary = 'Customer inquired about ';
  
  if (customerText.includes('mountain') || customerText.includes('mtb')) {
    summary += 'mountain bikes';
  } else if (customerText.includes('electric') || customerText.includes('e-bike')) {
    summary += 'electric bikes';
  } else if (customerText.includes('road')) {
    summary += 'road bikes';
  } else if (customerText.includes('hours') || customerText.includes('open')) {
    summary += 'store hours';
  } else if (customerText.includes('location') || customerText.includes('directions')) {
    summary += 'store location';
  } else {
    summary += 'Bici services';
  }
  
  if (customerText.includes('human') || customerText.includes('person')) {
    summary += ' and requested human assistance';
  }
  
  return summary;
}

// Health check for webhook endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ElevenLabs Webhooks',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;