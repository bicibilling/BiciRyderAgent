/**
 * BICI AI Voice System - Dashboard WebSocket Manager
 * Real-time dashboard with WebSocket streaming for agent monitoring
 */

const { WebSocketServer } = require('ws');
const { ConversationStateManager } = require('./conversation-state');
const { ElevenLabsWebSocket } = require('./elevenlabs-websocket');
const { config } = require('../config');

class DashboardWebSocketManager {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.activeConnections = new Map(); // leadId -> ElevenLabs WebSocket
    this.elevenlabsConnections = new Map(); // conversationId -> ElevenLabs WS
    this.clientConnections = new Map(); // dashboardSessionId -> client WS
    this.stateManager = new ConversationStateManager();
    
    console.log(`📊 Dashboard WebSocket Manager initialized for org: ${organizationId}`);
  }

  /**
   * Create new conversation WebSocket for dashboard monitoring
   */
  async createConversationWebSocket(leadId, customerPhone) {
    try {
      console.log(`🔗 Creating conversation WebSocket for lead: ${leadId}`);

      // Get lead data for context
      const leadData = await this.getLeadData(leadId);
      
      // Get signed URL from ElevenLabs
      const signedUrl = await this.generateSignedURL(leadId);
      
      // Build agent configuration with customer context
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
      this.elevenlabsConnections.set(leadId, elevenlabsWS);

      console.log(`✅ Conversation WebSocket created for lead: ${leadId}`);
      return elevenlabsWS;

    } catch (error) {
      console.error(`❌ Failed to create conversation WebSocket for ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Set up event forwarding from ElevenLabs to dashboard clients
   */
  setupEventForwarding(elevenlabsWS, leadId) {
    // Forward all ElevenLabs events to dashboard
    elevenlabsWS.on('message', (eventData) => {
      this.broadcastToDashboard({
        type: 'conversation_event',
        leadId: leadId,
        eventData: eventData,
        timestamp: new Date().toISOString()
      });
    });

    // Forward conversation events
    elevenlabsWS.on('conversation_initiated', (data) => {
      this.broadcastToDashboard({
        type: 'conversation_initiated',
        leadId: data.leadId,
        conversationId: data.conversationId,
        metadata: data.metadata,
        timestamp: new Date().toISOString()
      });
    });

    elevenlabsWS.on('user_transcript', (data) => {
      this.broadcastToDashboard({
        type: 'user_transcript',
        leadId: data.leadId,
        conversationId: data.conversationId,
        transcript: data.transcript,
        confidence: data.confidence,
        timestamp: new Date().toISOString()
      });
    });

    elevenlabsWS.on('agent_response', (data) => {
      this.broadcastToDashboard({
        type: 'agent_response',
        leadId: data.leadId,
        conversationId: data.conversationId,
        response: data.response,
        timestamp: new Date().toISOString()
      });
    });

    elevenlabsWS.on('client_tool_call', (data) => {
      this.broadcastToDashboard({
        type: 'tool_call',
        leadId: data.leadId,
        conversationId: data.conversationId,
        toolName: data.toolName,
        arguments: data.arguments,
        result: data.result,
        timestamp: new Date().toISOString()
      });
    });

    elevenlabsWS.on('conversation_ended', (data) => {
      this.broadcastToDashboard({
        type: 'conversation_ended',
        leadId: data.leadId,
        conversationId: data.conversationId,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });

      // Clean up connection
      this.elevenlabsConnections.delete(leadId);
    });

    elevenlabsWS.on('dashboard_update', (data) => {
      this.broadcastToDashboard({
        type: 'dashboard_update',
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    elevenlabsWS.on('error', (data) => {
      this.broadcastToDashboard({
        type: 'conversation_error',
        leadId: data.leadId,
        error: data.error,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle dashboard client connections
   */
  handleDashboardConnection(ws, sessionId) {
    try {
      // Store client connection
      this.clientConnections.set(sessionId, {
        ws: ws,
        organizationId: this.organizationId,
        connectedAt: new Date(),
        subscribedLeads: new Set(),
        sessionId: sessionId
      });

      // Send initial connection confirmation
      this.sendToClient(sessionId, {
        type: 'dashboard_connected',
        sessionId: sessionId,
        organizationId: this.organizationId,
        timestamp: new Date().toISOString()
      });

      // Send current active conversations
      this.sendActiveConversationsToClient(sessionId);

      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleDashboardMessage(sessionId, data);
        } catch (error) {
          console.error(`❌ Failed to parse dashboard message from ${sessionId}:`, error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clientConnections.delete(sessionId);
        console.log(`📊 Dashboard client disconnected: ${sessionId}`);
      });

      // Handle client errors
      ws.on('error', (error) => {
        console.error(`❌ Dashboard client error ${sessionId}:`, error);
        this.clientConnections.delete(sessionId);
      });

      console.log(`📊 Dashboard client connected: ${sessionId}`);

    } catch (error) {
      console.error(`❌ Failed to handle dashboard connection ${sessionId}:`, error);
    }
  }

  /**
   * Handle messages from dashboard clients
   */
  async handleDashboardMessage(sessionId, data) {
    try {
      console.log(`📨 Dashboard message from ${sessionId}:`, data.type);

      switch (data.type) {
        case 'subscribe_to_lead':
          await this.handleLeadSubscription(sessionId, data.leadId);
          break;

        case 'unsubscribe_from_lead':
          await this.handleLeadUnsubscription(sessionId, data.leadId);
          break;

        case 'send_user_message':
          await this.handleSendUserMessage(sessionId, data);
          break;

        case 'send_contextual_update':
          await this.handleContextualUpdate(sessionId, data);
          break;

        case 'request_conversation_history':
          await this.handleConversationHistoryRequest(sessionId, data);
          break;

        case 'initiate_human_takeover':
          await this.handleHumanTakeover(sessionId, data);
          break;

        case 'resume_ai_control':
          await this.handleResumeAIControl(sessionId, data);
          break;

        default:
          console.warn(`⚠️  Unknown dashboard message type: ${data.type}`);
      }

    } catch (error) {
      console.error(`❌ Error handling dashboard message from ${sessionId}:`, error);
      
      this.sendToClient(sessionId, {
        type: 'error',
        error: error.message,
        originalMessage: data,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle lead subscription from dashboard
   */
  async handleLeadSubscription(sessionId, leadId) {
    const connection = this.clientConnections.get(sessionId);
    if (connection) {
      connection.subscribedLeads.add(leadId);
      
      this.sendToClient(sessionId, {
        type: 'subscribed_to_lead',
        leadId: leadId,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Dashboard ${sessionId} subscribed to lead ${leadId}`);
    }
  }

  /**
   * Handle lead unsubscription from dashboard
   */
  async handleLeadUnsubscription(sessionId, leadId) {
    const connection = this.clientConnections.get(sessionId);
    if (connection) {
      connection.subscribedLeads.delete(leadId);
      
      this.sendToClient(sessionId, {
        type: 'unsubscribed_from_lead',
        leadId: leadId,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Dashboard ${sessionId} unsubscribed from lead ${leadId}`);
    }
  }

  /**
   * Handle sending user message to conversation
   */
  async handleSendUserMessage(sessionId, data) {
    const { leadId, message } = data;
    const elevenlabsWS = this.elevenlabsConnections.get(leadId);

    if (elevenlabsWS && elevenlabsWS.isConnected()) {
      elevenlabsWS.sendUserMessage(message);
      
      this.sendToClient(sessionId, {
        type: 'user_message_sent',
        leadId: leadId,
        message: message,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`No active conversation found for lead ${leadId}`);
    }
  }

  /**
   * Handle contextual updates from dashboard
   */
  async handleContextualUpdate(sessionId, data) {
    const { leadId, updateText } = data;
    const elevenlabsWS = this.elevenlabsConnections.get(leadId);

    if (elevenlabsWS && elevenlabsWS.isConnected()) {
      elevenlabsWS.sendContextualUpdate(updateText);
      
      this.sendToClient(sessionId, {
        type: 'contextual_update_sent',
        leadId: leadId,
        updateText: updateText,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`No active conversation found for lead ${leadId}`);
    }
  }

  /**
   * Handle conversation history requests
   */
  async handleConversationHistoryRequest(sessionId, data) {
    const { leadId, conversationId } = data;
    
    const transcript = await this.stateManager.getTranscript(conversationId || leadId);
    
    this.sendToClient(sessionId, {
      type: 'conversation_history',
      leadId: leadId,
      conversationId: conversationId,
      transcript: transcript,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle human takeover requests
   */
  async handleHumanTakeover(sessionId, data) {
    const { leadId, agentName } = data;
    const elevenlabsWS = this.elevenlabsConnections.get(leadId);

    if (elevenlabsWS && elevenlabsWS.isConnected()) {
      // In a real implementation, this would integrate with ElevenLabs transfer capabilities
      this.broadcastToDashboard({
        type: 'human_takeover_initiated',
        leadId: leadId,
        agentName: agentName,
        initiatedBy: sessionId,
        timestamp: new Date().toISOString()
      });

      console.log(`👤 Human takeover initiated for lead ${leadId} by agent ${agentName}`);
    } else {
      throw new Error(`No active conversation found for lead ${leadId}`);
    }
  }

  /**
   * Handle AI control resumption
   */
  async handleResumeAIControl(sessionId, data) {
    const { leadId } = data;
    
    this.broadcastToDashboard({
      type: 'ai_control_resumed',
      leadId: leadId,
      resumedBy: sessionId,
      timestamp: new Date().toISOString()
    });

    console.log(`🤖 AI control resumed for lead ${leadId}`);
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
          // Check if client is subscribed to this lead (if applicable)
          if (data.leadId && !connection.subscribedLeads.has(data.leadId)) {
            return; // Skip if not subscribed
          }

          connection.ws.send(message);
        } catch (error) {
          console.error(`❌ Failed to broadcast to dashboard client ${sessionId}:`, error);
          this.clientConnections.delete(sessionId);
        }
      }
    });
  }

  /**
   * Send message to specific dashboard client
   */
  sendToClient(sessionId, data) {
    const connection = this.clientConnections.get(sessionId);
    if (connection) {
      try {
        connection.ws.send(JSON.stringify({
          ...data,
          organizationId: this.organizationId
        }));
      } catch (error) {
        console.error(`❌ Failed to send to dashboard client ${sessionId}:`, error);
        this.clientConnections.delete(sessionId);
      }
    }
  }

  /**
   * Send active conversations to newly connected client
   */
  async sendActiveConversationsToClient(sessionId) {
    try {
      const activeConversations = await this.stateManager.getActiveConversations();
      
      this.sendToClient(sessionId, {
        type: 'active_conversations',
        conversations: activeConversations,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Failed to send active conversations to ${sessionId}:`, error);
    }
  }

  /**
   * Utility Methods
   */

  async getLeadData(leadId) {
    // In a real implementation, this would query the database
    // For now, return mock data
    return {
      id: leadId,
      customer_name: 'Customer',
      phone_number: '+1234567890',
      lead_status: 'active',
      organization_id: this.organizationId
    };
  }

  async generateSignedURL(leadId) {
    try {
      const response = await fetch(config.elevenlabs.endpoints.signedUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': config.elevenlabs.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: config.elevenlabs.agentId
        })
      });

      const data = await response.json();
      return data.signed_url;
    } catch (error) {
      console.error('❌ Failed to get signed URL:', error);
      throw error;
    }
  }

  async buildAgentConfig(leadData, customerPhone) {
    return {
      agent_id: config.elevenlabs.agentId,
      voice_id: config.elevenlabs.voiceId,
      language: leadData?.preferred_language || 'en',
      first_message: `Hi! I'm BICI's AI assistant. How can I help you today?`,
      
      dynamic_variables: {
        customer_name: leadData?.customer_name || 'Valued Customer',
        customer_phone: customerPhone,
        organization_name: config.business.organization.name,
        store_hours: '9AM-7PM Mon-Fri, 10AM-6PM Weekends'
      }
    };
  }

  /**
   * Get dashboard statistics
   */
  getDashboardStats() {
    return {
      connectedClients: this.clientConnections.size,
      activeConversations: this.elevenlabsConnections.size,
      organizationId: this.organizationId,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close all connections gracefully
   */
  closeAllConnections() {
    console.log('🔌 Closing all dashboard connections...');

    // Close ElevenLabs connections
    this.elevenlabsConnections.forEach((ws, leadId) => {
      try {
        ws.disconnect();
      } catch (error) {
        console.error(`❌ Error closing ElevenLabs connection ${leadId}:`, error);
      }
    });

    // Close dashboard client connections
    this.clientConnections.forEach((connection, sessionId) => {
      try {
        connection.ws.close(1000, 'Server shutdown');
      } catch (error) {
        console.error(`❌ Error closing dashboard connection ${sessionId}:`, error);
      }
    });

    this.elevenlabsConnections.clear();
    this.clientConnections.clear();

    console.log('✅ All dashboard connections closed');
  }
}

module.exports = { DashboardWebSocketManager };