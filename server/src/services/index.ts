import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger';

export function initializeServices(wss: WebSocketServer) {
  logger.info('Initializing services');
  
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