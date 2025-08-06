/**
 * Background Worker Service
 * Handles background jobs and maintenance tasks for BICI AI Voice Agent
 */

const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const fs = require('fs').promises;
const path = require('path');

// Simple logger for worker
const logger = {
  info: (msg, meta) => console.log('INFO:', msg, meta || ''),
  error: (msg, meta) => console.error('ERROR:', msg, meta || ''),
  warn: (msg, meta) => console.warn('WARN:', msg, meta || ''),
  child: (meta) => ({
    info: (msg, data) => console.log('INFO:', `[${meta.component}]`, msg, data || ''),
    error: (msg, data) => console.error('ERROR:', `[${meta.component}]`, msg, data || ''),
    warn: (msg, data) => console.warn('WARN:', `[${meta.component}]`, msg, data || '')
  })
};

class BiciAIWorker {
  constructor() {
    this.logger = logger.child({ component: 'worker' });
    this.isRunning = false;
    this.jobs = new Map();
    
    // Initialize connections
    this.initializeConnections();
    
    // Setup job handlers
    this.setupJobHandlers();
    
    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Initialize database and cache connections
   */
  async initializeConnections() {
    try {
      // Supabase connection
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        this.supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        );
        this.logger.info('Supabase connection initialized');
      }

      // Redis connection
      if (process.env.UPSTASH_REDIS_URL) {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_URL,
          retry: {
            retries: 3,
            backoff: (retryCount) => Math.pow(2, retryCount) * 1000
          }
        });
        this.logger.info('Redis connection initialized');
      }

    } catch (error) {
      this.logger.error('Failed to initialize connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup job handlers for different background tasks
   */
  setupJobHandlers() {
    this.jobs.set('cleanup-logs', this.cleanupLogs.bind(this));
    this.jobs.set('health-check-integrations', this.healthCheckIntegrations.bind(this));
    this.jobs.set('backup-conversations', this.backupConversations.bind(this));
    this.jobs.set('cleanup-temp-files', this.cleanupTempFiles.bind(this));
    this.jobs.set('update-analytics', this.updateAnalytics.bind(this));
    this.jobs.set('process-conversation-insights', this.processConversationInsights.bind(this));
  }

  /**
   * Start the worker service
   */
  async start() {
    try {
      this.isRunning = true;
      this.logger.info('BICI AI Worker started', {
        pid: process.pid,
        concurrency: process.env.WORKER_CONCURRENCY || 5
      });

      // Start job processing loop
      this.processJobs();

      // Schedule recurring tasks
      this.scheduleRecurringTasks();

    } catch (error) {
      this.logger.error('Failed to start worker', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Process jobs from the queue
   */
  async processJobs() {
    while (this.isRunning) {
      try {
        // Check for jobs in Redis queue
        if (this.redis) {
          const job = await this.redis.lpop(process.env.QUEUE_NAME || 'bici-ai-jobs');
          
          if (job) {
            await this.executeJob(JSON.parse(job));
          }
        }

        // Wait before checking for more jobs
        await this.sleep(5000);

      } catch (error) {
        this.logger.error('Error processing jobs', { error: error.message });
        await this.sleep(10000); // Wait longer on error
      }
    }
  }

  /**
   * Execute a specific job
   */
  async executeJob(job) {
    const { type, data, id } = job;
    
    this.logger.info('Executing job', { type, id });

    try {
      if (this.jobs.has(type)) {
        const handler = this.jobs.get(type);
        await handler(data);
        this.logger.info('Job completed', { type, id });
      } else {
        this.logger.warn('Unknown job type', { type, id });
      }
    } catch (error) {
      this.logger.error('Job execution failed', { 
        type, 
        id, 
        error: error.message 
      });
    }
  }

  /**
   * Schedule recurring maintenance tasks
   */
  scheduleRecurringTasks() {
    // Run cleanup tasks every hour
    setInterval(() => {
      this.enqueueJob('cleanup-temp-files', {});
    }, 60 * 60 * 1000);

    // Update analytics every 15 minutes
    setInterval(() => {
      this.enqueueJob('update-analytics', {});
    }, 15 * 60 * 1000);

    // Process conversation insights every 30 minutes
    setInterval(() => {
      this.enqueueJob('process-conversation-insights', {});
    }, 30 * 60 * 1000);
  }

  /**
   * Enqueue a new job
   */
  async enqueueJob(type, data) {
    if (!this.redis) return;

    const job = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      createdAt: new Date().toISOString()
    };

    await this.redis.rpush(process.env.QUEUE_NAME || 'bici-ai-jobs', JSON.stringify(job));
    this.logger.info('Job enqueued', { type, id: job.id });
  }

  /**
   * Job: Clean up old log files
   */
  async cleanupLogs(data) {
    try {
      const logsDir = path.join(__dirname, '../../logs');
      const files = await fs.readdir(logsDir).catch(() => []);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (data.retentionDays || 30));

      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath).catch(() => null);
        
        if (stats && stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      this.logger.info('Log cleanup completed', { cleanedCount });
    } catch (error) {
      this.logger.error('Log cleanup failed', { error: error.message });
    }
  }

  /**
   * Job: Health check all integrations
   */
  async healthCheckIntegrations(data) {
    const results = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Check Supabase
      if (this.supabase) {
        try {
          const { error } = await this.supabase.from('conversations').select('count', { count: 'exact', head: true });
          results.checks.supabase = { status: error ? 'error' : 'healthy', error: error?.message };
        } catch (error) {
          results.checks.supabase = { status: 'error', error: error.message };
        }
      }

      // Check Redis
      if (this.redis) {
        try {
          await this.redis.ping();
          results.checks.redis = { status: 'healthy' };
        } catch (error) {
          results.checks.redis = { status: 'error', error: error.message };
        }
      }

      // Check ElevenLabs API
      if (process.env.ELEVENLABS_API_KEY) {
        try {
          const response = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: {
              'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`
            }
          });
          results.checks.elevenlabs = { 
            status: response.ok ? 'healthy' : 'error',
            statusCode: response.status
          };
        } catch (error) {
          results.checks.elevenlabs = { status: 'error', error: error.message };
        }
      }

      // Store results in cache for monitoring
      if (this.redis) {
        await this.redis.set('health-check-results', JSON.stringify(results), { ex: 900 }); // 15 minutes
      }

      this.logger.info('Health check completed', results);
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
    }
  }

  /**
   * Job: Backup conversation data
   */
  async backupConversations(data) {
    if (!this.supabase) return;

    try {
      const { data: conversations, error } = await this.supabase
        .from('conversations')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Store backup in Redis or external storage
      const backupData = {
        timestamp: new Date().toISOString(),
        count: conversations.length,
        data: conversations
      };

      if (this.redis) {
        const backupKey = `backup:conversations:${new Date().toISOString().split('T')[0]}`;
        await this.redis.set(backupKey, JSON.stringify(backupData), { ex: 7 * 24 * 3600 }); // 7 days
      }

      this.logger.info('Conversation backup completed', { count: conversations.length });
    } catch (error) {
      this.logger.error('Conversation backup failed', { error: error.message });
    }
  }

  /**
   * Job: Clean up temporary files
   */
  async cleanupTempFiles(data) {
    try {
      const tempDirs = ['/tmp', '/var/tmp'];
      let cleanedCount = 0;

      for (const tempDir of tempDirs) {
        try {
          const files = await fs.readdir(tempDir);
          const biciFiles = files.filter(file => file.includes('bici-ai'));
          
          for (const file of biciFiles) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath).catch(() => null);
            
            if (stats && Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
              await fs.unlink(filePath);
              cleanedCount++;
            }
          }
        } catch (error) {
          // Directory might not exist or be accessible
        }
      }

      this.logger.info('Temp file cleanup completed', { cleanedCount });
    } catch (error) {
      this.logger.error('Temp file cleanup failed', { error: error.message });
    }
  }

  /**
   * Job: Update analytics data
   */
  async updateAnalytics(data) {
    if (!this.supabase || !this.redis) return;

    try {
      // Get conversation metrics
      const { data: metrics } = await this.supabase.rpc('get_conversation_metrics');
      
      if (metrics) {
        await this.redis.set('analytics:conversation-metrics', JSON.stringify({
          ...metrics,
          updatedAt: new Date().toISOString()
        }), { ex: 3600 }); // 1 hour
      }

      this.logger.info('Analytics update completed');
    } catch (error) {
      this.logger.error('Analytics update failed', { error: error.message });
    }
  }

  /**
   * Job: Process conversation insights
   */
  async processConversationInsights(data) {
    // This would integrate with AI services to analyze conversations
    // For now, just log that the job ran
    this.logger.info('Conversation insights processing completed');
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down worker`);
      this.isRunning = false;
      
      // Allow current jobs to complete
      await this.sleep(5000);
      
      this.logger.info('Worker shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new BiciAIWorker();
  worker.start();
}

module.exports = BiciAIWorker;