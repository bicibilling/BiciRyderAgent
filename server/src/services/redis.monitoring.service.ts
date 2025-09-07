/**
 * Redis Monitoring Service
 * Provides health monitoring, metrics collection, and alerting for Redis implementation
 */

import { RedisConfig } from '../config/redis.config';
import { RedisService } from './redis.service';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface RedisMetrics {
  // Connection metrics
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  connectionUptime: number;
  connectionLatency: number;
  
  // Performance metrics
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  
  // Error metrics
  errorRate: number;
  totalErrors: number;
  lastError?: { message: string; timestamp: Date };
  
  // Memory metrics
  memoryUsage?: {
    used: number;
    max: number;
    percentage: number;
  };
  
  // Operation metrics
  operationsPerSecond: number;
  totalOperations: number;
  
  timestamp: Date;
}

export interface RedisAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details?: any;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

export class RedisMonitoringService extends EventEmitter {
  private metrics: RedisMetrics;
  private redisService: RedisService;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alerts: Map<string, RedisAlert> = new Map();
  private operationCounts: Map<string, number> = new Map();
  private responseTimes: number[] = [];
  private lastConnectionTime: Date | null = null;

  // Thresholds for alerting
  private readonly THRESHOLDS = {
    CACHE_HIT_RATE_LOW: 50, // Below 50% hit rate
    RESPONSE_TIME_HIGH: 100, // Above 100ms average response
    ERROR_RATE_HIGH: 5, // Above 5% error rate
    MEMORY_USAGE_HIGH: 85, // Above 85% memory usage
    CONNECTION_DOWNTIME: 30000, // 30 seconds disconnected
  };

  constructor() {
    super();
    this.redisService = new RedisService();
    this.metrics = this.initializeMetrics();
    this.setupMetricsCollection();
  }

  private initializeMetrics(): RedisMetrics {
    return {
      connectionStatus: 'disconnected',
      connectionUptime: 0,
      connectionLatency: 0,
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      errorRate: 0,
      totalErrors: 0,
      operationsPerSecond: 0,
      totalOperations: 0,
      timestamp: new Date()
    };
  }

  private setupMetricsCollection() {
    // Track Redis operations
    this.setupOperationTracking();
    
    // Monitor connection status
    this.setupConnectionMonitoring();
  }

  private setupOperationTracking() {
    // Wrap Redis operations to collect metrics
    const originalRedisService = this.redisService;
    
    // Create proxy to intercept Redis operations
    this.instrumentRedisOperations();
  }

  private setupConnectionMonitoring() {
    // Monitor Redis connection health
    this.on('redis:operation', (operation: string, success: boolean, responseTime: number) => {
      this.recordOperation(operation, success, responseTime);
    });
  }

  private instrumentRedisOperations() {
    const originalGet = this.redisService.get.bind(this.redisService);
    const originalSet = this.redisService.set.bind(this.redisService);
    const originalDelete = this.redisService.delete.bind(this.redisService);

    // Instrument get operations
    this.redisService.get = async (key: string) => {
      const startTime = performance.now();
      try {
        const result = await originalGet(key);
        const responseTime = performance.now() - startTime;
        
        this.emit('redis:operation', 'get', true, responseTime);
        
        // Track cache hits/misses
        if (result !== null) {
          this.recordCacheHit();
        } else {
          this.recordCacheMiss();
        }
        
        return result;
      } catch (error) {
        const responseTime = performance.now() - startTime;
        this.emit('redis:operation', 'get', false, responseTime);
        this.recordError('get', error as Error);
        throw error;
      }
    };

    // Instrument set operations
    this.redisService.set = async (key: string, value: any, ttl?: number) => {
      const startTime = performance.now();
      try {
        const result = await originalSet(key, value, ttl);
        const responseTime = performance.now() - startTime;
        this.emit('redis:operation', 'set', true, responseTime);
        return result;
      } catch (error) {
        const responseTime = performance.now() - startTime;
        this.emit('redis:operation', 'set', false, responseTime);
        this.recordError('set', error as Error);
        throw error;
      }
    };

    // Instrument delete operations
    this.redisService.delete = async (key: string) => {
      const startTime = performance.now();
      try {
        const result = await originalDelete(key);
        const responseTime = performance.now() - startTime;
        this.emit('redis:operation', 'delete', true, responseTime);
        return result;
      } catch (error) {
        const responseTime = performance.now() - startTime;
        this.emit('redis:operation', 'delete', false, responseTime);
        this.recordError('delete', error as Error);
        throw error;
      }
    };
  }

  private recordOperation(operation: string, success: boolean, responseTime: number) {
    // Update operation counts
    const currentCount = this.operationCounts.get(operation) || 0;
    this.operationCounts.set(operation, currentCount + 1);
    
    // Update total operations
    this.metrics.totalOperations += 1;
    
    // Track response times
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000); // Keep last 1000
    }
    
    // Update average response time
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    
    // Check for performance alerts
    this.checkPerformanceThresholds();
  }

  private recordCacheHit() {
    this.metrics.cacheHits += 1;
    this.updateCacheHitRate();
  }

  private recordCacheMiss() {
    this.metrics.cacheMisses += 1;
    this.updateCacheHitRate();
  }

  private updateCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
    
    // Check cache hit rate threshold
    if (this.metrics.cacheHitRate < this.THRESHOLDS.CACHE_HIT_RATE_LOW) {
      this.createAlert('cache-hit-rate-low', 'warning', 'medium', 
        `Cache hit rate is low: ${this.metrics.cacheHitRate.toFixed(1)}%`);
    }
  }

  private recordError(operation: string, error: Error) {
    this.metrics.totalErrors += 1;
    this.metrics.lastError = {
      message: `${operation}: ${error.message}`,
      timestamp: new Date()
    };
    
    // Update error rate
    const errorRate = (this.metrics.totalErrors / this.metrics.totalOperations) * 100;
    this.metrics.errorRate = errorRate;
    
    // Create error alert
    this.createAlert(`redis-error-${Date.now()}`, 'error', 'high',
      `Redis ${operation} operation failed: ${error.message}`, { error: error.message });
    
    logger.error(`Redis operation error [${operation}]:`, error);
  }

  private checkPerformanceThresholds() {
    // Check average response time
    if (this.metrics.averageResponseTime > this.THRESHOLDS.RESPONSE_TIME_HIGH) {
      this.createAlert('response-time-high', 'warning', 'medium',
        `Redis average response time is high: ${this.metrics.averageResponseTime.toFixed(2)}ms`);
    }
    
    // Check error rate
    if (this.metrics.errorRate > this.THRESHOLDS.ERROR_RATE_HIGH) {
      this.createAlert('error-rate-high', 'error', 'high',
        `Redis error rate is high: ${this.metrics.errorRate.toFixed(2)}%`);
    }
  }

  private createAlert(id: string, type: RedisAlert['type'], severity: RedisAlert['severity'], 
                     message: string, details?: any) {
    const existingAlert = this.alerts.get(id);
    
    if (existingAlert && !existingAlert.resolved) {
      return; // Don't duplicate active alerts
    }
    
    const alert: RedisAlert = {
      id,
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      resolved: false
    };
    
    this.alerts.set(id, alert);
    this.emit('redis:alert', alert);
    
    logger.warn(`Redis Alert [${severity}]:`, message, details);
  }

  private resolveAlert(id: string) {
    const alert = this.alerts.get(id);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.emit('redis:alert:resolved', alert);
      logger.info(`Redis Alert resolved: ${alert.message}`);
    }
  }

  public startMonitoring(intervalMs: number = 30000) {
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    
    // Initial health check
    this.performHealthCheck();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
      this.calculateOperationsPerSecond();
      this.updateMetricsTimestamp();
    }, intervalMs);
    
    logger.info('Redis monitoring started', { intervalMs });
  }

  public stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logger.info('Redis monitoring stopped');
  }

  private async performHealthCheck() {
    try {
      const startTime = performance.now();
      const healthCheck = await RedisConfig.healthCheck();
      const latency = performance.now() - startTime;
      
      this.metrics.connectionLatency = latency;
      
      if (healthCheck.connected && healthCheck.status === 'healthy') {
        if (this.metrics.connectionStatus !== 'connected') {
          this.metrics.connectionStatus = 'connected';
          this.lastConnectionTime = new Date();
          this.resolveAlert('redis-disconnected');
          logger.info('Redis connection restored');
        }
        
        this.updateConnectionUptime();
      } else {
        this.handleConnectionFailure();
      }
      
      // Get Redis memory info if available
      await this.updateMemoryMetrics();
      
    } catch (error) {
      this.handleConnectionFailure();
      this.recordError('healthCheck', error as Error);
    }
  }

  private handleConnectionFailure() {
    if (this.metrics.connectionStatus === 'connected') {
      this.metrics.connectionStatus = 'disconnected';
      this.createAlert('redis-disconnected', 'error', 'critical',
        'Redis connection lost');
    }
    
    this.metrics.connectionUptime = 0;
  }

  private updateConnectionUptime() {
    if (this.lastConnectionTime) {
      this.metrics.connectionUptime = Date.now() - this.lastConnectionTime.getTime();
    }
  }

  private async updateMemoryMetrics() {
    // This would require Redis INFO command access
    // For now, we'll leave it as optional
    try {
      // In a full implementation, you'd get Redis memory info here
      // const info = await this.redisService.client.info('memory');
      // Parse and update memory metrics
    } catch (error) {
      // Memory metrics not available
    }
  }

  private calculateOperationsPerSecond() {
    // Calculate ops/second based on recent operations
    const now = Date.now();
    const timeWindow = 60000; // 1 minute window
    
    // This is a simplified calculation
    // In production, you'd track operations with timestamps
    this.metrics.operationsPerSecond = this.metrics.totalOperations / 60; // Rough estimate
  }

  private updateMetricsTimestamp() {
    this.metrics.timestamp = new Date();
  }

  // Public API methods
  public getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  public getActiveAlerts(): RedisAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  public getAllAlerts(): RedisAlert[] {
    return Array.from(this.alerts.values());
  }

  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'critical';
    details: string;
    metrics: RedisMetrics;
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    const highAlerts = activeAlerts.filter(a => a.severity === 'high').length;
    
    let status: 'healthy' | 'degraded' | 'critical';
    let details: string;
    
    if (criticalAlerts > 0) {
      status = 'critical';
      details = `${criticalAlerts} critical alerts active`;
    } else if (highAlerts > 0 || this.metrics.connectionStatus !== 'connected') {
      status = 'degraded';
      details = `${highAlerts} high-severity alerts, connection: ${this.metrics.connectionStatus}`;
    } else {
      status = 'healthy';
      details = 'All systems operational';
    }
    
    return {
      status,
      details,
      metrics: this.getMetrics()
    };
  }

  public resetMetrics() {
    this.metrics = this.initializeMetrics();
    this.operationCounts.clear();
    this.responseTimes = [];
    this.alerts.clear();
    
    logger.info('Redis metrics reset');
  }

  // Express middleware for health endpoint
  public getHealthMiddleware() {
    return (req: any, res: any) => {
      const health = this.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 :
                        health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(health);
    };
  }

  // Express middleware for metrics endpoint
  public getMetricsMiddleware() {
    return (req: any, res: any) => {
      res.json({
        metrics: this.getMetrics(),
        alerts: {
          active: this.getActiveAlerts(),
          total: this.getAllAlerts().length
        }
      });
    };
  }

  public cleanup() {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}

// Singleton instance
let monitoringService: RedisMonitoringService | null = null;

export function getRedisMonitoringService(): RedisMonitoringService {
  if (!monitoringService) {
    monitoringService = new RedisMonitoringService();
  }
  return monitoringService;
}

export { RedisMonitoringService };