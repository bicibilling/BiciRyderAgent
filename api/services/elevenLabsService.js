/**
 * ElevenLabs Service
 * Integration with ElevenLabs Conversational AI API
 */

const { WebSocket } = require('ws');
const { EventEmitter } = require('events');

class ElevenLabsService extends EventEmitter {
  constructor() {
    super();
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.wsUrl = 'wss://api.elevenlabs.io/v1/convai/conversation';
    this.activeConnections = new Map();
    this.agentConfigs = new Map();
    this.isInitialized = false;
  }
  
  /**
   * Initialize ElevenLabs service
   */
  async initialize() {
    if (!this.apiKey) {
      console.warn('⚠️  ElevenLabs API key not provided');
      return false;
    }
    
    try {
      // Test API connection
      const response = await this.makeApiCall('/user');
      if (response.subscription) {
        console.log('✅ ElevenLabs service initialized');
        this.isInitialized = true;
        return true;
      }
      
      throw new Error('Invalid API response');
      
    } catch (error) {
      console.error('❌ ElevenLabs initialization failed:', error.message);
      return false;
    }
  }
  
  /**
   * Make API call to ElevenLabs
   */
  async makeApiCall(endpoint, options = {}) {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = 30000
    } = options;
    
    const url = `${this.baseUrl}${endpoint}`;
    
    const requestOptions = {
      method,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...headers
      },
      signal: AbortSignal.timeout(timeout)
    };
    
    if (body) {
      requestOptions.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error(`ElevenLabs API call failed: ${method} ${endpoint}`, error.message);
      throw error;
    }
  }
  
  /**
   * Get available agents
   */
  async getAgents() {
    try {
      const response = await this.makeApiCall('/convai/agents');
      return response.agents || [];
    } catch (error) {
      console.error('Failed to get ElevenLabs agents:', error.message);
      return [];
    }
  }
  
  /**
   * Get agent configuration
   */
  async getAgent(agentId) {
    try {
      const response = await this.makeApiCall(`/convai/agents/${agentId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get agent ${agentId}:`, error.message);
      return null;
    }
  }
  
  /**
   * Create new agent
   */
  async createAgent(agentConfig) {
    try {
      const response = await this.makeApiCall('/convai/agents', {
        method: 'POST',
        body: agentConfig
      });
      
      return response;
    } catch (error) {
      console.error('Failed to create ElevenLabs agent:', error.message);
      throw error;
    }
  }
  
  /**
   * Update agent configuration
   */
  async updateAgent(agentId, updates) {
    try {
      const response = await this.makeApiCall(`/convai/agents/${agentId}`, {
        method: 'PATCH',
        body: updates
      });
      
      return response;
    } catch (error) {
      console.error(`Failed to update agent ${agentId}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Generate signed URL for WebSocket connection
   */
  async generateSignedUrl(agentId, organizationId) {
    try {
      const response = await this.makeApiCall('/convai/conversation/get_signed_url', {
        method: 'POST',
        body: {
          agent_id: agentId,
          organization_id: organizationId
        }
      });
      
      return response.signed_url;
    } catch (error) {
      console.error('Failed to generate signed URL:', error.message);
      throw error;
    }
  }
  
  /**
   * Create WebSocket connection for conversation
   */
  async createConversationWebSocket(conversationId, agentId, organizationId, customerData = {}) {
    try {
      const signedUrl = await this.generateSignedUrl(agentId, organizationId);
      
      const ws = new WebSocket(signedUrl);
      const connection = {
        id: conversationId,
        ws,
        agentId,
        organizationId,
        customerData,
        state: 'connecting',
        connectedAt: null,
        lastActivity: Date.now()
      };
      
      this.setupWebSocketHandlers(connection);
      this.activeConnections.set(conversationId, connection);
      
      return connection;
      
    } catch (error) {
      console.error(`Failed to create WebSocket for conversation ${conversationId}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers(connection) {
    const { ws, id: conversationId } = connection;
    
    ws.on('open', () => {
      connection.state = 'connected';
      connection.connectedAt = new Date().toISOString();
      
      console.log(`🔗 ElevenLabs WebSocket connected: ${conversationId}`);
      
      // Send initial conversation setup
      this.sendConversationInitiation(connection);
      
      this.emit('conversation_connected', { conversationId, connection });
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        connection.lastActivity = Date.now();
        
        this.handleWebSocketMessage(connection, message);
      } catch (error) {
        console.error(`Invalid WebSocket message from ${conversationId}:`, error.message);
      }
    });
    
    ws.on('close', (code, reason) => {
      connection.state = 'disconnected';
      console.log(`🔌 ElevenLabs WebSocket closed: ${conversationId} (${code}: ${reason})`);
      
      this.emit('conversation_disconnected', { conversationId, code, reason });
      this.activeConnections.delete(conversationId);
    });
    
    ws.on('error', (error) => {
      console.error(`ElevenLabs WebSocket error for ${conversationId}:`, error.message);
      this.emit('conversation_error', { conversationId, error });
    });
  }
  
  /**
   * Send conversation initiation message
   */
  sendConversationInitiation(connection) {
    const { customerData, agentId } = connection;
    
    const initMessage = {
      type: 'conversation_initiation',
      conversation_config: {
        agent_id: agentId,
        
        // Customer context variables
        dynamic_variables: {
          customer_name: customerData.name || 'Valued Customer',
          customer_phone: customerData.phoneNumber || '',
          customer_email: customerData.email || '',
          organization_name: 'Bici Bike Store',
          current_time: new Date().toLocaleString(),
          ...customerData.dynamicVariables
        },
        
        // Voice settings
        voice_config: {
          stability: 0.65,
          similarity_boost: 0.85,
          speed: 1.0
        },
        
        // Language settings
        language: customerData.language || 'en'
      }
    };
    
    this.sendWebSocketMessage(connection.id, initMessage);
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(connection, message) {
    const { type, data } = message;
    const conversationId = connection.id;
    
    switch (type) {
      case 'conversation_initiation_metadata':
        this.handleConversationInit(connection, data);
        break;
        
      case 'user_transcript':
        this.handleUserTranscript(connection, data);
        break;
        
      case 'agent_response':
        this.handleAgentResponse(connection, data);
        break;
        
      case 'client_tool_call':
        this.handleToolCall(connection, data);
        break;
        
      case 'audio':
        this.handleAudioStream(connection, data);
        break;
        
      case 'ping':
        this.sendWebSocketMessage(conversationId, { type: 'pong' });
        break;
        
      default:
        console.warn(`Unknown WebSocket message type: ${type} from ${conversationId}`);
    }
  }
  
  /**
   * Handle conversation initialization
   */
  handleConversationInit(connection, data) {
    const { conversation_id, agent_id } = data;
    
    console.log(`🎯 Conversation initialized: ${conversation_id} with agent ${agent_id}`);
    
    this.emit('conversation_initialized', {
      conversationId: connection.id,
      elevenLabsConversationId: conversation_id,
      agentId: agent_id,
      data
    });
  }
  
  /**
   * Handle user transcript
   */
  handleUserTranscript(connection, data) {
    const { text, confidence, timestamp } = data;
    
    console.log(`💬 User transcript: "${text}" (confidence: ${confidence})`);
    
    this.emit('user_transcript', {
      conversationId: connection.id,
      text,
      confidence,
      timestamp,
      speaker: 'customer'
    });
  }
  
  /**
   * Handle agent response
   */
  handleAgentResponse(connection, data) {
    const { text, audio, confidence } = data;
    
    console.log(`🤖 Agent response: "${text}"`);
    
    this.emit('agent_response', {
      conversationId: connection.id,
      text,
      audio,
      confidence,
      timestamp: new Date().toISOString(),
      speaker: 'ai'
    });
  }
  
  /**
   * Handle tool calls from AI
   */
  async handleToolCall(connection, data) {
    const { tool_name, parameters, tool_call_id } = data;
    
    console.log(`🔧 Tool call: ${tool_name}`, parameters);
    
    try {
      // Emit tool call event for external handling
      const result = await new Promise((resolve, reject) => {
        this.emit('tool_call', {
          conversationId: connection.id,
          toolName: tool_name,
          parameters,
          toolCallId: tool_call_id,
          resolve,
          reject
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error('Tool call timeout'));
        }, 30000);
      });
      
      // Send result back to ElevenLabs
      this.sendToolResult(connection.id, tool_call_id, result);
      
    } catch (error) {
      console.error(`Tool call failed: ${tool_name}`, error.message);
      
      // Send error result
      this.sendToolResult(connection.id, tool_call_id, {
        error: error.message,
        success: false
      });
    }
  }
  
  /**
   * Handle audio stream
   */
  handleAudioStream(connection, data) {
    // Forward audio data to WebSocket manager for dashboard streaming
    this.emit('audio_stream', {
      conversationId: connection.id,
      audio: data,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send message through WebSocket
   */
  sendWebSocketMessage(conversationId, message) {
    const connection = this.activeConnections.get(conversationId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      console.warn(`Cannot send message to ${conversationId}: connection not available`);
      return false;
    }
    
    try {
      connection.ws.send(JSON.stringify(message));
      connection.lastActivity = Date.now();
      return true;
    } catch (error) {
      console.error(`Failed to send WebSocket message to ${conversationId}:`, error.message);
      return false;
    }
  }
  
  /**
   * Send user message to conversation
   */
  sendUserMessage(conversationId, text) {
    return this.sendWebSocketMessage(conversationId, {
      type: 'user_message',
      text
    });
  }
  
  /**
   * Send contextual update
   */
  sendContextualUpdate(conversationId, text) {
    return this.sendWebSocketMessage(conversationId, {
      type: 'contextual_update',
      text
    });
  }
  
  /**
   * Send tool result back to AI
   */
  sendToolResult(conversationId, toolCallId, result) {
    return this.sendWebSocketMessage(conversationId, {
      type: 'client_tool_result',
      tool_call_id: toolCallId,
      result
    });
  }
  
  /**
   * Initiate outbound call
   */
  async initiateOutboundCall(phoneNumber, agentId, conversationData = {}) {
    try {
      const response = await this.makeApiCall('/convai/twilio/outbound-call', {
        method: 'POST',
        body: {
          agent_id: agentId,
          agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
          to_number: phoneNumber,
          conversation_initiation_client_data: {
            dynamic_variables: conversationData.dynamicVariables || {},
            conversation_config_override: conversationData.configOverride || {}
          }
        }
      });
      
      return {
        success: true,
        conversation_id: response.conversation_id,
        call_sid: response.call_sid
      };
      
    } catch (error) {
      console.error('Failed to initiate outbound call:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId) {
    try {
      const response = await this.makeApiCall(`/convai/conversations/${conversationId}/history`);
      return response;
    } catch (error) {
      console.error(`Failed to get conversation history for ${conversationId}:`, error.message);
      return null;
    }
  }
  
  /**
   * Get active connections
   */
  getActiveConnections() {
    return Array.from(this.activeConnections.values()).map(conn => ({
      id: conn.id,
      agentId: conn.agentId,
      organizationId: conn.organizationId,
      state: conn.state,
      connectedAt: conn.connectedAt,
      lastActivity: new Date(conn.lastActivity).toISOString()
    }));
  }
  
  /**
   * Close conversation
   */
  closeConversation(conversationId) {
    const connection = this.activeConnections.get(conversationId);
    if (connection && connection.ws) {
      connection.ws.close(1000, 'Conversation ended');
      return true;
    }
    return false;
  }
  
  /**
   * Close all connections
   */
  closeAllConnections() {
    this.activeConnections.forEach((connection, conversationId) => {
      this.closeConversation(conversationId);
    });
    
    console.log('🔌 All ElevenLabs connections closed');
  }
}

module.exports = ElevenLabsService;