/**
 * WebSocket Manager
 * Handles real-time communication for dashboard and conversation management
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { EventEmitter } = require('events');

class WebSocketManager extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.wss = null;
    this.connections = new Map(); // connectionId -> { ws, user, subscriptions }
    this.organizationConnections = new Map(); // organizationId -> Set of connectionIds
    this.conversationSubscriptions = new Map(); // conversationId -> Set of connectionIds
    this.agentConnections = new Map(); // agentId -> connectionId
    this.heartbeatInterval = null;
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      messagesReceived: 0
    };
  }
  
  /**
   * Initialize WebSocket server
   */
  initialize() {
    this.wss = new WebSocketServer({
      server: this.server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });
    
    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
    
    console.log('🔌 WebSocket server initialized on /ws');
  }
  
  /**
   * Verify client connection with JWT token
   */
  verifyClient(info) {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('❌ WebSocket connection rejected: No token provided');
        return false;
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'bici-ai-system',
        audience: 'bici-dashboard'
      });
      
      // Store user info for connection handler
      info.req.user = decoded;
      return true;
      
    } catch (error) {
      console.log('❌ WebSocket connection rejected:', error.message);
      return false;
    }
  }
  
  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const connectionId = this.generateConnectionId();
    const user = req.user;
    
    // Store connection
    const connection = {
      id: connectionId,
      ws,
      user,
      subscriptions: new Set(),
      connectedAt: new Date().toISOString(),
      lastPing: Date.now(),
      isAlive: true
    };
    
    this.connections.set(connectionId, connection);
    this.updateOrganizationConnections(user.organizationId, connectionId, 'add');
    
    // Update metrics
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    
    console.log(`🔌 WebSocket connected: ${connectionId} (User: ${user.email}, Org: ${user.organizationId})`);
    
    // Set up event handlers
    this.setupConnectionHandlers(ws, connection);
    
    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'connection_established',
      connectionId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      },
      timestamp: new Date().toISOString()
    });
    
    // Send initial dashboard state
    this.sendInitialDashboardState(connectionId);
  }
  
  /**
   * Setup event handlers for connection
   */
  setupConnectionHandlers(ws, connection) {
    const { id: connectionId } = connection;
    
    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.metrics.messagesReceived++;
        this.handleMessage(connectionId, message);
      } catch (error) {
        console.error(`❌ Invalid message from ${connectionId}:`, error.message);
        this.sendError(connectionId, 'INVALID_MESSAGE', 'Invalid JSON message format');
      }
    });
    
    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.lastPing = Date.now();
        conn.isAlive = true;
      }
    });
    
    // Handle connection close
    ws.on('close', (code, reason) => {
      this.handleDisconnection(connectionId, code, reason);
    });
    
    // Handle connection errors
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for ${connectionId}:`, error.message);
      this.handleDisconnection(connectionId, 1006, 'Connection error');
    });
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { type, data } = message;
    
    switch (type) {
      case 'ping':
        this.sendToConnection(connectionId, { type: 'pong', timestamp: new Date().toISOString() });
        break;
        
      case 'subscribe_conversation':
        this.subscribeToConversation(connectionId, data.conversationId);
        break;
        
      case 'unsubscribe_conversation':
        this.unsubscribeFromConversation(connectionId, data.conversationId);
        break;
        
      case 'subscribe_dashboard':
        this.subscribeToDashboard(connectionId);
        break;
        
      case 'send_chat_message':
        this.handleChatMessage(connectionId, data);
        break;
        
      case 'agent_status_update':
        this.handleAgentStatusUpdate(connectionId, data);
        break;
        
      case 'take_conversation':
        this.handleTakeConversation(connectionId, data);
        break;
        
      case 'release_conversation':
        this.handleReleaseConversation(connectionId, data);
        break;
        
      default:
        console.warn(`Unknown message type: ${type} from ${connectionId}`);
        this.sendError(connectionId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${type}`);
    }
  }
  
  /**
   * Handle conversation subscription
   */
  subscribeToConversation(connectionId, conversationId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Add to subscriptions
    connection.subscriptions.add(`conversation:${conversationId}`);
    
    // Add to conversation subscribers
    if (!this.conversationSubscriptions.has(conversationId)) {
      this.conversationSubscriptions.set(conversationId, new Set());
    }
    this.conversationSubscriptions.get(conversationId).add(connectionId);
    
    this.sendToConnection(connectionId, {
      type: 'subscription_confirmed',
      subscription: 'conversation',
      conversationId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📡 ${connectionId} subscribed to conversation ${conversationId}`);
  }
  
  /**
   * Handle conversation unsubscription
   */
  unsubscribeFromConversation(connectionId, conversationId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Remove from subscriptions
    connection.subscriptions.delete(`conversation:${conversationId}`);
    
    // Remove from conversation subscribers
    const subscribers = this.conversationSubscriptions.get(conversationId);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.conversationSubscriptions.delete(conversationId);
      }
    }
    
    this.sendToConnection(connectionId, {
      type: 'unsubscription_confirmed',
      subscription: 'conversation',
      conversationId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📡 ${connectionId} unsubscribed from conversation ${conversationId}`);
  }
  
  /**
   * Handle dashboard subscription
   */
  subscribeToDashboard(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    connection.subscriptions.add('dashboard');
    
    this.sendToConnection(connectionId, {
      type: 'subscription_confirmed',
      subscription: 'dashboard',
      timestamp: new Date().toISOString()
    });
    
    // Send current dashboard state
    this.sendDashboardUpdate(connectionId);
  }
  
  /**
   * Handle chat message from agent
   */
  handleChatMessage(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { conversationId, message, messageType = 'text' } = data;
    
    // Emit event for external processing (ElevenLabs integration)
    this.emit('chat_message', {
      conversationId,
      message,
      messageType,
      agentId: connection.user.id,
      agentEmail: connection.user.email,
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to conversation subscribers
    this.broadcastToConversation(conversationId, {
      type: 'agent_message_sent',
      conversationId,
      message,
      messageType,
      agentId: connection.user.id,
      agentName: connection.user.email,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle agent status update
   */
  handleAgentStatusUpdate(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { status, currentConversation } = data;
    
    // Store agent connection for status tracking
    this.agentConnections.set(connection.user.id, connectionId);
    
    // Broadcast to organization
    this.broadcastToOrganization(connection.user.organizationId, {
      type: 'agent_status_updated',
      agentId: connection.user.id,
      agentEmail: connection.user.email,
      status,
      currentConversation,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle conversation takeover
   */
  handleTakeConversation(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { conversationId, reason } = data;
    
    // Emit event for external processing
    this.emit('conversation_takeover', {
      conversationId,
      agentId: connection.user.id,
      agentEmail: connection.user.email,
      reason: reason || 'manual_takeover',
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to conversation subscribers
    this.broadcastToConversation(conversationId, {
      type: 'conversation_taken_over',
      conversationId,
      agentId: connection.user.id,
      agentName: connection.user.email,
      reason,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle conversation release
   */
  handleReleaseConversation(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { conversationId, summary } = data;
    
    // Emit event for external processing
    this.emit('conversation_release', {
      conversationId,
      agentId: connection.user.id,
      agentEmail: connection.user.email,
      summary: summary || 'Conversation released to AI',
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to conversation subscribers
    this.broadcastToConversation(conversationId, {
      type: 'conversation_released',
      conversationId,
      agentId: connection.user.id,
      agentName: connection.user.email,
      summary,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle connection disconnection
   */
  handleDisconnection(connectionId, code, reason) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    const { user } = connection;
    
    // Clean up subscriptions
    connection.subscriptions.forEach(subscription => {
      if (subscription.startsWith('conversation:')) {
        const conversationId = subscription.replace('conversation:', '');
        this.unsubscribeFromConversation(connectionId, conversationId);
      }
    });
    
    // Remove from organization connections
    this.updateOrganizationConnections(user.organizationId, connectionId, 'remove');
    
    // Remove agent connection
    if (this.agentConnections.get(user.id) === connectionId) {
      this.agentConnections.delete(user.id);
      
      // Broadcast agent offline status
      this.broadcastToOrganization(user.organizationId, {
        type: 'agent_status_updated',
        agentId: user.id,
        agentEmail: user.email,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    }
    
    // Remove connection
    this.connections.delete(connectionId);
    this.metrics.activeConnections--;
    
    console.log(`🔌 WebSocket disconnected: ${connectionId} (Code: ${code}, Reason: ${reason})`);
  }
  
  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== 1) return false;
    
    try {
      connection.ws.send(JSON.stringify(message));
      this.metrics.messagesSent++;
      return true;
    } catch (error) {
      console.error(`❌ Failed to send message to ${connectionId}:`, error.message);
      return false;
    }
  }
  
  /**
   * Send error message to connection
   */
  sendError(connectionId, code, message) {
    this.sendToConnection(connectionId, {
      type: 'error',
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Broadcast message to conversation subscribers
   */
  broadcastToConversation(conversationId, message) {
    const subscribers = this.conversationSubscriptions.get(conversationId);
    if (!subscribers) return 0;
    
    let sentCount = 0;
    subscribers.forEach(connectionId => {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    });
    
    return sentCount;
  }
  
  /**
   * Broadcast message to organization connections
   */
  broadcastToOrganization(organizationId, message) {
    const connections = this.organizationConnections.get(organizationId);
    if (!connections) return 0;
    
    let sentCount = 0;
    connections.forEach(connectionId => {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    });
    
    return sentCount;
  }
  
  /**
   * Broadcast to all dashboard subscribers
   */
  broadcastToDashboard(message, organizationId = null) {
    let sentCount = 0;
    
    this.connections.forEach((connection, connectionId) => {
      if (!connection.subscriptions.has('dashboard')) return;
      if (organizationId && connection.user.organizationId !== organizationId) return;
      
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    });
    
    return sentCount;
  }
  
  /**
   * Send initial dashboard state to connection
   */
  sendInitialDashboardState(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Mock initial state - in production, fetch from services
    const initialState = {
      type: 'dashboard_state',
      data: {
        activeConversations: 3,
        connectedAgents: this.getConnectedAgentsCount(connection.user.organizationId),
        systemStatus: 'healthy',
        recentActivities: []
      },
      timestamp: new Date().toISOString()
    };
    
    this.sendToConnection(connectionId, initialState);
  }
  
  /**
   * Send dashboard update
   */
  sendDashboardUpdate(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Mock dashboard update
    const update = {
      type: 'dashboard_update',
      data: {
        activeConversations: 3,
        connectedAgents: this.getConnectedAgentsCount(connection.user.organizationId),
        lastUpdate: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
    
    this.sendToConnection(connectionId, update);
  }
  
  /**
   * Update organization connections map
   */
  updateOrganizationConnections(organizationId, connectionId, action) {
    if (!this.organizationConnections.has(organizationId)) {
      this.organizationConnections.set(organizationId, new Set());
    }
    
    const connections = this.organizationConnections.get(organizationId);
    
    if (action === 'add') {
      connections.add(connectionId);
    } else if (action === 'remove') {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.organizationConnections.delete(organizationId);
      }
    }
  }
  
  /**
   * Get connected agents count for organization
   */
  getConnectedAgentsCount(organizationId) {
    const connections = this.organizationConnections.get(organizationId);
    return connections ? connections.size : 0;
  }
  
  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Start heartbeat to detect dead connections
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, connectionId) => {
        if (!connection.isAlive) {
          console.log(`💀 Terminating dead connection: ${connectionId}`);
          connection.ws.terminate();
          this.handleDisconnection(connectionId, 1006, 'Heartbeat timeout');
          return;
        }
        
        connection.isAlive = false;
        try {
          connection.ws.ping();
        } catch (error) {
          console.error(`❌ Ping failed for ${connectionId}:`, error.message);
          this.handleDisconnection(connectionId, 1006, 'Ping failed');
        }
      });
    }, 30000); // 30 seconds
  }
  
  /**
   * Get WebSocket metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      connectionsByOrganization: Array.from(this.organizationConnections.entries()).map(
        ([orgId, connections]) => ({
          organizationId: orgId,
          connections: connections.size
        })
      ),
      conversationSubscriptions: this.conversationSubscriptions.size,
      agentConnections: this.agentConnections.size
    };
  }
  
  /**
   * Close all connections
   */
  closeAll() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.connections.forEach((connection) => {
      try {
        connection.ws.close(1000, 'Server shutdown');
      } catch (error) {
        console.error('Error closing WebSocket connection:', error.message);
      }
    });
    
    this.connections.clear();
    this.organizationConnections.clear();
    this.conversationSubscriptions.clear();
    this.agentConnections.clear();
    
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('🔌 All WebSocket connections closed');
  }
}

module.exports = WebSocketManager;