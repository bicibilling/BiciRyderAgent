const express = require('express');
const { AuthMiddleware } = require('../middleware/auth');
const { logger } = require('../utils/logger');

function createDashboardRoutes(managers, conversationStateManager) {
  const router = express.Router();
  
  /**
   * Get dashboard overview data
   */
  router.get('/overview', async (req, res) => {
    try {
      const { organizationId } = req.user;
      
      // Get dashboard manager for organization
      const dashboardManager = managers.get(organizationId);
      
      if (!dashboardManager) {
        return res.json({
          success: true,
          data: {
            activeConversations: 0,
            connectedClients: 0,
            dailyStats: null
          }
        });
      }
      
      // Get real-time metrics
      const realtimeMetrics = await conversationStateManager.getRealtimeMetrics(organizationId);
      
      // Get today's analytics
      const today = new Date().toISOString().split('T')[0];
      const dailyAnalytics = await conversationStateManager.getDailyAnalytics(organizationId, today);
      
      // Get recent conversations
      const recentConversations = await conversationStateManager.getOrganizationConversations(organizationId, 10);
      
      res.json({
        success: true,
        data: {
          activeConversations: dashboardManager.activeConversations.size,
          connectedClients: dashboardManager.getConnectionCount(),
          realtimeMetrics: realtimeMetrics,
          dailyStats: dailyAnalytics,
          recentConversations: recentConversations.map(conv => ({
            id: conv.id,
            customerPhone: conv.customerPhone,
            status: conv.status,
            startedAt: conv.startedAt,
            isHumanTakeover: conv.isHumanTakeover,
            duration: conv.duration
          }))
        }
      });
      
    } catch (error) {
      logger.error('Dashboard overview error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get dashboard overview',
        message: error.message
      });
    }
  });
  
  /**
   * Get active conversations
   */
  router.get('/conversations/active', async (req, res) => {
    try {
      const { organizationId } = req.user;
      
      const dashboardManager = managers.get(organizationId);
      if (!dashboardManager) {
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Get all active conversations
      const activeConversations = [];
      
      for (const [conversationId, connection] of dashboardManager.activeConversations) {
        try {
          const state = await connection.getConversationState();
          if (state) {
            activeConversations.push({
              id: conversationId,
              ...state,
              connectionState: connection.connectionState,
              isHumanTakeover: connection.isHumanTakeover
            });
          }
        } catch (error) {
          logger.warn('Failed to get conversation state', {
            conversationId,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        data: activeConversations
      });
      
    } catch (error) {
      logger.error('Active conversations error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get active conversations',
        message: error.message
      });
    }
  });
  
  /**
   * Get conversation details
   */
  router.get('/conversations/:conversationId', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      
      const conversationState = await conversationStateManager.getConversationState(conversationId);
      
      if (!conversationState) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }
      
      // Verify organization access
      if (conversationState.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Access denied to conversation'
        });
      }
      
      // Get analytics if available
      const analytics = await conversationStateManager.getConversationAnalytics(conversationId);
      
      res.json({
        success: true,
        data: {
          ...conversationState,
          analytics: analytics
        }
      });
      
    } catch (error) {
      logger.error('Conversation details error', {
        conversationId: req.params.conversationId,
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get conversation details',
        message: error.message
      });
    }
  });
  
  /**
   * Update conversation notes
   */
  router.patch('/conversations/:conversationId/notes', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      const { notes } = req.body;
      
      const conversationState = await conversationStateManager.getConversationState(conversationId);
      
      if (!conversationState) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }
      
      // Verify organization access
      if (conversationState.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Access denied to conversation'
        });
      }
      
      // Update notes
      const updatedState = {
        ...conversationState,
        notes: notes,
        notesUpdatedBy: req.user.id,
        notesUpdatedAt: new Date().toISOString()
      };
      
      await conversationStateManager.storeConversationState(conversationId, updatedState);
      
      // Broadcast update to dashboard clients
      const dashboardManager = managers.get(organizationId);
      if (dashboardManager) {
        dashboardManager.broadcastToConversationSubscribers(conversationId, {
          type: 'conversation_notes_updated',
          conversationId,
          notes,
          updatedBy: req.user.id,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        message: 'Notes updated successfully'
      });
      
    } catch (error) {
      logger.error('Update conversation notes error', {
        conversationId: req.params.conversationId,
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to update conversation notes',
        message: error.message
      });
    }
  });
  
  /**
   * Search conversations
   */
  router.get('/conversations/search', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { 
        phoneNumber, 
        startDate, 
        endDate, 
        status, 
        humanTakeover,
        limit = 50,
        offset = 0
      } = req.query;
      
      const criteria = {
        phoneNumber,
        startDate,
        endDate,
        status,
        humanTakeover: humanTakeover !== undefined ? humanTakeover === 'true' : undefined
      };
      
      const conversations = await conversationStateManager.searchConversations(organizationId, criteria);
      
      // Apply pagination
      const paginatedConversations = conversations
        .slice(parseInt(offset), parseInt(offset) + parseInt(limit));
      
      res.json({
        success: true,
        data: paginatedConversations,
        pagination: {
          total: conversations.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: conversations.length > parseInt(offset) + parseInt(limit)
        }
      });
      
    } catch (error) {
      logger.error('Search conversations error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to search conversations',
        message: error.message
      });
    }
  });
  
  /**
   * Get dashboard settings
   */
  router.get('/settings', async (req, res) => {
    try {
      const { organizationId } = req.user;
      
      // TODO: Implement organization settings retrieval
      const settings = {
        organizationId,
        dashboardRefreshInterval: 5000,
        autoSubscribeNewConversations: true,
        notificationSettings: {
          newConversations: true,
          humanTakeovers: true,
          conversationEnded: false
        },
        displaySettings: {
          showTranscripts: true,
          showAnalytics: true,
          compactView: false
        }
      };
      
      res.json({
        success: true,
        data: settings
      });
      
    } catch (error) {
      logger.error('Dashboard settings error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get dashboard settings',
        message: error.message
      });
    }
  });
  
  /**
   * Update dashboard settings
   */
  router.patch('/settings', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const settings = req.body;
      
      // TODO: Implement organization settings storage
      logger.info('Dashboard settings updated', {
        organizationId,
        userId: req.user.id,
        settings
      });
      
      res.json({
        success: true,
        message: 'Settings updated successfully'
      });
      
    } catch (error) {
      logger.error('Update dashboard settings error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to update dashboard settings',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createDashboardRoutes;