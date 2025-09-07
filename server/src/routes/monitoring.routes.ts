/**
 * Redis Monitoring Routes
 * API endpoints for Redis health monitoring and metrics
 */

import { Router } from 'express';
import { getRedisMonitoringService } from '../services/redis.monitoring.service';
import { RedisConfig } from '../config/redis.config';
import { RedisService } from '../services/redis.service';
import { logger } from '../utils/logger';

const router = Router();
const monitoringService = getRedisMonitoringService();

// Health check endpoint
router.get('/health', (req, res) => {
  const health = monitoringService.getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 :
                    health.status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json(health);
});

// Detailed Redis health endpoint
router.get('/health/redis', async (req, res) => {
  try {
    const redisService = new RedisService();
    const status = redisService.getStatus();
    
    let connectionTest = null;
    if (status.enabled) {
      try {
        connectionTest = await RedisConfig.healthCheck();
      } catch (error) {
        connectionTest = { 
          connected: false, 
          error: (error as Error).message 
        };
      }
    }
    
    const health = {
      redis: {
        enabled: status.enabled,
        connected: status.connected,
        configuration: status.config,
        connectionTest,
        lastHealthCheck: new Date().toISOString()
      },
      metrics: monitoringService.getMetrics(),
      alerts: monitoringService.getActiveAlerts()
    };
    
    const healthStatus = connectionTest?.connected ? 'healthy' : 
                        status.enabled ? 'degraded' : 'disabled';
    
    res.json({
      status: healthStatus,
      timestamp: new Date().toISOString(),
      ...health
    });
    
  } catch (error) {
    logger.error('Redis health check failed:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
  }
});

// Metrics endpoint
router.get('/metrics', (req, res) => {
  const metrics = monitoringService.getMetrics();
  const alerts = {
    active: monitoringService.getActiveAlerts(),
    total: monitoringService.getAllAlerts().length
  };
  
  res.json({
    timestamp: new Date().toISOString(),
    metrics,
    alerts
  });
});

// Performance metrics endpoint
router.get('/metrics/performance', (req, res) => {
  const metrics = monitoringService.getMetrics();
  
  const performanceMetrics = {
    timestamp: metrics.timestamp,
    caching: {
      hitRate: metrics.cacheHitRate,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      totalRequests: metrics.cacheHits + metrics.cacheMisses
    },
    response: {
      averageTime: metrics.averageResponseTime,
      connectionLatency: metrics.connectionLatency
    },
    operations: {
      operationsPerSecond: metrics.operationsPerSecond,
      totalOperations: metrics.totalOperations
    },
    errors: {
      errorRate: metrics.errorRate,
      totalErrors: metrics.totalErrors,
      lastError: metrics.lastError
    }
  };
  
  res.json(performanceMetrics);
});

// Alerts endpoint
router.get('/alerts', (req, res) => {
  const { resolved, severity, type } = req.query;
  let alerts = monitoringService.getAllAlerts();
  
  // Filter by resolved status
  if (resolved !== undefined) {
    const isResolved = resolved === 'true';
    alerts = alerts.filter(alert => alert.resolved === isResolved);
  }
  
  // Filter by severity
  if (severity) {
    alerts = alerts.filter(alert => alert.severity === severity);
  }
  
  // Filter by type
  if (type) {
    alerts = alerts.filter(alert => alert.type === type);
  }
  
  // Sort by timestamp (newest first)
  alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  res.json({
    alerts,
    summary: {
      total: alerts.length,
      active: alerts.filter(a => !a.resolved).length,
      resolved: alerts.filter(a => a.resolved).length,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length
      }
    }
  });
});

// Connection status endpoint
router.get('/status/connection', async (req, res) => {
  try {
    const redisService = new RedisService();
    const serviceStatus = redisService.getStatus();
    
    let connectionDetails = null;
    if (serviceStatus.enabled) {
      try {
        const healthCheck = await RedisConfig.healthCheck();
        const testKey = `health:test:${Date.now()}`;
        
        // Test basic operations
        const setStart = performance.now();
        await redisService.set(testKey, { test: true }, 10);
        const setTime = performance.now() - setStart;
        
        const getStart = performance.now();
        const getValue = await redisService.get(testKey);
        const getTime = performance.now() - getStart;
        
        await redisService.delete(testKey);
        
        connectionDetails = {
          ...healthCheck,
          operationTest: {
            setTime: Math.round(setTime * 100) / 100,
            getTime: Math.round(getTime * 100) / 100,
            success: getValue?.test === true
          }
        };
      } catch (error) {
        connectionDetails = {
          connected: false,
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    const metrics = monitoringService.getMetrics();
    
    res.json({
      status: serviceStatus.enabled ? (connectionDetails?.connected ? 'connected' : 'error') : 'disabled',
      service: serviceStatus,
      connection: connectionDetails,
      metrics: {
        connectionStatus: metrics.connectionStatus,
        connectionUptime: metrics.connectionUptime,
        connectionLatency: metrics.connectionLatency
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Connection status check failed:', error);
    res.status(500).json({
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache statistics endpoint
router.get('/stats/cache', (req, res) => {
  const metrics = monitoringService.getMetrics();
  
  const cacheStats = {
    timestamp: metrics.timestamp,
    hitRate: {
      percentage: metrics.cacheHitRate,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      total: metrics.cacheHits + metrics.cacheMisses
    },
    performance: {
      averageResponseTime: metrics.averageResponseTime,
      operationsPerSecond: metrics.operationsPerSecond,
      totalOperations: metrics.totalOperations
    },
    health: {
      connectionStatus: metrics.connectionStatus,
      errorRate: metrics.errorRate,
      totalErrors: metrics.totalErrors
    }
  };
  
  // Add performance classification
  cacheStats.performance['classification'] = 
    metrics.averageResponseTime < 10 ? 'excellent' :
    metrics.averageResponseTime < 50 ? 'good' :
    metrics.averageResponseTime < 100 ? 'acceptable' : 'poor';
  
  cacheStats.hitRate['classification'] = 
    metrics.cacheHitRate > 80 ? 'excellent' :
    metrics.cacheHitRate > 60 ? 'good' :
    metrics.cacheHitRate > 40 ? 'acceptable' : 'poor';
  
  res.json(cacheStats);
});

// Reset metrics endpoint (for development/testing)
router.post('/metrics/reset', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Metrics reset not allowed in production'
    });
  }
  
  monitoringService.resetMetrics();
  
  res.json({
    message: 'Metrics reset successfully',
    timestamp: new Date().toISOString()
  });
});

// Start/stop monitoring endpoints
router.post('/monitoring/start', (req, res) => {
  const { interval } = req.body;
  const intervalMs = interval || 30000;
  
  try {
    monitoringService.startMonitoring(intervalMs);
    res.json({
      message: 'Monitoring started',
      interval: intervalMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start monitoring',
      details: (error as Error).message
    });
  }
});

router.post('/monitoring/stop', (req, res) => {
  try {
    monitoringService.stopMonitoring();
    res.json({
      message: 'Monitoring stopped',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop monitoring',
      details: (error as Error).message
    });
  }
});

// Webhook-compatible health endpoint (simple JSON response)
router.get('/webhook/health', (req, res) => {
  const health = monitoringService.getHealthStatus();
  
  res.json({
    status: health.status === 'healthy' ? 'ok' : 'error',
    redis_enabled: process.env.REDIS_ENABLED === 'true',
    redis_connected: health.metrics.connectionStatus === 'connected',
    cache_hit_rate: Math.round(health.metrics.cacheHitRate),
    avg_response_time: Math.round(health.metrics.averageResponseTime),
    active_alerts: monitoringService.getActiveAlerts().length,
    timestamp: new Date().toISOString()
  });
});

// Export for integration with main app
export { router as monitoringRoutes };

// SSE endpoint for real-time monitoring
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial data
  const sendMetrics = () => {
    const metrics = monitoringService.getMetrics();
    const alerts = monitoringService.getActiveAlerts();
    
    const data = JSON.stringify({
      timestamp: new Date().toISOString(),
      metrics,
      alerts,
      health: monitoringService.getHealthStatus()
    });
    
    res.write(`data: ${data}\n\n`);
  };

  // Send metrics immediately
  sendMetrics();

  // Send updates every 5 seconds
  const interval = setInterval(sendMetrics, 5000);

  // Listen for Redis events
  const onAlert = (alert: any) => {
    res.write(`event: alert\n`);
    res.write(`data: ${JSON.stringify(alert)}\n\n`);
  };

  const onAlertResolved = (alert: any) => {
    res.write(`event: alert-resolved\n`);
    res.write(`data: ${JSON.stringify(alert)}\n\n`);
  };

  monitoringService.on('redis:alert', onAlert);
  monitoringService.on('redis:alert:resolved', onAlertResolved);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    monitoringService.off('redis:alert', onAlert);
    monitoringService.off('redis:alert:resolved', onAlertResolved);
  });
});

export default router;