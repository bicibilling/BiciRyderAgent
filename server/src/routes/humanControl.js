const express = require('express');
const router = express.Router();
const conversationStore = require('../services/conversationStore');
const twilio = require('twilio');

// Get conversation summary for human agent
router.get('/summary/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const summary = conversationStore.generateHandoffSummary(conversationId);
    
    if (!summary) {
      return res.status(404).json({
        error: 'Conversation not found',
        conversation_id: conversationId
      });
    }

    res.json({
      success: true,
      summary: summary
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      message: error.message
    });
  }
});

// Generate voice summary for human agent (no computer access)
router.post('/voice-summary/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { agent_phone } = req.body; // Phone number of human agent
    
    const summary = conversationStore.generateHandoffSummary(conversationId);
    
    if (!summary) {
      return res.status(404).json({
        error: 'Conversation not found'
      });
    }

    // Generate voice summary script
    let voiceSummary = `Hello, this is Ryder's handoff system. `;
    
    // Customer identification
    if (summary.customer_name && summary.customer_name !== 'Customer') {
      voiceSummary += `The customer's name is ${summary.customer_name}. `;
    }
    voiceSummary += `They're calling from ${summary.customer_phone}. `;

    // Issue summary
    voiceSummary += `The issue is: ${summary.issue_summary}. `;

    // Tone if exceptional
    if (summary.tone !== 'neutral') {
      voiceSummary += `Please note: the customer seems ${summary.tone}. `;
    }

    // Key points
    if (summary.key_points.length > 0) {
      voiceSummary += `Key points discussed: ${summary.key_points.join(', ')}. `;
    }

    // Suggested actions
    if (summary.suggested_actions.length > 0) {
      voiceSummary += `Suggested actions: ${summary.suggested_actions.join(', ')}. `;
    }

    voiceSummary += `The conversation has been going for about ${summary.duration_minutes} minutes. Good luck!`;

    // Send voice summary via Twilio call
    if (agent_phone) {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      try {
        const call = await twilioClient.calls.create({
          twiml: `<Response><Say voice="alice">${voiceSummary}</Say></Response>`,
          to: agent_phone,
          from: process.env.TWILIO_PHONE_NUMBER
        });

        console.log('📞 Voice summary sent to agent:', agent_phone);
        
        res.json({
          success: true,
          message: 'Voice summary sent to human agent',
          summary: summary,
          voice_script: voiceSummary,
          call_sid: call.sid
        });
      } catch (twilioError) {
        console.error('Twilio call error:', twilioError);
        
        // Return summary even if voice call fails
        res.json({
          success: true,
          message: 'Summary generated (voice call failed)',
          summary: summary,
          voice_script: voiceSummary,
          error: 'Could not make voice call to agent'
        });
      }
    } else {
      // No agent phone provided, just return summary
      res.json({
        success: true,
        message: 'Voice summary script generated',
        summary: summary,
        voice_script: voiceSummary
      });
    }
  } catch (error) {
    console.error('Voice summary error:', error);
    res.status(500).json({
      error: 'Failed to generate voice summary',
      message: error.message
    });
  }
});

// Start human takeover
router.post('/takeover/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { agent_name, agent_phone } = req.body;
    
    const summary = conversationStore.startHumanSession(conversationId, {
      name: agent_name,
      phone: agent_phone
    });

    if (!summary) {
      return res.status(404).json({
        error: 'Conversation not found'
      });
    }

    console.log('👤 Human takeover initiated:', {
      conversation_id: conversationId,
      agent_name,
      agent_phone
    });

    res.json({
      success: true,
      message: 'Human takeover initiated',
      summary: summary,
      handoff_instructions: {
        customer_phone: summary.customer_phone,
        issue: summary.issue_summary,
        tone: summary.tone,
        duration: `${summary.duration_minutes} minutes`
      }
    });
  } catch (error) {
    console.error('Takeover error:', error);
    res.status(500).json({
      error: 'Failed to initiate takeover',
      message: error.message
    });
  }
});

// Get all active conversations needing human attention
router.get('/queue', async (req, res) => {
  try {
    const conversations = conversationStore.getAllConversations();
    const activeConversations = conversations.filter(c => c.status === 'active');
    
    const queue = activeConversations.map(conv => {
      const summary = conversationStore.generateHandoffSummary(conv.conversation_id);
      return {
        conversation_id: conv.conversation_id,
        customer_phone: conv.caller_phone,
        started_at: conv.created_at,
        duration_minutes: Math.floor((Date.now() - new Date(conv.created_at)) / 60000),
        quick_summary: summary?.issue_summary || 'General inquiry',
        tone: summary?.tone || 'neutral',
        needs_attention: summary?.tone === 'angry' || summary?.tone === 'urgent'
      };
    });

    res.json({
      success: true,
      queue: queue.sort((a, b) => {
        // Priority: urgent/angry first, then by duration
        if (a.needs_attention && !b.needs_attention) return -1;
        if (!a.needs_attention && b.needs_attention) return 1;
        return b.duration_minutes - a.duration_minutes;
      }),
      total: queue.length
    });
  } catch (error) {
    console.error('Queue error:', error);
    res.status(500).json({
      error: 'Failed to get conversation queue',
      message: error.message
    });
  }
});

// Add new transcript message (for real-time updates)
router.post('/transcript/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { speaker, text, timestamp } = req.body;
    
    conversationStore.addTranscript(conversationId, speaker, text, timestamp);
    
    res.json({
      success: true,
      message: 'Transcript updated'
    });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({
      error: 'Failed to update transcript',
      message: error.message
    });
  }
});

module.exports = router;