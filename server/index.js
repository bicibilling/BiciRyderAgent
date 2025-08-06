const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createServer } = require('http');
const cron = require('node-cron');

// Import modules
const { DashboardWebSocketManager } = require('./websocket/DashboardManager');
const { ElevenLabsWebSocketManager } = require('./websocket/ElevenLabsManager');
const { ConversationStateManager } = require('./redis/ConversationState');
const { AuthMiddleware } = require('./middleware/auth');
const { setupRoutes } = require('./routes');
const { logger } = require('./utils/logger');

// Load environment variables
require('dotenv').config();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws://localhost:8080", "wss://localhost:8080"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize WebSocket managers
const managers = new Map(); // organizationId -> DashboardWebSocketManager
const conversationStateManager = new ConversationStateManager();

// WebSocket Server Setup
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  verifyClient: (info) => {
    try {
      // Extract token from query or headers
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || 
                   info.req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }
      
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      info.req.user = decoded;
      info.req.organizationId = decoded.organizationId;
      
      return true;
    } catch (error) {
      logger.warn('WebSocket connection rejected: Invalid token', { error: error.message });
      return false;
    }
  }
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const sessionId = uuidv4();
  const organizationId = req.organizationId;
  const userId = req.user.id;
  
  logger.info('New WebSocket connection established', {
    sessionId,
    organizationId,
    userId
  });
  
  // Get or create dashboard manager for organization
  if (!managers.has(organizationId)) {
    managers.set(organizationId, new DashboardWebSocketManager(organizationId));
  }
  
  const dashboardManager = managers.get(organizationId);
  
  // Handle the connection
  dashboardManager.handleDashboardConnection(ws, sessionId, {
    userId,
    organizationId,
    connectedAt: new Date()
  });
  
  // Connection cleanup
  ws.on('close', () => {
    logger.info('WebSocket connection closed', { sessionId, organizationId });
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error', { sessionId, organizationId, error: error.message });
  });
});

// API Routes
app.use('/api', setupRoutes(managers, conversationStateManager));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeConnections: Array.from(managers.keys()).map(orgId => ({
      organizationId: orgId,
      connections: managers.get(orgId).getConnectionCount()
    }))
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Periodic cleanup task
cron.schedule('*/30 * * * *', () => {
  logger.info('Running periodic cleanup');
  
  // Clean up inactive connections
  managers.forEach((manager, orgId) => {
    manager.cleanupInactiveConnections();
  });
  
  // Clean up Redis expired sessions
  conversationStateManager.cleanupExpiredSessions();
});

// Start server
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

server.listen(PORT, () => {
  logger.info(`BICI WebSocket Dashboard Server started`, {
    port: PORT,
    wsPort: WS_PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close all WebSocket connections
  managers.forEach((manager) => {
    manager.closeAllConnections();
  });
  
  server.close(() => {
    logger.info('Server shut down complete');
    process.exit(0);
  });
});

module.exports = { app, server, wss };