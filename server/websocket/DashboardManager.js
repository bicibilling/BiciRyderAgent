const { logger } = require('../utils/logger');
const { ElevenLabsWebSocketManager } = require('./ElevenLabsManager');

class DashboardWebSocketManager {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.clientConnections = new Map(); // sessionId -> connection info
    this.activeConversations = new Map(); // conversationId -> ElevenLabs connection
    this.subscribedClients = new Map(); // conversationId -> Set of sessionIds
    
    logger.info('Dashboard WebSocket Manager initialized', { organizationId });
  }
  
  /**
   * Handle new dashboard client connection
   */
  handleDashboardConnection(ws, sessionId, userInfo) {
    // Store connection info
    const connectionInfo = {
      ws,
      sessionId,
      userId: userInfo.userId,
      organizationId: this.organizationId,
      connectedAt: userInfo.connectedAt,
      subscribedConversations: new Set(),
      lastActivity: new Date()
    };
    
    this.clientConnections.set(sessionId, connectionInfo);
    
    // Send connection confirmation
    this.sendToClient(sessionId, {
      type: 'dashboard_connected',
      sessionId,
      organizationId: this.organizationId,
      timestamp: new Date().toISOString()
    });
    
    // Send current dashboard state
    this.sendDashboardState(sessionId);
    
    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleDashboardMessage(sessionId, data);
        
        // Update last activity
        connectionInfo.lastActivity = new Date();
      } catch (error) {
        logger.error('Failed to parse dashboard message', {
          sessionId,
          error: error.message
        });
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      this.handleClientDisconnection(sessionId);
    });
    
    ws.on('error', (error) => {
      logger.error('Dashboard WebSocket error', {
        sessionId,
        organizationId: this.organizationId,
        error: error.message
      });
      this.handleClientDisconnection(sessionId);
    });
    
    logger.info('Dashboard client connected', {
      sessionId,
      organizationId: this.organizationId,
      userId: userInfo.userId
    });
  }
  
  /**
   * Handle messages from dashboard clients
   */
  handleDashboardMessage(sessionId, data) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection) return;
    
    logger.debug('Dashboard message received', {
      sessionId,
      type: data.type,
      organizationId: this.organizationId
    });
    
    switch (data.type) {
      case 'subscribe_conversation':
        this.handleSubscribeConversation(sessionId, data.conversationId);
        break;
        
      case 'unsubscribe_conversation':
        this.handleUnsubscribeConversation(sessionId, data.conversationId);
        break;
        
      case 'send_human_message':
        this.handleHumanMessage(sessionId, data);
        break;
        
      case 'takeover_conversation':
        this.handleTakeoverConversation(sessionId, data);
        break;
        
      case 'release_conversation':
        this.handleReleaseConversation(sessionId, data);
        break;
        
      case 'get_conversation_history':
        this.handleGetConversationHistory(sessionId, data.conversationId);
        break;
        
      case 'update_conversation_notes':
        this.handleUpdateConversationNotes(sessionId, data);
        break;
        
      case 'ping':
        this.sendToClient(sessionId, { type: 'pong', timestamp: new Date().toISOString() });
        break;
        
      default:
        logger.warn('Unknown dashboard message type', {
          sessionId,
          type: data.type
        });
    }
  }
  
  /**
   * Subscribe client to conversation updates
   */
  handleSubscribeConversation(sessionId, conversationId) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection) return;
    
    // Add to client's subscriptions
    connection.subscribedConversations.add(conversationId);
    
    // Add to conversation's subscribers
    if (!this.subscribedClients.has(conversationId)) {
      this.subscribedClients.set(conversationId, new Set());
    }
    this.subscribedClients.get(conversationId).add(sessionId);
    
    // Send current conversation state
    this.sendConversationState(sessionId, conversationId);
    
    logger.debug('Client subscribed to conversation', {
      sessionId,
      conversationId,
      organizationId: this.organizationId
    });
  }
  
  /**
   * Unsubscribe client from conversation updates
   */
  handleUnsubscribeConversation(sessionId, conversationId) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection) return;
    
    // Remove from client's subscriptions
    connection.subscribedConversations.delete(conversationId);
    
    // Remove from conversation's subscribers
    const subscribers = this.subscribedClients.get(conversationId);
    if (subscribers) {
      subscribers.delete(sessionId);
      if (subscribers.size === 0) {
        this.subscribedClients.delete(conversationId);
      }
    }
    
    logger.debug('Client unsubscribed from conversation', {
      sessionId,
      conversationId,
      organizationId: this.organizationId
    });
  }
  
  /**
   * Handle human agent message
   */
  async handleHumanMessage(sessionId, data) {
    const { conversationId, message, messageType = 'text' } = data;
    
    try {
      // Get ElevenLabs connection
      const elevenlabsConnection = this.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        throw new Error('No active ElevenLabs connection for conversation');
      }
      
      // Send message through ElevenLabs connection
      if (messageType === 'text') {
        await elevenlabsConnection.sendUserMessage(message);
      } else if (messageType === 'contextual_update') {
        await elevenlabsConnection.sendContextualUpdate(message);
      }
      
      // Broadcast to subscribed clients
      this.broadcastToConversationSubscribers(conversationId, {
        type: 'human_message_sent',
        conversationId,
        message,
        messageType,
        sentBy: sessionId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Human message sent', {
        sessionId,
        conversationId,
        messageType,
        organizationId: this.organizationId
      });
      
    } catch (error) {
      logger.error('Failed to send human message', {
        sessionId,
        conversationId,
        error: error.message
      });
      
      this.sendToClient(sessionId, {
        type: 'error',
        message: 'Failed to send message',
        error: error.message
      });
    }
  }
  
  /**
   * Handle conversation takeover by human agent
   */
  async handleTakeoverConversation(sessionId, data) {
    const { conversationId, agentName } = data;
    
    try {
      // Get ElevenLabs connection
      const elevenlabsConnection = this.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        throw new Error('No active ElevenLabs connection for conversation');
      }
      
      // Mark conversation as taken over
      await elevenlabsConnection.enableHumanTakeover(agentName);
      
      // Broadcast takeover to all subscribers
      this.broadcastToConversationSubscribers(conversationId, {
        type: 'conversation_takeover',
        conversationId,
        agentName,
        takenOverBy: sessionId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Conversation taken over by human agent', {
        sessionId,
        conversationId,
        agentName,
        organizationId: this.organizationId
      });
      
    } catch (error) {
      logger.error('Failed to takeover conversation', {
        sessionId,
        conversationId,
        error: error.message
      });
      
      this.sendToClient(sessionId, {
        type: 'error',
        message: 'Failed to takeover conversation',
        error: error.message
      });
    }
  }
  
  /**
   * Handle conversation release back to AI
   */
  async handleReleaseConversation(sessionId, data) {
    const { conversationId } = data;
    
    try {
      // Get ElevenLabs connection
      const elevenlabsConnection = this.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        throw new Error('No active ElevenLabs connection for conversation');
      }
      
      // Release back to AI
      await elevenlabsConnection.releaseToAI();
      
      // Broadcast release to all subscribers
      this.broadcastToConversationSubscribers(conversationId, {
        type: 'conversation_released',
        conversationId,
        releasedBy: sessionId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Conversation released back to AI', {
        sessionId,
        conversationId,
        organizationId: this.organizationId
      });
      
    } catch (error) {
      logger.error('Failed to release conversation', {
        sessionId,
        conversationId,
        error: error.message
      });
      
      this.sendToClient(sessionId, {
        type: 'error',
        message: 'Failed to release conversation',
        error: error.message
      });
    }
  }
  
  /**
   * Create new conversation WebSocket connection
   */
  async createConversationWebSocket(leadId, customerPhone, conversationConfig) {
    try {
      const elevenlabsManager = new ElevenLabsWebSocketManager(
        this.organizationId,
        leadId,
        conversationConfig
      );
      
      // Set up event forwarding to dashboard clients
      elevenlabsManager.onEvent('*', (eventData) => {
        this.handleElevenLabsEvent(leadId, eventData);
      });
      
      // Connect to ElevenLabs
      await elevenlabsManager.connect();
      
      // Store connection
      this.activeConversations.set(leadId, elevenlabsManager);
      
      // Broadcast new conversation to all clients
      this.broadcastToAllClients({
        type: 'new_conversation',
        conversationId: leadId,
        customerPhone,
        organizationId: this.organizationId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('New conversation WebSocket created', {
        leadId,
        customerPhone,
        organizationId: this.organizationId
      });
      
      return elevenlabsManager;
      
    } catch (error) {
      logger.error('Failed to create conversation WebSocket', {
        leadId,
        customerPhone,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Handle events from ElevenLabs WebSocket
   */
  handleElevenLabsEvent(conversationId, eventData) {
    // Forward event to subscribed dashboard clients
    this.broadcastToConversationSubscribers(conversationId, {
      type: 'conversation_event',
      conversationId,
      eventData,
      organizationId: this.organizationId,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send message to specific client
   */
  sendToClient(sessionId, data) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection || connection.ws.readyState !== connection.ws.OPEN) {
      return false;
    }
    
    try {
      connection.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', {
        sessionId,
        error: error.message
      });
      this.handleClientDisconnection(sessionId);
      return false;
    }
  }
  
  /**
   * Broadcast message to all connected clients
   */
  broadcastToAllClients(data) {
    let successCount = 0;
    let failureCount = 0;
    
    this.clientConnections.forEach((connection, sessionId) => {
      if (this.sendToClient(sessionId, data)) {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    logger.debug('Broadcast to all clients', {
      successCount,
      failureCount,
      organizationId: this.organizationId
    });
  }
  
  /**
   * Broadcast message to subscribers of a specific conversation
   */
  broadcastToConversationSubscribers(conversationId, data) {
    const subscribers = this.subscribedClients.get(conversationId);
    if (!subscribers) return;
    
    let successCount = 0;
    let failureCount = 0;
    
    subscribers.forEach(sessionId => {
      if (this.sendToClient(sessionId, data)) {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    logger.debug('Broadcast to conversation subscribers', {
      conversationId,
      successCount,
      failureCount,
      organizationId: this.organizationId
    });
  }
  
  /**
   * Send current dashboard state to client
   */
  sendDashboardState(sessionId) {
    const dashboardState = {
      type: 'dashboard_state',
      organizationId: this.organizationId,
      activeConversations: Array.from(this.activeConversations.keys()),
      connectionCount: this.clientConnections.size,
      timestamp: new Date().toISOString()
    };
    
    this.sendToClient(sessionId, dashboardState);
  }
  
  /**
   * Send conversation state to client
   */
  async sendConversationState(sessionId, conversationId) {
    try {
      const elevenlabsConnection = this.activeConversations.get(conversationId);
      if (!elevenlabsConnection) {
        this.sendToClient(sessionId, {
          type: 'conversation_not_found',
          conversationId
        });
        return;
      }
      
      const conversationState = await elevenlabsConnection.getConversationState();
      
      this.sendToClient(sessionId, {
        type: 'conversation_state',
        conversationId,
        state: conversationState,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to send conversation state', {
        sessionId,
        conversationId,
        error: error.message
      });
    }
  }
  
  /**
   * Handle client disconnection
   */
  handleClientDisconnection(sessionId) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection) return;
    
    // Remove from all conversation subscriptions
    connection.subscribedConversations.forEach(conversationId => {
      this.handleUnsubscribeConversation(sessionId, conversationId);
    });
    
    // Remove connection
    this.clientConnections.delete(sessionId);
    
    logger.info('Dashboard client disconnected', {
      sessionId,
      organizationId: this.organizationId
    });
  }
  
  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections() {
    const now = new Date();
    const inactiveTimeout = 30 * 60 * 1000; // 30 minutes
    
    const inactiveConnections = [];
    
    this.clientConnections.forEach((connection, sessionId) => {
      const timeSinceActivity = now - connection.lastActivity;
      if (timeSinceActivity > inactiveTimeout) {
        inactiveConnections.push(sessionId);
      }
    });
    
    inactiveConnections.forEach(sessionId => {
      logger.info('Cleaning up inactive connection', { sessionId });
      this.handleClientDisconnection(sessionId);
    });
    
    if (inactiveConnections.length > 0) {
      logger.info('Cleaned up inactive connections', {
        count: inactiveConnections.length,
        organizationId: this.organizationId
      });
    }
  }
  
  /**
   * Close all connections
   */
  closeAllConnections() {
    this.clientConnections.forEach((connection, sessionId) => {
      connection.ws.close(1000, 'Server shutdown');
    });
    
    this.activeConversations.forEach((connection, conversationId) => {
      connection.disconnect();
    });
    
    this.clientConnections.clear();
    this.activeConversations.clear();
    this.subscribedClients.clear();
    
    logger.info('All connections closed', {
      organizationId: this.organizationId
    });
  }
  
  /**
   * Get connection count
   */
  getConnectionCount() {
    return this.clientConnections.size;
  }
}

module.exports = { DashboardWebSocketManager };