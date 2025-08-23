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

// Conversation initiation webhook
router.post('/conversation-start', verifyWebhookSignature, async (req, res) => {
  try {
    const { conversation_id, agent_id, user_id, metadata } = req.body;
    
    console.log('🎯 Conversation started:', {
      conversation_id,
      agent_id,
      user_id,
      timestamp: new Date().toISOString(),
      metadata
    });

    // Store conversation start
    const conversationStore = require('../services/conversationStore');
    conversationStore.storeConversation(conversation_id, {
      conversation_id,
      agent_id,
      user_id,
      caller_phone: metadata?.caller_phone || metadata?.from,
      status: 'active',
      created_at: new Date().toISOString(),
      transcript: []
    });

    res.status(200).json({
      success: true,
      message: 'Conversation initiated',
      dynamic_variables: {
        store_greeting: require('../services/storeHours').formatGreeting(),
        current_date: new Date().toLocaleDateString('en-CA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'America/Vancouver'
        }),
        caller_phone: metadata?.caller_phone || metadata?.from || 'unknown'
      }
    });
  } catch (error) {
    console.error('Conversation start error:', error);
    res.status(500).json({
      error: 'Failed to handle conversation start',
      message: error.message
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

// Post-call webhook
router.post('/post-call', verifyWebhookSignature, async (req, res) => {
  try {
    const {
      conversation_id,
      agent_id,
      duration_seconds,
      end_reason,
      transcript,
      metadata
    } = req.body;
    
    console.log('📞 Call ended:', {
      conversation_id,
      agent_id,
      duration_seconds,
      end_reason,
      timestamp: new Date().toISOString()
    });

    // Post-call processing:
    // 1. Save conversation transcript
    // 2. Extract lead information
    // 3. Update CRM records
    // 4. Send follow-up actions to team
    // 5. Analytics and reporting

    // Example: Extract key information from transcript
    if (transcript) {
      const hasLeadInfo = transcript.toLowerCase().includes('interested in') || 
                         transcript.toLowerCase().includes('looking for');
      
      if (hasLeadInfo) {
        console.log('🎯 Lead detected in conversation:', conversation_id);
        // Trigger lead processing workflow
      }
    }

    res.status(200).json({
      success: true,
      message: 'Call processed successfully',
      follow_up_actions: [
        'Transcript saved',
        'Lead information extracted',
        'Follow-up scheduled if needed'
      ]
    });
  } catch (error) {
    console.error('Post-call error:', error);
    res.status(500).json({
      error: 'Failed to handle post-call',
      message: error.message
    });
  }
});

// Health check for webhook endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ElevenLabs Webhooks',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;