const { logger } = require('../config/logger');
const database = require('../config/database');

class MonitoringService {
  constructor() {
    this.logger = logger.child({ component: 'monitoring' });
    this.redis = database.getRedis();
    this.supabase = database.getSupabase();
    
    // Metrics collection
    this.metrics = {
      requests: new Map(),
      responses: new Map(),
      integrations: new Map(),
      errors: new Map()
    };

    // Start periodic monitoring
    this.startPeriodicMonitoring();
  }

  /**
   * Record API request metrics
   */
  recordRequest(req, res, responseTime) {
    const key = `${req.method}:${req.path}`;
    const timestamp = new Date().toISOString();
    
    // Update request counter
    const current = this.metrics.requests.get(key) || { count: 0, totalTime: 0 };
    current.count++;
    current.totalTime += responseTime;
    current.lastSeen = timestamp;
    this.metrics.requests.set(key, current);

    // Record response status
    const statusKey = `${key}:${res.statusCode}`;
    const statusCount = this.metrics.responses.get(statusKey) || 0;
    this.metrics.responses.set(statusKey, statusCount + 1);

    // Log slow requests
    if (responseTime > 5000) { // 5 seconds
      this.logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        responseTime,
        statusCode: res.statusCode,
        ip: req.ip
      });
    }

    // Store in Redis for dashboard
    this.storeRequestMetric({
      endpoint: key,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      timestamp,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }

  /**
   * Record integration call metrics
   */
  recordIntegrationCall(integration, operation, success, responseTime, error = null) {
    const key = `${integration}:${operation}`;
    const timestamp = new Date().toISOString();

    const current = this.metrics.integrations.get(key) || {
      total: 0,
      successful: 0,
      failed: 0,
      totalTime: 0,
      errors: []
    };

    current.total++;
    current.totalTime += responseTime;
    
    if (success) {
      current.successful++;
    } else {
      current.failed++;
      if (error) {
        current.errors.push({
          error: error.message,
          timestamp
        });
        // Keep only last 10 errors
        if (current.errors.length > 10) {
          current.errors = current.errors.slice(-10);
        }
      }
    }

    current.lastSeen = timestamp;
    this.metrics.integrations.set(key, current);

    // Log integration failures
    if (!success) {
      this.logger.error('Integration call failed', {
        integration,
        operation,
        responseTime,
        error: error?.message,
        timestamp
      });
    }

    // Log slow integration calls
    if (responseTime > 10000) { // 10 seconds
      this.logger.warn('Slow integration call', {
        integration,
        operation,
        responseTime,
        success,
        timestamp
      });
    }

    // Store in Redis
    this.storeIntegrationMetric({
      integration,
      operation,
      success,
      responseTime,
      error: error?.message,
      timestamp
    });
  }

  /**
   * Record error metrics
   */
  recordError(error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorKey = error.name || 'UnknownError';

    const current = this.metrics.errors.get(errorKey) || {
      count: 0,
      lastSeen: null,
      contexts: []
    };

    current.count++;
    current.lastSeen = timestamp;
    current.contexts.push({
      message: error.message,
      stack: error.stack,
      context,
      timestamp
    });

    // Keep only last 5 contexts
    if (current.contexts.length > 5) {
      current.contexts = current.contexts.slice(-5);
    }

    this.metrics.errors.set(errorKey, current);

    // Store in database for analysis
    this.storeErrorMetric({
      errorName: errorKey,
      errorMessage: error.message,
      errorStack: error.stack,
      context,
      timestamp
    });
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    return {
      timestamp: now.toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      requests: {
        total: Array.from(this.metrics.requests.values())
          .reduce((sum, metric) => sum + metric.count, 0),
        endpoints: Array.from(this.metrics.requests.entries())
          .map(([endpoint, metric]) => ({
            endpoint,
            count: metric.count,
            avgResponseTime: Math.round(metric.totalTime / metric.count),
            lastSeen: metric.lastSeen
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10) // Top 10 endpoints
      },
      integrations: {
        total: Array.from(this.metrics.integrations.values())
          .reduce((sum, metric) => sum + metric.total, 0),
        services: Array.from(this.metrics.integrations.entries())
          .map(([service, metric]) => ({
            service,
            total: metric.total,
            successful: metric.successful,
            failed: metric.failed,
            successRate: metric.total > 0 ? 
              Math.round((metric.successful / metric.total) * 100) : 0,
            avgResponseTime: metric.total > 0 ? 
              Math.round(metric.totalTime / metric.total) : 0,
            lastSeen: metric.lastSeen,
            recentErrors: metric.errors
          }))
      },
      errors: {
        total: Array.from(this.metrics.errors.values())
          .reduce((sum, metric) => sum + metric.count, 0),
        types: Array.from(this.metrics.errors.entries())
          .map(([type, metric]) => ({
            type,
            count: metric.count,
            lastSeen: metric.lastSeen,
            recentContexts: metric.contexts.slice(-3) // Last 3 contexts
          }))
          .sort((a, b) => b.count - a.count)
      }
    };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    const status = {
      overall: 'healthy',
      timestamp: new Date().toISOString(),
      components: {}
    };

    try {
      // Check database connections
      status.components.redis = await this.checkRedisHealth();
      status.components.supabase = await this.checkSupabaseHealth();

      // Check integration health
      status.components.integrations = this.checkIntegrationHealth();

      // Check error rates
      status.components.errorRate = this.checkErrorRate();

      // Check response times
      status.components.performance = this.checkPerformance();

      // Determine overall status
      const componentStatuses = Object.values(status.components);
      if (componentStatuses.some(comp => comp.status === 'critical')) {
        status.overall = 'critical';
      } else if (componentStatuses.some(comp => comp.status === 'warning')) {
        status.overall = 'warning';
      }

    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      status.overall = 'critical';
      status.error = error.message;
    }

    return status;
  }

  /**
   * Check Redis health
   */
  async checkRedisHealth() {
    try {
      const start = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 100 ? 'healthy' : 'warning',
        responseTime,
        message: 'Redis connection successful'
      };
    } catch (error) {
      return {
        status: 'critical',
        error: error.message,
        message: 'Redis connection failed'
      };
    }
  }

  /**
   * Check Supabase health
   */
  async checkSupabaseHealth() {
    try {
      const start = Date.now();
      await this.supabase.from('organizations').select('id').limit(1);
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 500 ? 'healthy' : 'warning',
        responseTime,
        message: 'Supabase connection successful'
      };
    } catch (error) {
      return {
        status: 'critical',
        error: error.message,
        message: 'Supabase connection failed'
      };
    }
  }

  /**
   * Check integration health
   */
  checkIntegrationHealth() {
    const integrations = Array.from(this.metrics.integrations.entries());
    const recentFailures = integrations.filter(([_, metric]) => {
      const recentErrors = metric.errors.filter(error => {
        const errorTime = new Date(error.timestamp);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        return errorTime > fiveMinutesAgo;
      });
      return recentErrors.length > 0;
    });

    let status = 'healthy';
    if (recentFailures.length > 0) {
      status = recentFailures.length > 2 ? 'critical' : 'warning';
    }

    return {
      status,
      totalIntegrations: integrations.length,
      failingIntegrations: recentFailures.length,
      recentFailures: recentFailures.map(([service, metric]) => ({
        service,
        failureCount: metric.failed,
        lastError: metric.errors[metric.errors.length - 1]
      }))
    };
  }

  /**
   * Check error rate
   */
  checkErrorRate() {
    const totalErrors = Array.from(this.metrics.errors.values())
      .reduce((sum, metric) => sum + metric.count, 0);
    
    const totalRequests = Array.from(this.metrics.requests.values())
      .reduce((sum, metric) => sum + metric.count, 0);

    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    let status = 'healthy';
    if (errorRate > 10) {
      status = 'critical';
    } else if (errorRate > 5) {
      status = 'warning';
    }

    return {
      status,
      errorRate: Math.round(errorRate * 100) / 100,
      totalErrors,
      totalRequests
    };
  }

  /**
   * Check performance
   */
  checkPerformance() {
    const requestMetrics = Array.from(this.metrics.requests.values());
    const avgResponseTimes = requestMetrics.map(metric => 
      metric.totalTime / metric.count
    );

    const overallAvg = avgResponseTimes.length > 0 ? 
      avgResponseTimes.reduce((sum, time) => sum + time, 0) / avgResponseTimes.length : 0;

    let status = 'healthy';
    if (overallAvg > 5000) {
      status = 'critical';
    } else if (overallAvg > 2000) {
      status = 'warning';
    }

    return {
      status,
      avgResponseTime: Math.round(overallAvg),
      slowEndpoints: requestMetrics
        .map(metric => ({
          avgTime: Math.round(metric.totalTime / metric.count),
          count: metric.count
        }))
        .filter(metric => metric.avgTime > 2000)
        .sort((a, b) => b.avgTime - a.avgTime)
        .slice(0, 5)
    };
  }

  /**
   * Store request metric in Redis
   */
  async storeRequestMetric(metric) {
    try {
      await this.redis.lpush('metrics:requests', JSON.stringify(metric));
      await this.redis.ltrim('metrics:requests', 0, 999); // Keep last 1000
    } catch (error) {
      this.logger.warn('Failed to store request metric', { error: error.message });
    }
  }

  /**
   * Store integration metric in Redis
   */
  async storeIntegrationMetric(metric) {
    try {
      await this.redis.lpush('metrics:integrations', JSON.stringify(metric));
      await this.redis.ltrim('metrics:integrations', 0, 999); // Keep last 1000
    } catch (error) {
      this.logger.warn('Failed to store integration metric', { error: error.message });
    }
  }

  /**
   * Store error metric in database
   */
  async storeErrorMetric(error) {
    try {
      await this.supabase
        .from('error_logs')
        .insert({
          error_name: error.errorName,
          error_message: error.errorMessage,
          error_stack: error.errorStack,
          context: error.context,
          created_at: error.timestamp
        });
    } catch (err) {
      this.logger.warn('Failed to store error metric', { error: err.message });
    }
  }

  /**
   * Start periodic monitoring tasks
   */
  startPeriodicMonitoring() {
    // Health check every 5 minutes
    setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        
        if (health.overall !== 'healthy') {
          this.logger.warn('System health degraded', { health });
        }

        // Store health status
        await this.redis.setex(
          'system:health',
          300, // 5 minutes
          JSON.stringify(health)
        );

      } catch (error) {
        this.logger.error('Periodic health check failed', { error: error.message });
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Metrics summary every hour
    setInterval(async () => {
      try {
        const summary = this.getMetricsSummary();
        
        this.logger.info('Hourly metrics summary', {
          totalRequests: summary.requests.total,
          totalIntegrationCalls: summary.integrations.total,
          totalErrors: summary.errors.total,
          memoryUsage: summary.memory,
          uptime: summary.uptime
        });

        // Store metrics summary
        await this.redis.setex(
          'metrics:summary',
          3600, // 1 hour
          JSON.stringify(summary)
        );

      } catch (error) {
        this.logger.error('Periodic metrics summary failed', { error: error.message });
      }
    }, 60 * 60 * 1000); // 1 hour

    // Cleanup old metrics every 6 hours
    setInterval(() => {
      this.cleanupMetrics();
    }, 6 * 60 * 60 * 1000); // 6 hours
  }

  /**
   * Cleanup old metrics to prevent memory leaks
   */
  cleanupMetrics() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Clean up request metrics
    for (const [key, metric] of this.metrics.requests.entries()) {
      if (new Date(metric.lastSeen) < cutoff) {
        this.metrics.requests.delete(key);
      }
    }

    // Clean up integration metrics
    for (const [key, metric] of this.metrics.integrations.entries()) {
      if (new Date(metric.lastSeen) < cutoff) {
        this.metrics.integrations.delete(key);
      }
    }

    this.logger.info('Metrics cleanup completed', {
      requestMetrics: this.metrics.requests.size,
      integrationMetrics: this.metrics.integrations.size,
      errorMetrics: this.metrics.errors.size
    });
  }

  /**
   * Create middleware for request monitoring
   */
  createRequestMiddleware() {
    return (req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - start;
        this.recordRequest(req, res, responseTime);
      });

      next();
    };
  }

  /**
   * Create wrapper for integration calls
   */
  wrapIntegrationCall(integration, operation) {
    return async (fn) => {
      const start = Date.now();
      let success = false;
      let error = null;

      try {
        const result = await fn();
        success = true;
        return result;
      } catch (err) {
        error = err;
        throw err;
      } finally {
        const responseTime = Date.now() - start;
        this.recordIntegrationCall(integration, operation, success, responseTime, error);
      }
    };
  }
}

module.exports = new MonitoringService();