/**
 * BICI AI Voice System - ElevenLabs WebSocket Manager
 * Advanced WebSocket integration for real-time voice conversations
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { config } = require('../config');
const { ConversationStateManager } = require('./conversation-state');

class ElevenLabsWebSocket extends EventEmitter {
  constructor(organizationId, leadId, agentConfig) {
    super();
    this.organizationId = organizationId;
    this.leadId = leadId;
    this.agentConfig = agentConfig;
    this.ws = null;
    this.connectionState = 'disconnected';
    this.conversationId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.stateManager = new ConversationStateManager();
    
    // Event handlers map for different message types
    this.messageHandlers = new Map();
    this.setupEventHandlers();
  }

  /**
   * Establish WebSocket connection to ElevenLabs
   */
  async connect(signedUrl) {
    try {
      console.log(`🔗 Connecting to ElevenLabs WebSocket for lead ${this.leadId}`);
      
      this.ws = new WebSocket(signedUrl);
      this.connectionState = 'connecting';

      // Connection opened
      this.ws.onopen = () => {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.sendConversationInitiation();
        this.emit('connected', { leadId: this.leadId });
        console.log(`✅ ElevenLabs WebSocket connected for lead ${this.leadId}`);
      };

      // Message received from ElevenLabs
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
        }
      };

      // Connection closed
      this.ws.onclose = (event) => {
        this.connectionState = 'disconnected';
        console.log(`🔌 WebSocket disconnected for lead ${this.leadId}:`, event.code, event.reason);
        
        this.emit('disconnected', { 
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
        console.error(`❌ WebSocket error for lead ${this.leadId}:`, error);
        this.emit('error', { leadId: this.leadId, error });
        this.handleConnectionError(error);
      };

    } catch (error) {
      console.error('❌ Failed to establish WebSocket connection:', error);
      throw error;
    }
  }

  /**
   * Send conversation initiation message with dynamic variables
   */
  sendConversationInitiation() {
    const initMessage = {
      type: 'conversation_initiation',
      conversation_config: {
        agent_id: this.agentConfig.agent_id,
        
        // Dynamic variables from customer context (SOW requirement)
        dynamic_variables: this.buildDynamicVariables(),
        
        // Voice configuration
        voice_config: {
          voice_id: this.agentConfig.voice_id,
          stability: this.agentConfig.stability || config.elevenlabs.voiceConfig.stability,
          similarity_boost: this.agentConfig.similarity || config.elevenlabs.voiceConfig.similarity,
          speed: this.agentConfig.speed || config.elevenlabs.voiceConfig.speed
        },

        // Language and personalization
        language: this.agentConfig.language || config.business.organization.defaultLanguage,
        first_message: this.agentConfig.first_message,

        // Conversation settings
        conversation_config_override: this.agentConfig.conversation_override || {}
      }
    };

    this.send(initMessage);
    console.log(`📤 Sent conversation initiation for lead ${this.leadId}`);
  }

  /**
   * Setup event handlers for different WebSocket message types
   */
  setupEventHandlers() {
    // Server-to-Client Event Handlers
    this.messageHandlers.set('conversation_initiation_metadata', this.handleConversationInit.bind(this));
    this.messageHandlers.set('ping', this.handlePing.bind(this));
    this.messageHandlers.set('audio', this.handleAudioStream.bind(this));
    this.messageHandlers.set('user_transcript', this.handleUserTranscript.bind(this));
    this.messageHandlers.set('agent_response', this.handleAgentResponse.bind(this));
    this.messageHandlers.set('client_tool_call', this.handleClientToolCall.bind(this));
    this.messageHandlers.set('vad_score', this.handleVADScore.bind(this));
    this.messageHandlers.set('tentative_agent_response', this.handleTentativeResponse.bind(this));
    this.messageHandlers.set('conversation_ended', this.handleConversationEnded.bind(this));
    this.messageHandlers.set('error', this.handleErrorMessage.bind(this));
  }

  /**
   * Handle all WebSocket message types
   */
  handleWebSocketMessage(data) {
    const handler = this.messageHandlers.get(data.type);
    
    if (handler) {
      handler(data);
    } else {
      console.warn(`⚠️  Unknown WebSocket message type: ${data.type}`);
      this.emit('unknown_message', { leadId: this.leadId, data });
    }

    // Emit all messages for dashboard streaming
    this.emit('message', { leadId: this.leadId, data });
  }

  /**
   * Event Handler Implementations
   */

  async handleConversationInit(data) {
    this.conversationId = data.conversation_id;
    
    // Store conversation metadata
    await this.stateManager.storeConversationState(this.conversationId, {
      conversation_id: this.conversationId,
      lead_id: this.leadId,
      organization_id: this.organizationId,
      status: 'initiated',
      started_at: new Date().toISOString(),
      agent_config: this.agentConfig
    });

    this.emit('conversation_initiated', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      metadata: data
    });

    console.log(`🎤 Conversation initiated: ${this.conversationId} for lead ${this.leadId}`);
  }

  handlePing(data) {
    // Respond to ping to keep connection alive
    this.send({ type: 'pong' });
  }

  handleAudioStream(data) {
    // Handle incoming audio stream from ElevenLabs
    this.emit('audio_stream', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      audioData: data.chunk,
      sample_rate: data.sample_rate || 16000
    });
  }

  async handleUserTranscript(data) {
    // Log user speech transcript
    await this.stateManager.storeTranscript(this.conversationId, {
      type: 'user',
      text: data.text,
      confidence: data.confidence || 1.0,
      timestamp: new Date().toISOString()
    });

    this.emit('user_transcript', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      transcript: data.text,
      confidence: data.confidence
    });

    console.log(`👤 User: ${data.text}`);
  }

  async handleAgentResponse(data) {
    // Log agent response
    await this.stateManager.storeTranscript(this.conversationId, {
      type: 'agent',
      text: data.text,
      timestamp: new Date().toISOString()
    });

    this.emit('agent_response', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      response: data.text
    });

    console.log(`🤖 Agent: ${data.text}`);
  }

  async handleClientToolCall(data) {
    // Handle client tool calls (dashboard interactions, etc.)
    const { tool_call_id, tool_name, tool_arguments } = data;

    console.log(`🔧 Client tool call: ${tool_name}`, tool_arguments);

    try {
      // Execute the tool and get result
      const result = await this.executeClientTool(tool_name, tool_arguments);
      
      // Send result back to ElevenLabs
      this.sendClientToolResult(tool_call_id, result);

      this.emit('client_tool_call', {
        leadId: this.leadId,
        conversationId: this.conversationId,
        toolName: tool_name,
        arguments: tool_arguments,
        result: result
      });

    } catch (error) {
      console.error(`❌ Client tool execution failed: ${tool_name}`, error);
      
      // Send error result
      this.sendClientToolResult(tool_call_id, {
        success: false,
        error: error.message
      });
    }
  }

  handleVADScore(data) {
    // Voice Activity Detection score
    this.emit('vad_score', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      score: data.score,
      is_speaking: data.score > 0.5
    });
  }

  handleTentativeResponse(data) {
    // Tentative agent response (before finalization)
    this.emit('tentative_response', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      tentativeText: data.text
    });
  }

  async handleConversationEnded(data) {
    // Conversation ended
    await this.stateManager.storeConversationState(this.conversationId, {
      status: 'ended',
      ended_at: new Date().toISOString(),
      end_reason: data.reason || 'unknown'
    });

    this.emit('conversation_ended', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      reason: data.reason
    });

    console.log(`🏁 Conversation ended: ${this.conversationId}`);
  }

  handleErrorMessage(data) {
    console.error(`❌ ElevenLabs error for lead ${this.leadId}:`, data.error);
    
    this.emit('elevenlabs_error', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      error: data.error
    });
  }

  /**
   * Client-to-Server Message Senders
   */

  sendUserAudio(audioChunk) {
    if (this.connectionState === 'connected') {
      this.send({
        type: 'user_audio_chunk',
        chunk: audioChunk, // Base64 encoded audio
        sample_rate: 16000,
        format: 'pcm'
      });
    } else {
      console.warn('⚠️  Cannot send audio: WebSocket not connected');
    }
  }

  sendContextualUpdate(updateText) {
    this.send({
      type: 'contextual_update',
      text: updateText
    });

    console.log(`📝 Sent contextual update: ${updateText}`);
  }

  sendUserMessage(message) {
    this.send({
      type: 'user_message',
      text: message
    });

    console.log(`💬 Sent user message: ${message}`);
  }

  sendUserActivity() {
    this.send({
      type: 'user_activity'
    });
  }

  sendClientToolResult(toolCallId, result) {
    this.send({
      type: 'client_tool_result',
      tool_call_id: toolCallId,
      result: result
    });

    console.log(`🔧 Sent tool result for ${toolCallId}:`, result);
  }

  /**
   * Execute client tool calls
   */
  async executeClientTool(toolName, arguments) {
    switch (toolName) {
      case 'update_customer_display':
        return await this.updateCustomerDisplay(arguments);
      
      case 'show_product_recommendation':
        return await this.showProductRecommendation(arguments);
      
      case 'trigger_follow_up_action':
        return await this.triggerFollowUpAction(arguments);
      
      default:
        throw new Error(`Unknown client tool: ${toolName}`);
    }
  }

  async updateCustomerDisplay(args) {
    // Update customer information on dashboard
    this.emit('dashboard_update', {
      type: 'customer_display_update',
      leadId: this.leadId,
      customerData: args.customer_data,
      action: args.action
    });

    return {
      success: true,
      message: `Customer display ${args.action} completed`
    };
  }

  async showProductRecommendation(args) {
    // Show product recommendations on dashboard
    this.emit('dashboard_update', {
      type: 'product_recommendation',
      leadId: this.leadId,
      products: args.products,
      reason: args.reason
    });

    return {
      success: true,
      products_shown: args.products.length,
      message: 'Product recommendations displayed'
    };
  }

  async triggerFollowUpAction(args) {
    // Schedule follow-up action
    const followUpId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // In a real implementation, this would integrate with scheduling system
    this.emit('follow_up_scheduled', {
      followUpId: followUpId,
      leadId: this.leadId,
      actionType: args.action_type,
      delayMinutes: args.delay_minutes,
      messageTemplate: args.message_template
    });

    return {
      success: true,
      follow_up_id: followUpId,
      message: `${args.action_type} follow-up scheduled for ${args.delay_minutes} minutes`
    };
  }

  /**
   * Connection Management
   */

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached for lead ${this.leadId}`);
      this.emit('reconnection_failed', { leadId: this.leadId });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} for lead ${this.leadId} in ${delay}ms`);

    setTimeout(async () => {
      try {
        // Get new signed URL for reconnection
        const signedUrl = await this.getSignedURL();
        await this.connect(signedUrl);
      } catch (error) {
        console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnection();
      }
    }, delay);
  }

  handleConnectionError(error) {
    console.error(`❌ WebSocket connection error for lead ${this.leadId}:`, error);
    
    // Store error for debugging
    this.stateManager.storeConversationState(this.conversationId || 'unknown', {
      status: 'error',
      error: {
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Utility Methods
   */

  send(message) {
    if (this.ws && this.connectionState === 'connected') {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn(`⚠️  Cannot send message: WebSocket not connected (state: ${this.connectionState})`);
    }
  }

  buildDynamicVariables() {
    return this.agentConfig.dynamic_variables || {};
  }

  async getSignedURL() {
    // Get signed URL for WebSocket connection
    try {
      const response = await fetch(config.elevenlabs.endpoints.signedUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': config.elevenlabs.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: this.agentConfig.agent_id
        })
      });

      const data = await response.json();
      return data.signed_url;
    } catch (error) {
      console.error('❌ Failed to get signed URL:', error);
      throw error;
    }
  }

  disconnect() {
    if (this.ws) {
      this.connectionState = 'disconnecting';
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  isConnected() {
    return this.connectionState === 'connected';
  }
}

module.exports = { ElevenLabsWebSocket };