const express = require('express');
const router = express.Router();
const conversationStore = require('../services/conversationStore');
const twilio = require('twilio');

const fs = require('fs');
const path = require('path');

// Persistent storage file
const TRANSFER_DATA_FILE = path.join(__dirname, '../../../transfer_data.json');

// Load transfer data from file
function loadTransferData() {
  try {
    if (fs.existsSync(TRANSFER_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRANSFER_DATA_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('Error loading transfer data:', error);
  }
  return { phone_number: null, set_at: null };
}

// Save transfer data to file
function saveTransferData(data) {
  try {
    fs.writeFileSync(TRANSFER_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving transfer data:', error);
  }
}

// Load initial data
let transferData = loadTransferData();

// Export function to get current transfer data
function getCurrentTransferData() {
  return {
    phone_number: transferData.phone_number,
    set_at: transferData.set_at,
    is_active: transferData.phone_number !== null
  };
}

module.exports.getCurrentTransferData = getCurrentTransferData;

// Set transfer number for human agent
router.post('/transfer-number', async (req, res) => {
  try {
    const { phone_number, agent_name } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({
        error: 'Phone number is required'
      });
    }

    // Validate E.164 format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use E.164 format: +1234567890'
      });
    }

    transferData.phone_number = phone_number;
    transferData.set_at = new Date().toISOString();
    transferData.agent_name = agent_name;
    
    saveTransferData(transferData);
    
    console.log('📞 Transfer number set and persisted:', {
      phone_number,
      agent_name,
      set_at: transferData.set_at
    });

    res.json({
      success: true,
      message: 'Transfer number updated',
      phone_number: transferData.phone_number,
      agent_name,
      set_at: transferData.set_at
    });
  } catch (error) {
    console.error('Transfer number error:', error);
    res.status(500).json({
      error: 'Failed to set transfer number',
      message: error.message
    });
  }
});

// Get current transfer number
router.get('/transfer-number', async (req, res) => {
  try {
    res.json({
      success: true,
      phone_number: transferData.phone_number,
      set_at: transferData.set_at,
      is_active: transferData.phone_number !== null
    });
  } catch (error) {
    console.error('Get transfer number error:', error);
    res.status(500).json({
      error: 'Failed to get transfer number',
      message: error.message
    });
  }
});

// Clear transfer number (agent going offline)
router.delete('/transfer-number', async (req, res) => {
  try {
    transferData.phone_number = null;
    transferData.set_at = null;
    transferData.agent_name = null;
    
    saveTransferData(transferData);
    
    console.log('📞 Transfer number cleared and persisted');

    res.json({
      success: true,
      message: 'Transfer number cleared'
    });
  } catch (error) {
    console.error('Clear transfer number error:', error);
    res.status(500).json({
      error: 'Failed to clear transfer number',
      message: error.message
    });
  }
});

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

// Handle transfer_to_number client tool requests
router.post('/transfer-tool-request', async (req, res) => {
  try {
    const { phone_number, reason, conversation_id } = req.body;
    
    console.log('🔄 Transfer tool request:', {
      phone_number,
      reason,
      conversation_id,
      timestamp: new Date().toISOString()
    });

    // Log the transfer attempt
    if (conversation_id) {
      conversationStore.addTranscript(conversation_id, 'system', 
        `Transfer initiated to ${phone_number} - Reason: ${reason}`, 
        new Date().toISOString()
      );
    }

    // Return success - ElevenLabs will handle the actual transfer
    res.json({
      success: true,
      message: 'Transfer initiated successfully',
      phone_number,
      reason,
      conversation_id
    });
  } catch (error) {
    console.error('Transfer tool request error:', error);
    res.status(500).json({
      error: 'Failed to process transfer request',
      message: error.message
    });
  }
});

module.exports = router;
module.exports.getCurrentTransferData = getCurrentTransferData;