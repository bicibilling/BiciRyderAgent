import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger';
import { redisService } from './redis.service';

export function initializeServices(wss: WebSocketServer) {
  logger.info('Initializing services');
  
  // Initialize Redis service
  try {
    // Redis service initializes automatically in its constructor
    const status = redisService.getStatus();
    if (status.enabled) {
      logger.info('Redis service initialization attempted');
      if (status.connected) {
        logger.info('✅ Redis service ready');
      } else {
        logger.warn('⚠️  Redis service initialized but not connected');
      }
    } else {
      logger.info('📴 Redis service disabled');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize Redis service:', error);
  }
  
  // WebSocket connection handler
  wss.on('connection', (ws) => {
    logger.info('New WebSocket connection established');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        logger.debug('WebSocket message received:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          case 'subscribe':
            // Handle subscription to specific channels
            break;
          default:
            logger.warn('Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      logger.info('WebSocket connection closed');
    });
    
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  });
  
  logger.info('Services initialized');
}

// Export Redis service for use in other parts of the application
export { redisService } from './redis.service';