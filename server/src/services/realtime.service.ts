import { Response } from 'express';
import { logger } from '../utils/logger';

// Store SSE connections
const sseConnections = new Map<string, Response[]>();

export function setupSSEConnection(clientId: string, res: Response) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Store connection
  if (!sseConnections.has(clientId)) {
    sseConnections.set(clientId, []);
  }
  sseConnections.get(clientId)!.push(res);
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    clientId,
    timestamp: new Date().toISOString() 
  })}\n\n`);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);
  
  // Clean up on disconnect
  res.on('close', () => {
    clearInterval(keepAlive);
    const connections = sseConnections.get(clientId);
    if (connections) {
      const index = connections.indexOf(res);
      if (index > -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        sseConnections.delete(clientId);
      }
    }
    logger.info('SSE connection closed:', { clientId });
  });
  
  logger.info('SSE connection established:', { clientId });
}

export function broadcastToClients(data: any, targetClientId?: string) {
  const message = `data: ${JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  })}\n\n`;
  
  if (targetClientId) {
    // Send to specific client
    const connections = sseConnections.get(targetClientId);
    if (connections) {
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      });
    }
  } else {
    // Broadcast to all clients
    sseConnections.forEach((connections, clientId) => {
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      });
    });
  }
  
  logger.debug('Broadcasted event:', { 
    type: data.type, 
    targetClientId,
    connectionCount: sseConnections.size 
  });
}

export function getActiveConnections(): number {
  let total = 0;
  sseConnections.forEach(connections => {
    total += connections.length;
  });
  return total;
}