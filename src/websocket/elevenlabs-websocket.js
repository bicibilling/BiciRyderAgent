/**
 * ElevenLabs WebSocket Connection Manager
 * Handles real-time communication with ElevenLabs Conversational AI
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export class ElevenLabsWebSocket extends EventEmitter {
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
    this.heartbeatInterval = null;
    this.setupEventHandlers();
  }

  /**
   * Establish WebSocket connection to ElevenLabs
   * @param {string} signedUrl - Signed WebSocket URL from ElevenLabs API
   */
  async connect(signedUrl) {
    try {
      console.log(`🔗 Connecting to ElevenLabs WebSocket for lead ${this.leadId}`);
      
      this.ws = new WebSocket(signedUrl);
      
      // Connection opened
      this.ws.onopen = () => {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.sendConversationInitiation();
        console.log(`✅ ElevenLabs WebSocket connected for lead ${this.leadId}`);
        this.emit('connected', { leadId: this.leadId, organizationId: this.organizationId });
      };
      
      // Message received
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      // Connection closed
      this.ws.onclose = (event) => {
        this.connectionState = 'disconnected';
        this.stopHeartbeat();
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
        this.emit('error', { leadId: this.leadId, error: error.message });
        this.handleConnectionError(error);
      };
      
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
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
        
        // Dynamic variables from customer context
        dynamic_variables: this.buildDynamicVariables(),
        
        // Voice configuration
        voice_config: {
          voice_id: this.agentConfig.voice_id,
          stability: this.agentConfig.stability || 0.65,
          similarity_boost: this.agentConfig.similarity || 0.85,
          speed: this.agentConfig.speed || 1.0
        },
        
        // Language and personalization
        language: this.agentConfig.language || 'en',
        first_message: this.agentConfig.first_message || "Hi! How can I help you today?"
      }
    };
    
    this.send(initMessage);
    console.log(`📤 Sent conversation initiation for lead ${this.leadId}`);
  }

  /**
   * Build dynamic variables for personalization
   */
  buildDynamicVariables() {
    return {
      // Customer context
      customer_name: this.agentConfig.customer_name || 'Valued Customer',
      customer_phone: this.agentConfig.customer_phone || '',
      customer_email: this.agentConfig.customer_email || '',
      customer_tier: this.agentConfig.customer_tier || 'New',
      previous_purchases: this.agentConfig.previous_purchases || '[]',
      
      // Conversation context
      conversation_context: this.agentConfig.conversation_context || 'First-time caller',
      previous_summary: this.agentConfig.previous_summary || 'No previous interactions',
      lead_status: this.agentConfig.lead_status || 'New',
      interaction_count: this.agentConfig.interaction_count || '0',
      last_contact_date: this.agentConfig.last_contact_date || 'Never',
      
      // Business context
      organization_name: this.agentConfig.organization_name || 'Bici Bike Store',
      organization_id: this.organizationId,
      store_hours: this.agentConfig.store_hours || 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
      current_promotions: this.agentConfig.current_promotions || 'Ask about our current bike deals!',
      
      // Call context
      caller_type: this.agentConfig.caller_type || 'inbound',
      call_reason: this.agentConfig.call_reason || 'general_inquiry',
      urgency_level: this.agentConfig.urgency_level || 'medium',
      preferred_language: this.agentConfig.preferred_language || 'en'
    };
  }

  /**
   * Handle all WebSocket message types from ElevenLabs
   */
  handleWebSocketMessage(data) {
    // Emit raw message for dashboard
    this.emit('message', data);

    switch (data.type) {
      // Server-to-Client Events
      case 'conversation_initiation_metadata':
        this.handleConversationInit(data);
        break;
        
      case 'ping':
        this.handlePing(data);
        break;
        
      case 'audio':
        this.handleAudioStream(data);
        break;
        
      case 'user_transcript':
        this.handleUserTranscript(data);
        break;
        
      case 'agent_response':
        this.handleAgentResponse(data);
        break;
        
      case 'client_tool_call':
        this.handleClientToolCall(data);
        break;
        
      case 'vad_score':
        this.handleVADScore(data);
        break;
        
      case 'tentative_agent_response':
        this.handleTentativeResponse(data);
        break;
        
      case 'conversation_ended':
        this.handleConversationEnded(data);
        break;
        
      default:
        console.warn(`Unknown WebSocket message type: ${data.type}`);
    }
  }

  /**
   * Handle conversation initialization metadata
   */
  handleConversationInit(data) {
    this.conversationId = data.conversation_id;
    console.log(`🆔 Conversation initialized: ${this.conversationId}`);
    
    this.emit('conversation_initialized', {
      conversationId: this.conversationId,
      leadId: this.leadId,
      organizationId: this.organizationId,
      metadata: data
    });
  }

  /**
   * Handle ping messages for connection health
   */
  handlePing(data) {
    // Respond with pong
    this.send({ type: 'pong', id: data.id });
  }

  /**
   * Handle audio stream from agent
   */
  handleAudioStream(data) {
    this.emit('audio_stream', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      audio: data.chunk,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle user speech transcript
   */
  handleUserTranscript(data) {
    console.log(`👤 User said: "${data.text}"`);
    
    this.emit('user_transcript', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      text: data.text,
      is_final: data.is_final,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle agent response text
   */
  handleAgentResponse(data) {
    console.log(`🤖 Agent said: "${data.text}"`);
    
    this.emit('agent_response', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      text: data.text,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle client tool calls for dashboard integration
   */
  handleClientToolCall(data) {
    console.log(`🔧 Client tool called: ${data.tool_name}`);
    
    this.emit('client_tool_call', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      toolName: data.tool_name,
      parameters: data.parameters,
      toolCallId: data.tool_call_id,
      timestamp: new Date().toISOString()
    });
    
    // Execute client tool and send result
    this.executeClientTool(data.tool_name, data.parameters, data.tool_call_id);
  }

  /**
   * Handle voice activity detection scores
   */
  handleVADScore(data) {
    this.emit('vad_score', {
      leadId: this.leadId,
      score: data.score,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle tentative agent responses (typing indicators)
   */
  handleTentativeResponse(data) {
    this.emit('tentative_response', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      text: data.text,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle conversation ended
   */
  handleConversationEnded(data) {
    console.log(`🏁 Conversation ended: ${this.conversationId}`);
    
    this.emit('conversation_ended', {
      leadId: this.leadId,
      conversationId: this.conversationId,
      reason: data.reason,
      duration: data.duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Execute client tools for dashboard interactions
   */
  async executeClientTool(toolName, parameters, toolCallId) {
    try {
      let result = { success: false, message: 'Tool not implemented' };

      switch (toolName) {
        case 'update_customer_display':
          result = await this.updateCustomerDisplay(parameters.customer_data, parameters.action);
          break;
          
        case 'show_product_recommendation':
          result = await this.showProductRecommendation(parameters.products, parameters.reason);
          break;
          
        case 'trigger_follow_up_action':
          result = await this.triggerFollowUpAction(
            parameters.action_type, 
            parameters.delay_minutes, 
            parameters.message_template
          );
          break;
          
        case 'update_conversation_notes':
          result = await this.updateConversationNotes(parameters.notes, parameters.classification);
          break;
          
        case 'show_call_analytics':
          result = await this.showCallAnalytics(parameters.metrics);
          break;
          
        default:
          console.warn(`Unknown client tool: ${toolName}`);
      }

      // Send tool result back to ElevenLabs
      this.sendClientToolResult(toolCallId, result);
      
    } catch (error) {
      console.error(`Error executing client tool ${toolName}:`, error);
      this.sendClientToolResult(toolCallId, { 
        success: false, 
        error: error.message 
      });
    }
  }

  /**
   * Client tool implementations
   */
  async updateCustomerDisplay(customerData, action) {
    this.emit('dashboard_update', {
      type: 'customer_display_update',
      leadId: this.leadId,
      customerData: customerData,
      action: action,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: `Customer display ${action} completed`
    };
  }

  async showProductRecommendation(products, reason) {
    this.emit('dashboard_update', {
      type: 'product_recommendation',
      leadId: this.leadId,
      products: products,
      reason: reason,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      products_shown: products.length,
      message: 'Product recommendations displayed'
    };
  }

  async triggerFollowUpAction(actionType, delayMinutes, messageTemplate) {
    // Schedule follow-up action
    const followUpId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('schedule_followup', {
      followUpId: followUpId,
      leadId: this.leadId,
      actionType: actionType,
      delayMinutes: delayMinutes,
      messageTemplate: messageTemplate,
      scheduledFor: new Date(Date.now() + (delayMinutes * 60 * 1000)),
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      follow_up_id: followUpId,
      message: `${actionType} follow-up scheduled for ${delayMinutes} minutes`
    };
  }

  async updateConversationNotes(notes, classification) {
    this.emit('dashboard_update', {
      type: 'conversation_notes_update',
      leadId: this.leadId,
      conversationId: this.conversationId,
      notes: notes,
      classification: classification,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: 'Conversation notes updated'
    };
  }

  async showCallAnalytics(metrics) {
    this.emit('dashboard_update', {
      type: 'call_analytics',
      leadId: this.leadId,
      conversationId: this.conversationId,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: 'Call analytics displayed'
    };
  }

  /**
   * Client-to-Server Event Senders
   */
  sendUserAudio(audioChunk) {
    if (this.connectionState === 'connected') {
      this.send({
        type: 'user_audio_chunk',
        chunk: audioChunk, // Base64 encoded audio
        sample_rate: 16000,
        format: 'pcm'
      });
    }
  }

  sendContextualUpdate(updateText) {
    this.send({
      type: 'contextual_update', 
      text: updateText
    });
  }

  sendUserMessage(message) {
    this.send({
      type: 'user_message',
      text: message
    });
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
  }

  /**
   * Send message to WebSocket
   */
  send(data) {
    if (this.ws && this.connectionState === 'connected') {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Connection management
   */
  setupEventHandlers() {
    this.setMaxListeners(50); // Increase max listeners for dashboard connections
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionState === 'connected') {
        this.send({ type: 'heartbeat', timestamp: new Date().toISOString() });
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for lead ${this.leadId}`);
      this.emit('max_reconnect_attempts', { leadId: this.leadId });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        // Get new signed URL and reconnect
        const newSignedUrl = await this.getNewSignedUrl();
        await this.connect(newSignedUrl);
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  async getNewSignedUrl() {
    // This should call your backend to get a new signed URL
    const response = await fetch('/api/elevenlabs/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: this.organizationId,
        leadId: this.leadId
      })
    });
    
    const data = await response.json();
    return data.signedUrl;
  }

  handleConnectionError(error) {
    this.emit('connection_error', {
      leadId: this.leadId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Gracefully close connection
   */
  disconnect() {
    if (this.ws) {
      this.connectionState = 'disconnecting';
      this.stopHeartbeat();
      this.ws.close(1000, 'Client disconnect');
      this.emit('disconnect_initiated', { leadId: this.leadId });
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      leadId: this.leadId,
      organizationId: this.organizationId,
      conversationId: this.conversationId,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      connected: this.connectionState === 'connected'
    };
  }
}

export default ElevenLabsWebSocket;