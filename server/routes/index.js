const express = require('express');
const { AuthMiddleware } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { requestLogger } = require('../utils/logger');

function setupRoutes(managers, conversationStateManager) {
  const router = express.Router();
  
  // Add request logging
  router.use(requestLogger);
  
  // Auth routes
  router.use('/auth', require('./auth'));
  
  // Dashboard routes (require authentication)
  router.use('/dashboard', AuthMiddleware.verifyToken, require('./dashboard')(managers, conversationStateManager));
  
  // Conversation routes (require authentication)
  router.use('/conversations', AuthMiddleware.verifyToken, require('./conversations')(managers, conversationStateManager));
  
  // Analytics routes (require authentication)
  router.use('/analytics', AuthMiddleware.verifyToken, require('./analytics')(conversationStateManager));
  
  // Webhooks (no authentication required)
  router.use('/webhooks', require('./webhooks')(managers, conversationStateManager));
  
  // System routes
  router.use('/system', require('./system')(managers, conversationStateManager));
  
  return router;
}

module.exports = { setupRoutes };