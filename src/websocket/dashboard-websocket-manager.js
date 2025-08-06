/**
 * Dashboard WebSocket Manager
 * Manages multiple WebSocket connections for real-time dashboard updates
 */

import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { Redis } from '@upstash/redis';
import ElevenLabsWebSocket from './elevenlabs-websocket.js';

export class DashboardWebSocketManager extends EventEmitter {
  constructor(organizationId) {
    super();
    this.organizationId = organizationId;
    this.activeConnections = new Map(); // leadId -> ElevenLabs WebSocket
    this.elevenlabsConnections = new Map(); // conversationId -> ElevenLabs WS
    this.clientConnections = new Map(); // dashboardSessionId -> client WS
    this.redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });
    
    this.setupWebSocketServer();
    this.setupCleanupInterval();
  }

  /**
   * Set up WebSocket server for dashboard clients
   */
  setupWebSocketServer() {
    this.wss = new WebSocketServer({ 
      port: process.env.DASHBOARD_WS_PORT || 8080,
      perMessageDeflate: false 
    });
    
    this.wss.on('connection', (ws, req) => {
      this.handleNewDashboardConnection(ws, req);
    });
    
    console.log(`📊 Dashboard WebSocket server started on port ${process.env.DASHBOARD_WS_PORT || 8080}`);
  }

  /**
   * Handle new dashboard client connections
   */
  handleNewDashboardConnection(ws, req) {
    const sessionId = this.generateSessionId();
    
    try {
      // Extract and validate authentication token
      const token = this.extractTokenFromRequest(req);
      const userOrg = this.validateToken(token);
      
      if (userOrg !== this.organizationId) {
        ws.close(4003, 'Unauthorized organization');
        return;
      }
      
      // Store connection
      this.clientConnections.set(sessionId, {
        ws: ws,
        organizationId: userOrg,
        connectedAt: new Date(),
        subscribedLeads: new Set(),
        lastActivity: new Date()
      });
      
      console.log(`🔗 Dashboard client connected: ${sessionId}`);
      
      // Send initial connection confirmation
      this.sendToDashboardClient(sessionId, {
        type: 'dashboard_connected',
        sessionId: sessionId,
        organizationId: this.organizationId,
        timestamp: new Date().toISOString()
      });
      
      // Send current active conversations
      this.sendActiveConversationsList(sessionId);
      
      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleDashboardMessage(sessionId, data);
        } catch (error) {
          console.error('Failed to parse dashboard message:', error);
        }
      });
      
      // Handle client activity
      ws.on('pong', () => {
        const connection = this.clientConnections.get(sessionId);
        if (connection) {
          connection.lastActivity = new Date();
        }
      });
      
      // Cleanup on disconnect
      ws.on('close', () => {
        console.log(`🔌 Dashboard client disconnected: ${sessionId}`);
        this.clientConnections.delete(sessionId);
      });
      
      ws.on('error', (error) => {
        console.error(`Dashboard client error ${sessionId}:`, error);
        this.clientConnections.delete(sessionId);
      });
      
    } catch (error) {
      console.error('Error handling dashboard connection:', error);
      ws.close(4000, 'Connection setup failed');
    }
  }

  /**
   * Handle messages from dashboard clients
   */
  handleDashboardMessage(sessionId, data) {
    const connection = this.clientConnections.get(sessionId);
    if (!connection) return;
    
    connection.lastActivity = new Date();
    
    switch (data.type) {
      case 'subscribe_to_conversation':
        this.handleSubscribeToConversation(sessionId, data.conversationId);
        break;
        
      case 'unsubscribe_from_conversation':
        this.handleUnsubscribeFromConversation(sessionId, data.conversationId);
        break;
        
      case 'send_user_message':
        this.handleSendUserMessage(data.conversationId, data.message);
        break;
        
      case 'inject_context':
        this.handleInjectContext(data.conversationId, data.context);
        break;
        
      case 'request_conversation_history':
        this.handleRequestConversationHistory(sessionId, data.conversationId);
        break;
        
      case 'dashboard_ping':
        this.sendToDashboardClient(sessionId, { 
          type: 'dashboard_pong', 
          timestamp: new Date().toISOString() 
        });
        break;
        
      default:
        console.warn(`Unknown dashboard message type: ${data.type}`);
    }
  }

  /**
   * Create new conversation WebSocket connection
   */
  async createConversationWebSocket(leadId, customerPhone, callSid = null) {
    try {
      console.log(`📞 Creating conversation WebSocket for lead ${leadId}`);
      
      // Get lead data and build agent config
      const leadData = await this.getLeadData(leadId);
      const signedUrl = await this.generateSignedURL(leadId);
      const agentConfig = await this.buildAgentConfig(leadData, customerPhone);
      
      // Create ElevenLabs WebSocket connection
      const elevenlabsWS = new ElevenLabsWebSocket(
        this.organizationId,
        leadId,
        agentConfig
      );
      
      // Set up event forwarding to dashboard clients
      this.setupEventForwarding(elevenlabsWS, leadId);
      
      // Connect to ElevenLabs
      await elevenlabsWS.connect(signedUrl);
      
      // Store connection
      this.activeConnections.set(leadId, elevenlabsWS);
      
      // Store conversation state in Redis
      await this.storeConversationState(leadId, {
        leadId: leadId,
        organizationId: this.organizationId,
        customerPhone: customerPhone,
        callSid: callSid,
        status: 'active',
        startedAt: new Date().toISOString()
      });
      
      // Broadcast new conversation to dashboard
      this.broadcastToDashboard({
        type: 'new_conversation',
        leadId: leadId,
        customerPhone: customerPhone,
        agentConfig: agentConfig,
        timestamp: new Date().toISOString()
      });
      
      return elevenlabsWS;
      
    } catch (error) {
      console.error(`Failed to create conversation WebSocket for lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Set up event forwarding from ElevenLabs WebSocket to dashboard
   */
  setupEventForwarding(elevenlabsWS, leadId) {
    // Forward all events to dashboard
    elevenlabsWS.on('message', (data) => {
      this.broadcastToDashboard({
        type: 'conversation_event',
        leadId: leadId,
        eventType: data.type,
        eventData: data,
        timestamp: new Date().toISOString()
      });
    });
    
    elevenlabsWS.on('user_transcript', (data) => {
      this.broadcastToDashboard({
        type: 'user_transcript',
        ...data
      });
    });
    
    elevenlabsWS.on('agent_response', (data) => {
      this.broadcastToDashboard({
        type: 'agent_response',
        ...data
      });
    });
    
    elevenlabsWS.on('client_tool_call', (data) => {
      this.broadcastToDashboard({
        type: 'client_tool_call',
        ...data
      });
    });
    
    elevenlabsWS.on('dashboard_update', (data) => {
      this.broadcastToDashboard({
        type: 'dashboard_update',
        ...data
      });
    });
    
    elevenlabsWS.on('conversation_ended', (data) => {
      this.handleConversationEnded(leadId, data);
    });
    
    elevenlabsWS.on('conversation_initialized', (data) => {
      // Store conversation ID mapping
      this.elevenlabsConnections.set(data.conversationId, elevenlabsWS);
    });
    
    elevenlabsWS.on('error', (data) => {
      this.broadcastToDashboard({
        type: 'conversation_error',
        ...data
      });
    });
  }

  /**
   * Handle conversation ended
   */
  async handleConversationEnded(leadId, data) {
    console.log(`🏁 Conversation ended for lead ${leadId}`);
    
    // Remove from active connections
    this.activeConnections.delete(leadId);
    if (data.conversationId) {
      this.elevenlabsConnections.delete(data.conversationId);
    }
    
    // Update conversation state in Redis
    await this.updateConversationState(leadId, {
      status: 'ended',
      endedAt: new Date().toISOString(),
      reason: data.reason,
      duration: data.duration
    });
    
    // Broadcast to dashboard
    this.broadcastToDashboard({
      type: 'conversation_ended',
      ...data
    });
  }

  /**
   * Subscribe dashboard client to specific conversation
   */
  handleSubscribeToConversation(sessionId, conversationId) {
    const connection = this.clientConnections.get(sessionId);
    if (connection) {
      connection.subscribedLeads.add(conversationId);
      
      this.sendToDashboardClient(sessionId, {
        type: 'subscription_confirmed',
        conversationId: conversationId,
        timestamp: new Date().toISOString()
      });
      
      console.log(`📺 Dashboard ${sessionId} subscribed to conversation ${conversationId}`);
    }
  }

  /**
   * Unsubscribe dashboard client from conversation
   */
  handleUnsubscribeFromConversation(sessionId, conversationId) {
    const connection = this.clientConnections.get(sessionId);
    if (connection) {
      connection.subscribedLeads.delete(conversationId);
      
      this.sendToDashboardClient(sessionId, {
        type: 'unsubscription_confirmed',
        conversationId: conversationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send user message to specific conversation
   */
  handleSendUserMessage(conversationId, message) {
    const elevenlabsWS = this.elevenlabsConnections.get(conversationId);
    if (elevenlabsWS) {
      elevenlabsWS.sendUserMessage(message);
    }
  }

  /**
   * Inject context into conversation
   */
  handleInjectContext(conversationId, context) {
    const elevenlabsWS = this.elevenlabsConnections.get(conversationId);
    if (elevenlabsWS) {
      elevenlabsWS.sendContextualUpdate(context);
    }
  }

  /**
   * Send active conversations list to dashboard client
   */
  async sendActiveConversationsList(sessionId) {
    const activeConversations = [];
    
    for (const [leadId, elevenlabsWS] of this.activeConnections.entries()) {
      const status = elevenlabsWS.getStatus();
      const conversationState = await this.getConversationState(leadId);
      
      activeConversations.push({
        leadId: leadId,
        conversationId: status.conversationId,
        status: status,
        state: conversationState
      });
    }
    
    this.sendToDashboardClient(sessionId, {
      type: 'active_conversations_list',
      conversations: activeConversations,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast message to all connected dashboard clients
   */
  broadcastToDashboard(data) {
    const message = JSON.stringify({
      ...data,
      organizationId: this.organizationId,
      timestamp: data.timestamp || new Date().toISOString()
    });
    
    this.clientConnections.forEach((connection, sessionId) => {
      if (connection.organizationId === this.organizationId) {
        try {
          if (connection.ws.readyState === 1) { // WebSocket.OPEN
            connection.ws.send(message);
          } else {
            console.warn(`Dashboard client ${sessionId} not ready, removing connection`);
            this.clientConnections.delete(sessionId);
          }
        } catch (error) {
          console.error(`Failed to broadcast to dashboard client ${sessionId}:`, error);
          this.clientConnections.delete(sessionId);
        }
      }
    });
  }

  /**
   * Send message to specific dashboard client
   */
  sendToDashboardClient(sessionId, data) {
    const connection = this.clientConnections.get(sessionId);
    if (connection && connection.ws.readyState === 1) {
      try {
        connection.ws.send(JSON.stringify({
          ...data,
          organizationId: this.organizationId,
          timestamp: data.timestamp || new Date().toISOString()
        }));
      } catch (error) {
        console.error(`Failed to send to dashboard client ${sessionId}:`, error);
        this.clientConnections.delete(sessionId);
      }
    }
  }

  /**
   * Redis state management
   */
  async storeConversationState(leadId, state, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = `conversation:${this.organizationId}:${leadId}`;
        const data = {
          ...state,
          updated_at: new Date().toISOString(),
          organization_id: this.organizationId
        };
        
        await this.redisClient.setex(key, 86400, JSON.stringify(data)); // 24-hour expiration
        return true;
        
      } catch (error) {
        console.error(`Attempt ${attempt} failed to store conversation state:`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to store conversation state after ${maxRetries} attempts`);
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  async getConversationState(leadId) {
    try {
      const key = `conversation:${this.organizationId}:${leadId}`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to retrieve conversation state:', error);
      return null;
    }
  }

  async updateConversationState(leadId, updates) {
    const currentState = await this.getConversationState(leadId);
    if (currentState) {
      const updatedState = { ...currentState, ...updates };
      await this.storeConversationState(leadId, updatedState);
    }
  }

  /**
   * Utility methods
   */
  generateSessionId() {
    return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  extractTokenFromRequest(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || 
                  req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No authentication token provided');
    }
    
    return token;
  }

  validateToken(token) {
    // Implement your token validation logic here
    // This should return the organization ID if valid, throw error if not
    try {
      // Example JWT validation (replace with your implementation)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      
      if (payload.exp < Date.now() / 1000) {
        throw new Error('Token expired');
      }
      
      return payload.organizationId;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getLeadData(leadId) {
    // Implement lead data retrieval from your database
    // This should return customer information for personalization
    return {
      id: leadId,
      name: 'Valued Customer',
      phone: '',
      email: '',
      // ... other customer data
    };
  }

  async generateSignedURL(leadId) {
    // Implement signed URL generation for ElevenLabs WebSocket
    // This should call your backend API to get a signed URL
    const response = await fetch('/api/elevenlabs/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: this.organizationId,
        leadId: leadId
      })
    });
    
    const data = await response.json();
    return data.signedUrl;
  }

  async buildAgentConfig(leadData, customerPhone) {
    // Build agent configuration with dynamic variables
    return {
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      voice_id: process.env.ELEVENLABS_VOICE_ID,
      customer_name: leadData.name || 'Valued Customer',
      customer_phone: customerPhone,
      customer_email: leadData.email || '',
      // ... other dynamic variables
    };
  }

  setupCleanupInterval() {
    // Clean up inactive connections every 5 minutes
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  cleanupInactiveConnections() {
    const now = new Date();
    const timeout = 10 * 60 * 1000; // 10 minutes
    
    this.clientConnections.forEach((connection, sessionId) => {
      if (now - connection.lastActivity > timeout) {
        console.log(`🧹 Cleaning up inactive dashboard connection: ${sessionId}`);
        connection.ws.close(4001, 'Connection timeout');
        this.clientConnections.delete(sessionId);
      }
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      organizationId: this.organizationId,
      activeConversations: this.activeConnections.size,
      dashboardClients: this.clientConnections.size,
      connections: Array.from(this.activeConnections.values()).map(ws => ws.getStatus())
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Dashboard WebSocket Manager...');
    
    // Close all ElevenLabs connections
    for (const [leadId, elevenlabsWS] of this.activeConnections.entries()) {
      elevenlabsWS.disconnect();
    }
    
    // Close all dashboard client connections
    for (const [sessionId, connection] of this.clientConnections.entries()) {
      connection.ws.close(1001, 'Server shutdown');
    }
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('✅ Dashboard WebSocket Manager shutdown complete');
  }
}

export default DashboardWebSocketManager;