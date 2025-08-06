const express = require('express');
const { logger } = require('../utils/logger');

function createAnalyticsRoutes(conversationStateManager) {
  const router = express.Router();
  
  /**
   * Get daily analytics
   */
  router.get('/daily/:date', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { date } = req.params;
      
      const analytics = await conversationStateManager.getDailyAnalytics(organizationId, date);
      
      res.json({
        success: true,
        data: analytics
      });
      
    } catch (error) {
      logger.error('Get daily analytics error', {
        organizationId: req.user.organizationId,
        date: req.params.date,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get daily analytics',
        message: error.message
      });
    }
  });
  
  /**
   * Get analytics for date range
   */
  router.get('/range', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'startDate and endDate are required'
        });
      }
      
      const analytics = await conversationStateManager.getAnalyticsRange(organizationId, startDate, endDate);
      
      // Calculate summary statistics
      const summary = analytics.reduce((acc, day) => {
        acc.totalConversations += day.total_conversations || 0;
        acc.totalDuration += day.total_duration || 0;
        acc.totalHumanTakeovers += day.human_takeovers || 0;
        acc.totalSuccessfulCompletions += day.successful_completions || 0;
        return acc;
      }, {
        totalConversations: 0,
        totalDuration: 0,
        totalHumanTakeovers: 0,
        totalSuccessfulCompletions: 0
      });
      
      // Calculate rates
      summary.humanTakeoverRate = summary.totalConversations > 0 
        ? (summary.totalHumanTakeovers / summary.totalConversations * 100).toFixed(2)
        : 0;
      
      summary.successRate = summary.totalConversations > 0
        ? (summary.totalSuccessfulCompletions / summary.totalConversations * 100).toFixed(2)
        : 0;
      
      summary.averageDuration = summary.totalConversations > 0
        ? Math.round(summary.totalDuration / summary.totalConversations)
        : 0;
      
      res.json({
        success: true,
        data: {
          daily: analytics,
          summary: summary,
          dateRange: {
            startDate,
            endDate,
            days: analytics.length
          }
        }
      });
      
    } catch (error) {
      logger.error('Get analytics range error', {
        organizationId: req.user.organizationId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get analytics range',
        message: error.message
      });
    }
  });
  
  /**
   * Get real-time metrics
   */
  router.get('/realtime', async (req, res) => {
    try {
      const { organizationId } = req.user;
      
      const metrics = await conversationStateManager.getRealtimeMetrics(organizationId);
      
      res.json({
        success: true,
        data: metrics
      });
      
    } catch (error) {
      logger.error('Get realtime metrics error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get realtime metrics',
        message: error.message
      });
    }
  });
  
  /**
   * Get conversation analytics
   */
  router.get('/conversations/:conversationId', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { conversationId } = req.params;
      
      // Verify conversation belongs to organization
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
      
      const analytics = await conversationStateManager.getConversationAnalytics(conversationId);
      
      res.json({
        success: true,
        data: analytics
      });
      
    } catch (error) {
      logger.error('Get conversation analytics error', {
        conversationId: req.params.conversationId,
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get conversation analytics',
        message: error.message
      });
    }
  });
  
  /**
   * Export analytics data
   */
  router.get('/export', async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { startDate, endDate, format = 'json' } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'startDate and endDate are required'
        });
      }
      
      const analytics = await conversationStateManager.getAnalyticsRange(organizationId, startDate, endDate);
      
      if (format === 'csv') {
        // Convert to CSV format
        const csvHeaders = [
          'Date',
          'Total Conversations',
          'Total Duration (minutes)',
          'Human Takeovers',
          'Successful Completions',
          'Success Rate (%)',
          'Takeover Rate (%)'
        ].join(',');
        
        const csvRows = analytics.map(day => [
          day.date,
          day.total_conversations || 0,
          Math.round((day.total_duration || 0) / 60),
          day.human_takeovers || 0,
          day.successful_completions || 0,
          day.total_conversations > 0 
            ? ((day.successful_completions || 0) / day.total_conversations * 100).toFixed(2)
            : 0,
          day.total_conversations > 0
            ? ((day.human_takeovers || 0) / day.total_conversations * 100).toFixed(2)
            : 0
        ].join(','));
        
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${startDate}-${endDate}.csv"`);
        res.send(csvContent);
        
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${startDate}-${endDate}.json"`);
        res.json({
          exportedAt: new Date().toISOString(),
          organizationId,
          dateRange: { startDate, endDate },
          data: analytics
        });
      }
      
    } catch (error) {
      logger.error('Export analytics error', {
        organizationId: req.user.organizationId,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to export analytics',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createAnalyticsRoutes;