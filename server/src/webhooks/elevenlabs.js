const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Webhook signature verification for ElevenLabs
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['elevenlabs-signature'];
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  
  if (!signature || !secret) {
    console.log('Missing signature or secret');
    return next(); // Skip verification in development
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

// Conversation initiation webhook - ZERO LATENCY CONTEXT INJECTION
router.post('/conversation-start', verifyWebhookSignature, async (req, res) => {
  try {
    const { conversation_id, agent_id, user_id, metadata } = req.body;
    const callerPhone = metadata?.caller_phone || metadata?.from;
    
    console.log('🎯 Conversation started with context lookup:', {
      conversation_id,
      caller_phone: callerPhone,
      timestamp: new Date().toISOString()
    });

    // INSTANT CONTEXT LOOKUP (no latency - happens before conversation starts)
    const customerMemory = require('../services/customerMemory');
    const customerContext = customerMemory.getCustomerContext(callerPhone);
    
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

    // Build dynamic variables with FULL CUSTOMER CONTEXT
    const storeHours = require('../services/storeHours');
    const dynamicVariables = {
      // Real-time store data
      store_greeting: storeHours.formatGreeting(),
      current_date: new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric', 
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Vancouver'
      }),
      caller_phone: callerPhone || 'unknown',
      
      // CUSTOMER CONTEXT (zero latency)
      customer_tier: customerContext.customer_tier,
      customer_name: customerContext.customer_name,
      conversation_count: customerContext.conversation_count.toString(),
      previous_context: customerContext.previous_context,
      preferred_communication: customerContext.preferred_communication,
      bike_interest: customerContext.bike_interest,
      last_conversation: customerContext.last_conversation,
      customer_sentiment: customerContext.customer_sentiment,
      suggested_approach: customerContext.suggested_approach
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

// Conversation interruption webhook (for human handoff)
router.post('/conversation-interrupt', verifyWebhookSignature, async (req, res) => {
  try {
    const { conversation_id, agent_id, reason, metadata } = req.body;
    
    console.log('⚠️ Conversation interrupted:', {
      conversation_id,
      agent_id,
      reason,
      timestamp: new Date().toISOString(),
      metadata
    });

    // Handle human handoff logic here
    // 1. Check if human agents are available
    // 2. Queue the conversation for human takeover
    // 3. Notify human agents
    // 4. Prepare handoff context

    const storeHours = require('../services/storeHours');
    const status = storeHours.getCurrentStatus();

    if (status.isOpen) {
      // Store is open - can hand off to human
      res.status(200).json({
        success: true,
        action: 'transfer_to_human',
        message: 'Transferring to human agent',
        context: {
          customer_phone: metadata?.phone_number,
          conversation_summary: metadata?.conversation_context,
          transfer_reason: reason
        }
      });
    } else {
      // Store is closed - offer callback
      res.status(200).json({
        success: true,
        action: 'offer_callback',
        message: 'No agents available, offering callback',
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
    const {
      conversation_id,
      agent_id,
      duration_seconds,
      end_reason,
      transcript,
      metadata,
      call_summary_title,
      call_successful
    } = req.body;
    
    const callerPhone = metadata?.caller_phone || metadata?.from;
    
    console.log('📞 Call ended - building customer memory:', {
      conversation_id,
      caller_phone: callerPhone,
      duration_seconds,
      end_reason,
      summary: call_summary_title,
      timestamp: new Date().toISOString()
    });

    // BUILD CUSTOMER MEMORY FOR FUTURE CALLS (zero latency impact)
    const customerMemory = require('../services/customerMemory');
    
    // Process conversation data for insights
    const conversationData = {
      conversation_id,
      caller_phone: callerPhone,
      duration_seconds: duration_seconds || 0,
      summary: call_summary_title || 'General inquiry',
      transcript: transcript,
      transcript_summary: this.generateTranscriptSummary(transcript),
      outcome: call_successful === 'success' ? 'successful' : 'incomplete',
      end_reason: end_reason,
      agent_id: agent_id
    };

    // Store customer profile and conversation insights
    const customerProfile = customerMemory.storeConversationSummary(callerPhone, conversationData);
    
    console.log('🧠 Customer memory updated:', {
      customer_tier: customerProfile.conversation_count >= 3 ? 'frequent' : 'returning',
      total_conversations: customerProfile.conversation_count,
      bike_interest: customerProfile.preferences?.bike_type || 'exploring'
    });

    // Extract lead information for CRM
    if (transcript) {
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
  const agentMessages = transcript.filter(t => t.role === 'agent').map(t => t.message);
  
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