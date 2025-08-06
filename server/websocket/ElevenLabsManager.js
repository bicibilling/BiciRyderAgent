const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const { ConversationStateManager } = require('../redis/ConversationState');

class ElevenLabsWebSocketManager {
  constructor(organizationId, leadId, agentConfig) {
    this.organizationId = organizationId;
    this.leadId = leadId;
    this.agentConfig = agentConfig;
    this.ws = null;
    this.connectionState = 'disconnected';
    this.eventHandlers = new Map();
    this.conversationId = null;
    this.conversationStateManager = new ConversationStateManager();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.isHumanTakeover = false;
    
    this.setupEventHandlers();
  }
  
  /**
   * Set up event handlers for different WebSocket message types
   */
  setupEventHandlers() {
    // Conversation initiation
    this.onEvent('conversation_initiation_metadata', this.handleConversationInit.bind(this));
    
    // Audio handling
    this.onEvent('audio', this.handleAudioStream.bind(this));
    
    // Transcription events
    this.onEvent('user_transcript', this.handleUserTranscript.bind(this));
    this.onEvent('agent_response', this.handleAgentResponse.bind(this));
    this.onEvent('tentative_agent_response', this.handleTentativeResponse.bind(this));
    
    // Tool calls
    this.onEvent('client_tool_call', this.handleClientToolCall.bind(this));
    
    // Voice Activity Detection
    this.onEvent('vad_score', this.handleVADScore.bind(this));
    
    // Connection management
    this.onEvent('ping', this.handlePing.bind(this));
    
    // Error handling
    this.onEvent('error', this.handleError.bind(this));
  }
  
  /**
   * Connect to ElevenLabs WebSocket
   */
  async connect() {
    try {
      const signedUrl = await this.generateSignedURL();
      
      this.ws = new WebSocket(signedUrl);
      
      // Connection opened
      this.ws.onopen = () => {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.sendConversationInitiation();
        
        logger.info('ElevenLabs WebSocket connected', {
          leadId: this.leadId,
          organizationId: this.organizationId
        });
      };
      
      // Message received
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          logger.error('Failed to parse ElevenLabs message', {
            leadId: this.leadId,
            error: error.message
          });
        }
      };
      
      // Connection closed
      this.ws.onclose = (event) => {
        this.connectionState = 'disconnected';
        
        logger.info('ElevenLabs WebSocket disconnected', {
          leadId: this.leadId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        }
      };
      
      // Error handling
      this.ws.onerror = (error) => {
        logger.error('ElevenLabs WebSocket error', {
          leadId: this.leadId,
          error: error.message
        });
        this.handleConnectionError(error);
      };
      
    } catch (error) {
      logger.error('Failed to establish ElevenLabs WebSocket connection', {
        leadId: this.leadId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Generate signed URL for ElevenLabs WebSocket connection
   */
  async generateSignedURL() {
    const baseUrl = 'wss://api.elevenlabs.io/v1/convai/conversation';
    const params = new URLSearchParams({
      agent_id: this.agentConfig.agent_id,
      organization_id: this.organizationId,
      lead_id: this.leadId
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
  
  /**
   * Send conversation initiation message
   */
  sendConversationInitiation() {
    const initMessage = {
      type: 'conversation_initiation',
      conversation_config: {
        agent_id: this.agentConfig.agent_id,
        dynamic_variables: this.buildDynamicVariables(),
        voice_config: {
          voice_id: this.agentConfig.voice_id || 'default',
          stability: this.agentConfig.stability || 0.65,
          similarity_boost: this.agentConfig.similarity || 0.85,
          speed: this.agentConfig.speed || 1.0
        },
        language: this.agentConfig.language || 'en',
        first_message: this.agentConfig.first_message || 'Hello! How can I help you today?'
      }
    };
    
    this.send(initMessage);
  }
  
  /**
   * Build dynamic variables for conversation context
   */
  buildDynamicVariables() {
    return {
      // Customer context
      customer_name: this.agentConfig.customerName || 'Valued Customer',
      customer_phone: this.agentConfig.customerPhone || '',
      customer_email: this.agentConfig.customerEmail || '',
      
      // Organization context
      organization_name: this.agentConfig.organizationName || 'BICI Bike Store',
      organization_id: this.organizationId,
      
      // Conversation context
      lead_id: this.leadId,
      conversation_type: this.agentConfig.conversationType || 'inbound',
      previous_interactions: this.agentConfig.previousInteractions || 0,
      
      // Business context
      store_hours: this.agentConfig.storeHours || 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
      current_promotions: this.agentConfig.currentPromotions || '',
      
      // System context
      human_takeover_available: true,
      dashboard_monitoring: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Handle all WebSocket message types
   */
  handleWebSocketMessage(data) {
    logger.debug('ElevenLabs message received', {
      type: data.type,
      leadId: this.leadId,
      organizationId: this.organizationId
    });
    
    // Store conversation state
    this.storeConversationEvent(data);
    
    // Trigger event handlers
    const handler = this.eventHandlers.get(data.type);
    if (handler) {
      try {
        handler(data);
      } catch (error) {
        logger.error('Event handler error', {
          type: data.type,
          leadId: this.leadId,
          error: error.message
        });
      }
    }
    
    // Trigger wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    wildcardHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error('Wildcard event handler error', {
          type: data.type,
          leadId: this.leadId,
          error: error.message
        });
      }
    });
  }
  
  /**
   * Handle conversation initialization
   */
  handleConversationInit(data) {
    this.conversationId = data.conversation_id;
    
    logger.info('Conversation initialized', {
      conversationId: this.conversationId,
      leadId: this.leadId,
      organizationId: this.organizationId
    });
    
    // Store initial conversation state
    this.conversationStateManager.storeConversationState(this.conversationId, {
      leadId: this.leadId,
      organizationId: this.organizationId,
      status: 'active',
      startedAt: new Date().toISOString(),
      isHumanTakeover: false
    });
  }
  
  /**
   * Handle audio stream
   */
  handleAudioStream(data) {
    // Audio data can be forwarded to dashboard for monitoring
    // or stored for later analysis
    logger.debug('Audio stream received', {
      conversationId: this.conversationId,
      audioLength: data.audio_base64?.length || 0
    });
  }
  
  /**
   * Handle user transcript
   */
  handleUserTranscript(data) {
    logger.info('User transcript', {
      conversationId: this.conversationId,
      transcript: data.transcript,
      isFinal: data.is_final
    });
    
    // Store transcript if final
    if (data.is_final) {
      this.storeTranscript('user', data.transcript);
    }
  }
  
  /**
   * Handle agent response
   */
  handleAgentResponse(data) {
    logger.info('Agent response', {
      conversationId: this.conversationId,
      response: data.response
    });
    
    // Store agent response
    this.storeTranscript('agent', data.response);
  }
  
  /**
   * Handle tentative agent response
   */
  handleTentativeResponse(data) {
    logger.debug('Tentative agent response', {
      conversationId: this.conversationId,
      response: data.response
    });
  }
  
  /**
   * Handle client tool calls
   */
  async handleClientToolCall(data) {
    logger.info('Client tool call received', {
      conversationId: this.conversationId,
      toolName: data.tool_name,
      toolCallId: data.tool_call_id
    });
    
    try {
      const result = await this.executeClientTool(data);
      
      // Send result back to ElevenLabs
      this.sendClientToolResult(data.tool_call_id, result);
      
    } catch (error) {
      logger.error('Client tool execution failed', {
        conversationId: this.conversationId,
        toolName: data.tool_name,
        error: error.message
      });
      
      // Send error result
      this.sendClientToolResult(data.tool_call_id, {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Execute client tool
   */
  async executeClientTool(toolCall) {
    const { tool_name, parameters } = toolCall;
    
    switch (tool_name) {
      case 'update_customer_display':
        return this.executeUpdateCustomerDisplay(parameters);
        
      case 'show_product_recommendation':
        return this.executeShowProductRecommendation(parameters);
        
      case 'trigger_follow_up_action':
        return this.executeTriggerFollowUpAction(parameters);
        
      case 'transfer_to_human':
        return this.executeTransferToHuman(parameters);
        
      default:
        throw new Error(`Unknown client tool: ${tool_name}`);
    }
  }
  
  /**
   * Handle Voice Activity Detection score
   */
  handleVADScore(data) {
    logger.debug('VAD score', {
      conversationId: this.conversationId,
      score: data.score
    });
  }
  
  /**
   * Handle ping messages
   */
  handlePing(data) {
    // Respond with pong
    this.send({
      type: 'pong',
      sequence: data.sequence
    });
  }
  
  /**
   * Handle errors
   */
  handleError(data) {
    logger.error('ElevenLabs error', {
      conversationId: this.conversationId,
      error: data.error,
      details: data.details
    });
  }
  
  /**
   * Send user audio chunk
   */
  sendUserAudio(audioChunk) {
    if (this.connectionState === 'connected') {
      this.send({
        type: 'user_audio_chunk',
        chunk: audioChunk,
        sample_rate: 16000,
        format: 'pcm'
      });
    }
  }
  
  /**
   * Send contextual update
   */
  sendContextualUpdate(updateText) {
    this.send({
      type: 'contextual_update',
      text: updateText
    });
  }
  
  /**
   * Send user message
   */
  sendUserMessage(message) {
    this.send({
      type: 'user_message',
      text: message
    });
  }
  
  /**
   * Send user activity
   */
  sendUserActivity() {
    this.send({
      type: 'user_activity'
    });
  }
  
  /**
   * Send client tool result
   */
  sendClientToolResult(toolCallId, result) {
    this.send({
      type: 'client_tool_result',
      tool_call_id: toolCallId,
      result: result
    });
  }
  
  /**
   * Enable human takeover
   */
  async enableHumanTakeover(agentName) {
    this.isHumanTakeover = true;
    
    // Update conversation state
    await this.conversationStateManager.storeConversationState(this.conversationId, {
      isHumanTakeover: true,
      humanAgentName: agentName,
      takeoverAt: new Date().toISOString()
    });
    
    // Send contextual update to conversation
    this.sendContextualUpdate(`Human agent ${agentName} has joined the conversation and taken control.`);
    
    logger.info('Human takeover enabled', {
      conversationId: this.conversationId,
      agentName
    });
  }
  
  /**
   * Release back to AI
   */
  async releaseToAI() {
    this.isHumanTakeover = false;
    
    // Update conversation state
    await this.conversationStateManager.storeConversationState(this.conversationId, {
      isHumanTakeover: false,
      releasedAt: new Date().toISOString()
    });
    
    // Send contextual update to conversation
    this.sendContextualUpdate('AI assistant has resumed control of the conversation.');
    
    logger.info('Conversation released back to AI', {
      conversationId: this.conversationId
    });
  }
  
  /**
   * Get conversation state
   */
  async getConversationState() {
    return await this.conversationStateManager.getConversationState(this.conversationId);
  }
  
  /**
   * Store conversation event
   */
  async storeConversationEvent(eventData) {
    try {
      const currentState = await this.conversationStateManager.getConversationState(this.conversationId) || {};
      
      const updatedState = {
        ...currentState,
        lastEvent: eventData,
        lastEventAt: new Date().toISOString(),
        organizationId: this.organizationId,
        leadId: this.leadId
      };
      
      await this.conversationStateManager.storeConversationState(this.conversationId, updatedState);
    } catch (error) {
      logger.error('Failed to store conversation event', {
        conversationId: this.conversationId,
        error: error.message
      });
    }
  }
  
  /**
   * Store transcript
   */
  async storeTranscript(speaker, text) {
    try {
      const currentState = await this.conversationStateManager.getConversationState(this.conversationId) || {};
      
      if (!currentState.transcript) {
        currentState.transcript = [];
      }
      
      currentState.transcript.push({
        speaker,
        text,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 transcript entries
      if (currentState.transcript.length > 100) {
        currentState.transcript = currentState.transcript.slice(-100);
      }
      
      await this.conversationStateManager.storeConversationState(this.conversationId, currentState);
    } catch (error) {
      logger.error('Failed to store transcript', {
        conversationId: this.conversationId,
        error: error.message
      });
    }
  }
  
  /**
   * Register event handler
   */
  onEvent(eventType, handler) {
    if (eventType === '*') {
      if (!this.eventHandlers.has('*')) {
        this.eventHandlers.set('*', []);
      }
      this.eventHandlers.get('*').push(handler);
    } else {
      this.eventHandlers.set(eventType, handler);
    }
  }
  
  /**
   * Send message to ElevenLabs
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        logger.debug('Message sent to ElevenLabs', {
          type: data.type,
          conversationId: this.conversationId
        });
      } catch (error) {
        logger.error('Failed to send message to ElevenLabs', {
          conversationId: this.conversationId,
          error: error.message
        });
      }
    } else {
      logger.warn('Cannot send message: WebSocket not connected', {
        conversationId: this.conversationId,
        readyState: this.ws?.readyState
      });
    }
  }
  
  /**
   * Attempt reconnection
   */
  attemptReconnection() {
    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    
    logger.info('Attempting to reconnect to ElevenLabs', {
      conversationId: this.conversationId,
      attempt: this.reconnectAttempts,
      delay
    });
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnection failed', {
          conversationId: this.conversationId,
          attempt: this.reconnectAttempts,
          error: error.message
        });
      });
    }, delay);
  }
  
  /**
   * Handle connection errors
   */
  handleConnectionError(error) {
    logger.error('ElevenLabs connection error', {
      conversationId: this.conversationId,
      error: error.message
    });
    
    // Update conversation state
    this.conversationStateManager.storeConversationState(this.conversationId, {
      status: 'error',
      lastError: error.message,
      errorAt: new Date().toISOString()
    });
  }
  
  /**
   * Disconnect from ElevenLabs
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }
    
    this.connectionState = 'disconnected';
    
    logger.info('ElevenLabs WebSocket disconnected', {
      conversationId: this.conversationId,
      leadId: this.leadId
    });
  }
  
  // Client tool implementations
  async executeUpdateCustomerDisplay(parameters) {
    // This would integrate with the dashboard to update customer info display
    return {
      success: true,
      message: 'Customer display updated'
    };
  }
  
  async executeShowProductRecommendation(parameters) {
    // This would show product recommendations on the dashboard
    return {
      success: true,
      products_shown: parameters.products?.length || 0,
      message: 'Product recommendations displayed'
    };
  }
  
  async executeTriggerFollowUpAction(parameters) {
    // This would schedule follow-up actions
    return {
      success: true,
      follow_up_id: `followup_${Date.now()}`,
      message: `${parameters.action_type} follow-up scheduled`
    };
  }
  
  async executeTransferToHuman(parameters) {
    // This would handle transfer to human agent
    await this.enableHumanTakeover(parameters.agent_name || 'Human Agent');
    return {
      success: true,
      message: 'Call transferred to human agent'
    };
  }
}

module.exports = { ElevenLabsWebSocketManager };