const express = require('express');
const { logger } = require('../utils/logger');

function createWebhookRoutes(managers, conversationStateManager) {
  const router = express.Router();
  
  /**
   * ElevenLabs webhook for call events
   */
  router.post('/elevenlabs/call-events', async (req, res) => {
    try {
      const {
        event_type,
        conversation_id,
        call_sid,
        phone_number,
        organization_id,
        metadata
      } = req.body;
      
      logger.info('ElevenLabs webhook received', {
        eventType: event_type,
        conversationId: conversation_id,
        organizationId: organization_id
      });
      
      // Get dashboard manager for organization
      const dashboardManager = managers.get(organization_id);
      
      switch (event_type) {
        case 'conversation_started':
          await handleConversationStarted(dashboardManager, conversationStateManager, req.body);
          break;
          
        case 'conversation_ended':
          await handleConversationEnded(dashboardManager, conversationStateManager, req.body);
          break;
          
        case 'human_takeover_requested':
          await handleHumanTakeoverRequested(dashboardManager, req.body);
          break;
          
        case 'call_transferred':
          await handleCallTransferred(dashboardManager, req.body);
          break;
          
        default:
          logger.warn('Unknown ElevenLabs webhook event', {
            eventType: event_type,
            conversationId: conversation_id
          });
      }
      
      res.json({ success: true });
      
    } catch (error) {
      logger.error('ElevenLabs webhook error', {
        error: error.message,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message
      });
    }
  });
  
  /**
   * Twilio webhook for call status updates
   */
  router.post('/twilio/call-status', async (req, res) => {
    try {
      const {
        CallSid,
        CallStatus,
        From,
        To,
        Duration,
        RecordingUrl
      } = req.body;
      
      logger.info('Twilio webhook received', {
        callSid: CallSid,
        callStatus: CallStatus,
        from: From,
        to: To
      });
      
      // Find organization by phone number
      const organizationId = await findOrganizationByPhoneNumber(To);
      
      if (organizationId) {
        const dashboardManager = managers.get(organizationId);
        
        if (dashboardManager) {
          // Broadcast call status update
          dashboardManager.broadcastToAllClients({
            type: 'call_status_update',
            callSid: CallSid,
            status: CallStatus,
            duration: Duration,
            recordingUrl: RecordingUrl,
            timestamp: new Date().toISOString()
          });
        }
        
        // Store call analytics
        if (CallStatus === 'completed' && Duration) {
          await conversationStateManager.storeConversationAnalytics(CallSid, {
            organizationId,
            call_sid: CallSid,
            duration: parseInt(Duration),
            call_status: CallStatus,
            recording_url: RecordingUrl,
            completed_at: new Date().toISOString()
          });
        }
      }
      
      res.json({ success: true });
      
    } catch (error) {
      logger.error('Twilio webhook error', {
        error: error.message,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message
      });
    }
  });
  
  return router;
}

// Helper functions
async function handleConversationStarted(dashboardManager, conversationStateManager, data) {
  const { conversation_id, phone_number, organization_id, metadata } = data;
  
  // Store initial conversation state
  await conversationStateManager.storeConversationState(conversation_id, {
    organizationId: organization_id,
    customerPhone: phone_number,
    status: 'active',
    startedAt: new Date().toISOString(),
    isHumanTakeover: false,
    metadata: metadata
  });
  
  if (dashboardManager) {
    // Broadcast new conversation to dashboard
    dashboardManager.broadcastToAllClients({
      type: 'conversation_started',
      conversationId: conversation_id,
      customerPhone: phone_number,
      organizationId: organization_id,
      timestamp: new Date().toISOString()
    });
  }
}

async function handleConversationEnded(dashboardManager, conversationStateManager, data) {
  const { conversation_id, duration, summary, organization_id } = data;
  
  // Update conversation state
  const currentState = await conversationStateManager.getConversationState(conversation_id) || {};
  
  const updatedState = {
    ...currentState,
    status: 'completed',
    endedAt: new Date().toISOString(),
    duration: duration,
    summary: summary
  };
  
  await conversationStateManager.storeConversationState(conversation_id, updatedState);
  
  // Store analytics
  await conversationStateManager.storeConversationAnalytics(conversation_id, {
    organizationId: organization_id,
    duration: duration,
    successful_completion: true,
    human_takeover: currentState.isHumanTakeover || false,
    call_type: currentState.metadata?.call_type || 'unknown',
    completed_at: new Date().toISOString()
  });
  
  if (dashboardManager) {
    // Broadcast conversation ended
    dashboardManager.broadcastToAllClients({
      type: 'conversation_ended',
      conversationId: conversation_id,
      duration: duration,
      summary: summary,
      timestamp: new Date().toISOString()
    });
    
    // Remove from active conversations
    dashboardManager.activeConversations.delete(conversation_id);
  }
}

async function handleHumanTakeoverRequested(dashboardManager, data) {
  const { conversation_id, reason, urgency } = data;
  
  if (dashboardManager) {
    // Broadcast takeover request with high priority
    dashboardManager.broadcastToAllClients({
      type: 'human_takeover_requested',
      conversationId: conversation_id,
      reason: reason,
      urgency: urgency || 'medium',
      timestamp: new Date().toISOString()
    });
  }
}

async function handleCallTransferred(dashboardManager, data) {
  const { conversation_id, transfer_destination, transfer_reason } = data;
  
  if (dashboardManager) {
    // Broadcast transfer notification
    dashboardManager.broadcastToAllClients({
      type: 'call_transferred',
      conversationId: conversation_id,
      transferDestination: transfer_destination,
      transferReason: transfer_reason,
      timestamp: new Date().toISOString()
    });
  }
}

// Mock function - replace with actual implementation
async function findOrganizationByPhoneNumber(phoneNumber) {
  // This would typically query your database to find which organization owns this phone number
  // For now, return a default organization ID
  return 'default-org-id';
}

module.exports = createWebhookRoutes;