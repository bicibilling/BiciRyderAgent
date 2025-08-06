const express = require('express');
const { logger } = require('../utils/logger');

function createConversationRoutes(managers, conversationStateManager) {
  const router = express.Router();
  
  /**
   * Get conversation history
   */
  router.get('/:conversationId/history', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      
      const conversationState = await conversationStateManager.getConversationState(conversationId);
      
      if (!conversationState) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }
      
      if (conversationState.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Access denied to conversation'
        });
      }
      
      res.json({
        success: true,
        data: {
          conversationId,
          transcript: conversationState.transcript || [],
          events: conversationState.events || [],
          startedAt: conversationState.startedAt,
          endedAt: conversationState.endedAt,
          duration: conversationState.duration
        }
      });
      
    } catch (error) {
      logger.error('Get conversation history error', {
        conversationId: req.params.conversationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get conversation history',
        message: error.message
      });
    }
  });
  
  /**
   * Send message to conversation (human intervention)
   */
  router.post('/:conversationId/messages', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      const { message, messageType = 'text' } = req.body;
      
      if (!message) {
        return res.status(400).json({
          error: 'Message is required'
        });
      }
      
      const dashboardManager = managers.get(organizationId);
      if (!dashboardManager) {
        return res.status(404).json({
          error: 'Organization dashboard not found'
        });
      }
      
      const elevenlabsConnection = dashboardManager.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        return res.status(404).json({
          error: 'Active conversation not found'
        });
      }
      
      // Send message through ElevenLabs connection
      if (messageType === 'text') {
        await elevenlabsConnection.sendUserMessage(message);
      } else if (messageType === 'contextual_update') {
        await elevenlabsConnection.sendContextualUpdate(message);
      } else {
        return res.status(400).json({
          error: 'Invalid message type'
        });
      }
      
      logger.info('Human message sent to conversation', {
        conversationId,
        userId: req.user.id,
        messageType
      });
      
      res.json({
        success: true,
        message: 'Message sent successfully'
      });
      
    } catch (error) {
      logger.error('Send conversation message error', {
        conversationId: req.params.conversationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to send message',
        message: error.message
      });
    }
  });
  
  /**
   * Take over conversation (human intervention)
   */
  router.post('/:conversationId/takeover', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      const { agentName } = req.body;
      
      const dashboardManager = managers.get(organizationId);
      if (!dashboardManager) {
        return res.status(404).json({
          error: 'Organization dashboard not found'
        });
      }
      
      const elevenlabsConnection = dashboardManager.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        return res.status(404).json({
          error: 'Active conversation not found'
        });
      }
      
      await elevenlabsConnection.enableHumanTakeover(agentName || req.user.email);
      
      logger.info('Conversation taken over by human', {
        conversationId,
        userId: req.user.id,
        agentName: agentName || req.user.email
      });
      
      res.json({
        success: true,
        message: 'Conversation taken over successfully'
      });
      
    } catch (error) {
      logger.error('Conversation takeover error', {
        conversationId: req.params.conversationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to takeover conversation',
        message: error.message
      });
    }
  });
  
  /**
   * Release conversation back to AI
   */
  router.post('/:conversationId/release', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      
      const dashboardManager = managers.get(organizationId);
      if (!dashboardManager) {
        return res.status(404).json({
          error: 'Organization dashboard not found'
        });
      }
      
      const elevenlabsConnection = dashboardManager.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        return res.status(404).json({
          error: 'Active conversation not found'
        });
      }
      
      await elevenlabsConnection.releaseToAI();
      
      logger.info('Conversation released back to AI', {
        conversationId,
        userId: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Conversation released to AI successfully'
      });
      
    } catch (error) {
      logger.error('Conversation release error', {
        conversationId: req.params.conversationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to release conversation',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createConversationRoutes;