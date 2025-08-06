const express = require('express');
const { logger } = require('../utils/logger');
const { AuthMiddleware } = require('../middleware/auth');

function createSystemRoutes(managers, conversationStateManager) {
  const router = express.Router();
  
  /**
   * System health check
   */
  router.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };
      
      // Check Redis connection
      try {
        const redisStats = await conversationStateManager.getConnectionStats();
        health.redis = redisStats;
      } catch (error) {
        health.redis = { connected: false, error: error.message };
        health.status = 'degraded';
      }
      
      // Check WebSocket managers
      health.websockets = {
        activeOrganizations: managers.size,
        totalConnections: Array.from(managers.values())
          .reduce((total, manager) => total + manager.getConnectionCount(), 0)
      };
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
      
    } catch (error) {
      logger.error('Health check error', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  /**
   * System metrics (requires authentication)
   */
  router.get('/metrics', AuthMiddleware.verifyToken, AuthMiddleware.requireRole('admin'), async (req, res) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          nodeVersion: process.version,
          platform: process.platform
        },
        websockets: {
          organizations: managers.size,
          connections: Array.from(managers.entries()).map(([orgId, manager]) => ({
            organizationId: orgId,
            connections: manager.getConnectionCount(),
            activeConversations: manager.activeConversations.size
          }))
        }
      };
      
      // Get Redis metrics
      try {
        const redisStats = await conversationStateManager.getConnectionStats();
        metrics.redis = redisStats;
      } catch (error) {
        metrics.redis = { error: error.message };
      }
      
      res.json(metrics);
      
    } catch (error) {
      logger.error('System metrics error', { error: error.message });
      res.status(500).json({
        error: 'Failed to get system metrics',
        message: error.message
      });
    }
  });
  
  /**
   * System logs (requires admin role)
   */
  router.get('/logs', AuthMiddleware.verifyToken, AuthMiddleware.requireRole('admin'), async (req, res) => {
    try {
      const { level = 'info', limit = 100, offset = 0 } = req.query;
      
      // This is a basic implementation - in production you'd want to use a proper log aggregation system
      const fs = require('fs');
      const path = require('path');
      
      const logFile = level === 'error' ? 'logs/error.log' : 'logs/combined.log';
      const logPath = path.join(__dirname, '../..', logFile);
      
      if (!fs.existsSync(logPath)) {
        return res.json({
          success: true,
          data: [],
          message: 'Log file not found'
        });
      }
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      
      // Parse JSON log lines
      const logs = logLines
        .slice(-limit - offset, -offset || undefined)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line, timestamp: new Date().toISOString() };
          }
        })
        .reverse();
      
      res.json({
        success: true,
        data: logs,
        total: logLines.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      logger.error('Get system logs error', { error: error.message });
      res.status(500).json({
        error: 'Failed to get system logs',
        message: error.message
      });
    }
  });
  
  /**
   * Clear old conversation data (cleanup endpoint)
   */
  router.post('/cleanup', AuthMiddleware.verifyToken, AuthMiddleware.requireRole('admin'), async (req, res) => {
    try {
      const { olderThanDays = 30, dryRun = false } = req.body;
      
      logger.info('Starting cleanup process', {
        olderThanDays,
        dryRun,
        adminUser: req.user.id
      });
      
      // Find old conversations
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      let cleanedCount = 0;
      
      // In a real implementation, you'd query your database for old conversations
      // For now, we'll just log the cleanup attempt
      
      if (!dryRun) {
        // Perform actual cleanup
        logger.info('Cleanup completed', { cleanedCount });
      } else {
        logger.info('Dry run completed', { wouldClean: cleanedCount });
      }
      
      res.json({
        success: true,
        cleanedCount: cleanedCount,
        dryRun: dryRun,
        cutoffDate: cutoffDate.toISOString()
      });
      
    } catch (error) {
      logger.error('Cleanup error', { error: error.message });
      res.status(500).json({
        error: 'Cleanup failed',
        message: error.message
      });
    }
  });
  
  /**
   * Restart WebSocket connections for organization
   */
  router.post('/restart-websockets/:organizationId', 
    AuthMiddleware.verifyToken, 
    AuthMiddleware.requireRole('admin'), 
    async (req, res) => {
      try {
        const { organizationId } = req.params;
        
        const manager = managers.get(organizationId);
        if (!manager) {
          return res.status(404).json({
            error: 'Organization not found'
          });
        }
        
        logger.info('Restarting WebSocket connections', {
          organizationId,
          adminUser: req.user.id
        });
        
        // Close all connections for organization
        manager.closeAllConnections();
        
        // Remove from managers (will be recreated on next connection)
        managers.delete(organizationId);
        
        res.json({
          success: true,
          message: 'WebSocket connections restarted'
        });
        
      } catch (error) {
        logger.error('Restart WebSockets error', { error: error.message });
        res.status(500).json({
          error: 'Failed to restart WebSocket connections',
          message: error.message
        });
      }
    }
  );
  
  return router;
}

module.exports = createSystemRoutes;