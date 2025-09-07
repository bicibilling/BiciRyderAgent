import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { logger } from './utils/logger';
import { setupWebhooks } from './webhooks';
import { setupAPIRoutes } from './routes';
import { initializeServices } from './services';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

// Create Express app
const app: Express = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? '*'  // Allow all origins in production for now
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'BICI Voice Agent API'
  });
});

// API test endpoint
app.get('/api/test', (req: Request, res: Response) => {
  res.json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    organization: req.headers['x-organization-id']
  });
});

// Database health check
app.get('/health/db', async (req: Request, res: Response) => {
  const healthResults: any = {
    timestamp: new Date().toISOString()
  };

  // Check Supabase connection
  try {
    const supabaseModule = await import('./config/supabase.config');
    const { data, error } = await supabaseModule.supabase
      .from('organizations')
      .select('id, name, phone_number')
      .limit(5);
    
    if (error) throw error;
    
    healthResults.database = {
      status: 'connected',
      organizations_count: data?.length || 0,
      organizations: data
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    healthResults.database = {
      status: 'disconnected',
      error: (error as Error).message
    };
  }

  // Check Redis connection
  try {
    const { redisHealthCheck } = await import('./config/redis.config');
    const redisHealth = await redisHealthCheck();
    healthResults.redis = redisHealth;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    healthResults.redis = {
      status: 'error',
      error: (error as Error).message
    };
  }

  // Determine overall status
  const dbHealthy = healthResults.database?.status === 'connected';
  const redisHealthy = healthResults.redis?.status === 'healthy' || healthResults.redis?.status === 'disabled';
  
  const overallStatus = dbHealthy && redisHealthy ? 'healthy' : 'unhealthy';
  const statusCode = overallStatus === 'healthy' ? 200 : 500;

  res.status(statusCode).json({
    status: overallStatus,
    ...healthResults
  });
});

// Initialize services
initializeServices(wss);

// Setup routes
setupWebhooks(app);
setupAPIRoutes(app);

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  logger.info(`🚴 BICI Voice Agent Server running on port ${PORT}`);
  logger.info(`📞 ElevenLabs Agent ID: ${process.env.ELEVENLABS_AGENT_ID}`);
  logger.info(`📱 Twilio Phone: ${process.env.TWILIO_PHONE_NUMBER}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔄 Server restarted at: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  // Close Redis connection
  try {
    const { closeRedisConnection } = await import('./config/redis.config');
    await closeRedisConnection();
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle SIGINT for development (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  
  // Close Redis connection
  try {
    const { closeRedisConnection } = await import('./config/redis.config');
    await closeRedisConnection();
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, wss };