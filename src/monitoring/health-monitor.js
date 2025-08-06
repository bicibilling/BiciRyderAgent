/**
 * Health Monitor Service
 * Comprehensive health checking and monitoring for BICI AI Voice Agent
 */

import { createClient } from '@supabase/supabase-js';
import Redis from '@upstash/redis';
import { logger } from '../config/logger.js';
import fetch from 'node-fetch';

class HealthMonitor {
  constructor() {
    this.logger = logger.child({ component: 'health-monitor' });
    this.checks = new Map();
    this.metrics = new Map();
    this.lastHealthCheck = null;
    
    this.setupHealthChecks();
    this.startMonitoring();
  }

  /**
   * Setup all health check functions
   */
  setupHealthChecks() {
    this.checks.set('database', this.checkDatabase.bind(this));
    this.checks.set('redis', this.checkRedis.bind(this));
    this.checks.set('elevenlabs', this.checkElevenLabs.bind(this));
    this.checks.set('twilio', this.checkTwilio.bind(this));
    this.checks.set('shopify', this.checkShopify.bind(this));
    this.checks.set('hubspot', this.checkHubSpot.bind(this));
    this.checks.set('google', this.checkGoogleCalendar.bind(this));
    this.checks.set('memory', this.checkMemoryUsage.bind(this));
    this.checks.set('disk', this.checkDiskSpace.bind(this));
    this.checks.set('network', this.checkNetworkConnectivity.bind(this));
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring() {
    // Run health checks every 30 seconds
    setInterval(() => {
      this.runHealthChecks();
    }, 30000);

    // Collect metrics every 60 seconds
    setInterval(() => {
      this.collectMetrics();
    }, 60000);

    // Run initial health check
    this.runHealthChecks();
  }

  /**
   * Run comprehensive health checks
   */
  async runHealthChecks() {
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
      summary: {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0
      },
      responseTime: 0
    };

    try {
      // Run all health checks in parallel
      const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
        try {
          const checkResult = await Promise.race([
            checkFn(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), 
                process.env.HEALTH_CHECK_TIMEOUT || 10000)
            )
          ]);

          results.checks[name] = {
            status: checkResult.status,
            message: checkResult.message,
            responseTime: checkResult.responseTime,
            details: checkResult.details || {},
            timestamp: new Date().toISOString()
          };

          // Update summary
          results.summary.total++;
          if (checkResult.status === 'healthy') {
            results.summary.healthy++;
          } else if (checkResult.status === 'warning') {
            results.summary.warning++;
          } else {
            results.summary.critical++;
          }

        } catch (error) {
          results.checks[name] = {
            status: 'critical',
            message: error.message,
            responseTime: 0,
            details: { error: error.stack },
            timestamp: new Date().toISOString()
          };
          results.summary.total++;
          results.summary.critical++;
        }
      });

      await Promise.all(checkPromises);

      // Determine overall status
      if (results.summary.critical > 0) {
        results.status = 'critical';
      } else if (results.summary.warning > 0) {
        results.status = 'warning';
      } else {
        results.status = 'healthy';
      }

      results.responseTime = Date.now() - startTime;
      this.lastHealthCheck = results;

      // Log health status
      this.logger.info('Health check completed', {
        status: results.status,
        responseTime: results.responseTime,
        summary: results.summary
      });

      // Store results in cache if Redis is available
      if (results.checks.redis?.status === 'healthy') {
        try {
          const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL });
          await redis.set('health-check-results', JSON.stringify(results), { ex: 300 });
        } catch (error) {
          this.logger.warn('Failed to cache health results', { error: error.message });
        }
      }

    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      results.status = 'critical';
      results.checks.system = {
        status: 'critical',
        message: 'System health check failed',
        details: { error: error.message }
      };
    }

    return results;
  }

  /**
   * Check database connectivity and performance
   */
  async checkDatabase() {
    const startTime = Date.now();

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        status: 'warning',
        message: 'Database not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      // Test connection with a simple query
      const { data, error } = await supabase
        .from('conversations')
        .select('count', { count: 'exact', head: true });

      if (error) throw error;

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 1000 ? 'healthy' : 'warning',
        message: responseTime < 1000 ? 'Database responsive' : 'Database slow response',
        responseTime,
        details: {
          connectionTime: responseTime,
          recordCount: data || 0
        }
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Database connection failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Redis connectivity and performance
   */
  async checkRedis() {
    const startTime = Date.now();

    if (!process.env.UPSTASH_REDIS_URL) {
      return {
        status: 'warning',
        message: 'Redis not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL });
      
      // Test with ping
      await redis.ping();
      
      // Test with set/get
      const testKey = `health-check-${Date.now()}`;
      await redis.set(testKey, 'test', { ex: 60 });
      const result = await redis.get(testKey);
      await redis.del(testKey);

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 500 ? 'healthy' : 'warning',
        message: responseTime < 500 ? 'Redis responsive' : 'Redis slow response',
        responseTime,
        details: {
          connectionTime: responseTime,
          testSuccessful: result === 'test'
        }
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Redis connection failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check ElevenLabs API connectivity
   */
  async checkElevenLabs() {
    const startTime = Date.now();

    if (!process.env.ELEVENLABS_API_KEY) {
      return {
        status: 'warning',
        message: 'ElevenLabs not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: {
          'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`,
          'User-Agent': 'BICI-AI-Health-Check/1.0'
        },
        timeout: process.env.ELEVENLABS_TIMEOUT || 10000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          status: 'healthy',
          message: 'ElevenLabs API accessible',
          responseTime,
          details: {
            apiVersion: 'v1',
            charactersUsed: data.subscription?.character_count || 0,
            charactersLimit: data.subscription?.character_limit || 0
          }
        };
      } else {
        return {
          status: 'critical',
          message: `ElevenLabs API error: ${response.status}`,
          responseTime,
          details: { statusCode: response.status }
        };
      }

    } catch (error) {
      return {
        status: 'critical',
        message: `ElevenLabs API failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Twilio API connectivity
   */
  async checkTwilio() {
    const startTime = Date.now();

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return {
        status: 'warning',
        message: 'Twilio not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'BICI-AI-Health-Check/1.0'
        },
        timeout: process.env.TWILIO_TIMEOUT || 10000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          status: 'healthy',
          message: 'Twilio API accessible',
          responseTime,
          details: {
            accountStatus: data.status,
            accountType: data.type
          }
        };
      } else {
        return {
          status: 'critical',
          message: `Twilio API error: ${response.status}`,
          responseTime,
          details: { statusCode: response.status }
        };
      }

    } catch (error) {
      return {
        status: 'critical',
        message: `Twilio API failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Shopify API connectivity
   */
  async checkShopify() {
    const startTime = Date.now();

    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return {
        status: 'warning',
        message: 'Shopify not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const response = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'User-Agent': 'BICI-AI-Health-Check/1.0'
        },
        timeout: process.env.SHOPIFY_TIMEOUT || 10000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          status: 'healthy',
          message: 'Shopify API accessible',
          responseTime,
          details: {
            shopName: data.shop?.name,
            planName: data.shop?.plan_name
          }
        };
      } else {
        return {
          status: 'critical',
          message: `Shopify API error: ${response.status}`,
          responseTime,
          details: { statusCode: response.status }
        };
      }

    } catch (error) {
      return {
        status: 'critical',
        message: `Shopify API failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check HubSpot API connectivity
   */
  async checkHubSpot() {
    const startTime = Date.now();

    if (!process.env.HUBSPOT_ACCESS_TOKEN) {
      return {
        status: 'warning',
        message: 'HubSpot not configured',
        responseTime: Date.now() - startTime
      };
    }

    try {
      const response = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/current', {
        headers: {
          'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'User-Agent': 'BICI-AI-Health-Check/1.0'
        },
        timeout: process.env.HUBSPOT_TIMEOUT || 10000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          status: 'healthy',
          message: 'HubSpot API accessible',
          responseTime,
          details: {
            portalId: data.hub_id,
            expiresIn: data.expires_in
          }
        };
      } else {
        return {
          status: 'critical',
          message: `HubSpot API error: ${response.status}`,
          responseTime,
          details: { statusCode: response.status }
        };
      }

    } catch (error) {
      return {
        status: 'critical',
        message: `HubSpot API failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Google Calendar API connectivity
   */
  async checkGoogleCalendar() {
    const startTime = Date.now();

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return {
        status: 'warning',
        message: 'Google Calendar not configured',
        responseTime: Date.now() - startTime
      };
    }

    // For production, you'd check with actual OAuth tokens
    // For now, just verify the configuration is present
    return {
      status: 'healthy',
      message: 'Google Calendar configured',
      responseTime: Date.now() - startTime,
      details: {
        clientConfigured: true
      }
    };
  }

  /**
   * Check memory usage
   */
  async checkMemoryUsage() {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    const heapUsagePercent = (memUsageMB.heapUsed / memUsageMB.heapTotal) * 100;

    let status = 'healthy';
    let message = 'Memory usage normal';

    if (heapUsagePercent > 80) {
      status = 'critical';
      message = 'High memory usage detected';
    } else if (heapUsagePercent > 60) {
      status = 'warning';
      message = 'Elevated memory usage';
    }

    return {
      status,
      message,
      responseTime: Date.now() - startTime,
      details: {
        memoryUsageMB,
        heapUsagePercent: Math.round(heapUsagePercent)
      }
    };
  }

  /**
   * Check disk space (simplified for containerized environments)
   */
  async checkDiskSpace() {
    const startTime = Date.now();
    
    // In containerized environments, disk space is typically managed by the platform
    // This is a simplified check
    return {
      status: 'healthy',
      message: 'Disk space check not applicable in containerized environment',
      responseTime: Date.now() - startTime,
      details: {
        containerized: true
      }
    };
  }

  /**
   * Check network connectivity
   */
  async checkNetworkConnectivity() {
    const startTime = Date.now();

    try {
      // Test connectivity to a reliable external service
      const response = await fetch('https://httpbin.org/status/200', {
        timeout: 5000
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'warning',
        message: response.ok ? 'Network connectivity good' : 'Network connectivity issues',
        responseTime,
        details: {
          statusCode: response.status
        }
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Network connectivity failed: ${error.message}`,
        responseTime: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      application: {
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    this.metrics.set(Date.now(), metrics);

    // Keep only last 100 metric snapshots
    if (this.metrics.size > 100) {
      const oldestKey = Math.min(...this.metrics.keys());
      this.metrics.delete(oldestKey);
    }

    return metrics;
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return this.lastHealthCheck || {
      status: 'unknown',
      message: 'Health check not yet run',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get collected metrics
   */
  getMetrics() {
    return Array.from(this.metrics.values()).slice(-10); // Last 10 snapshots
  }

  /**
   * Get detailed health report
   */
  getDetailedReport() {
    return {
      health: this.getHealthStatus(),
      metrics: this.getMetrics(),
      configuration: {
        hasDatabase: !!process.env.SUPABASE_URL,
        hasRedis: !!process.env.UPSTASH_REDIS_URL,
        hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
        hasTwilio: !!process.env.TWILIO_ACCOUNT_SID,
        hasShopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
        hasHubSpot: !!process.env.HUBSPOT_ACCESS_TOKEN,
        hasGoogleCalendar: !!process.env.GOOGLE_CLIENT_ID
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        timezone: process.env.DEFAULT_TIMEZONE
      }
    };
  }
}

export default HealthMonitor;