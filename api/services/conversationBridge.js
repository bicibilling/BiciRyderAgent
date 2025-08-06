/**
 * Conversation Bridge Service
 * Bridges WebSocket connections with ElevenLabs and SMS services
 */

const ElevenLabsService = require('./elevenLabsService');
const twilioService = require('./twilioService');

class ConversationBridge {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.elevenLabsService = new ElevenLabsService();
    this.twilioService = twilioService;
    this.activeConversations = new Map(); // leadId -> conversation state
    
    // Initialize ElevenLabs service
    this.init();
    
    // Setup WebSocket event handlers
    this.setupWebSocketHandlers();
    
    // Setup ElevenLabs event handlers
    this.setupElevenLabsHandlers();
  }
  
  async init() {
    const initialized = await this.elevenLabsService.initialize();
    if (initialized) {
      console.log('✅ ConversationBridge initialized with ElevenLabs');
    } else {
      console.warn('⚠️ ConversationBridge initialized without ElevenLabs');
    }
  }
  
  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    // Handle chat messages from agents
    this.wsManager.on('chat_message', async (data) => {
      await this.handleAgentMessage(data);
    });
    
    // Handle conversation history requests
    this.wsManager.on('conversation_history_requested', async (data) => {
      await this.handleConversationHistoryRequest(data);
    });
    
    // Handle conversation takeover
    this.wsManager.on('conversation_takeover', async (data) => {
      await this.handleConversationTakeover(data);
    });
    
    // Handle conversation release
    this.wsManager.on('conversation_release', async (data) => {
      await this.handleConversationRelease(data);
    });
  }
  
  /**
   * Setup ElevenLabs event handlers
   */
  setupElevenLabsHandlers() {
    // Handle outbound call initiated
    this.elevenLabsService.on('outbound_call_initiated', (data) => {
      this.handleOutboundCallInitiated(data);
    });
    
    // Handle user transcript
    this.elevenLabsService.on('user_transcript', (data) => {
      this.handleUserTranscript(data);
    });
    
    // Handle agent response
    this.elevenLabsService.on('agent_response', (data) => {
      this.handleAgentResponse(data);
    });
    
    // Handle tool calls
    this.elevenLabsService.on('tool_call', async (data) => {
      await this.handleToolCall(data);
    });
    
    // Handle conversation end
    this.elevenLabsService.on('conversation_ended', (data) => {
      this.handleConversationEnded(data);
    });
  }
  
  /**
   * Handle agent message from WebSocket
   */
  async handleAgentMessage(data) {
    const { conversationId, phoneNumber, organizationId, message, messageType, agentId, agentEmail } = data;
    
    try {
      console.log(`👨‍💼 Agent message: ${agentEmail} -> ${phoneNumber}: "${message}"`);
      
      if (messageType === 'sms') {
        // Send SMS via Twilio
        await this.sendSMS(phoneNumber, message, organizationId);
      } else {
        // Send via ElevenLabs if there's an active conversation
        const activeConv = this.activeConversations.get(conversationId);
        if (activeConv && activeConv.elevenLabsConversationId) {
          this.elevenLabsService.sendUserMessage(activeConv.elevenLabsConversationId, message);
        } else {
          // Fallback to SMS if no active voice conversation
          await this.sendSMS(phoneNumber, message, organizationId);
        }
      }
      
      // Update conversation state
      this.updateConversationState(conversationId, {
        lastAgentMessage: message,
        lastActivity: new Date().toISOString(),
        agentId: agentId,
        isUnderHumanControl: true
      });
      
    } catch (error) {
      console.error('❌ Failed to handle agent message:', error);
      
      // Send error back to WebSocket client
      this.wsManager.broadcastToConversation(conversationId, {
        type: 'message_send_error',
        error: error.message,
        originalMessage: message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Send SMS via Twilio
   */
  async sendSMS(toPhoneNumber, message, organizationId) {
    try {
      if (!this.twilioService || !this.twilioService.sendSMS) {
        throw new Error('Twilio SMS service not available');
      }
      
      const result = await this.twilioService.sendSMS(toPhoneNumber, message, {
        organizationId: organizationId
      });
      
      console.log(`📱 SMS sent successfully: ${result.sid}`);
      return result;
      
    } catch (error) {
      console.error('❌ Failed to send SMS:', error);
      throw error;
    }
  }
  
  /**
   * Handle conversation history request
   */
  async handleConversationHistoryRequest(data) {
    const { connectionId, conversationId, phoneNumber, organizationId } = data;
    
    try {
      // TODO: Fetch real conversation history from database
      // For now, return mock data that's already handled by WebSocket manager
      console.log(`📜 Conversation history requested for ${phoneNumber}`);
      
    } catch (error) {
      console.error('❌ Failed to fetch conversation history:', error);
    }
  }
  
  /**
   * Handle conversation takeover
   */
  async handleConversationTakeover(data) {
    const { conversationId, agentId, agentEmail, reason } = data;
    
    try {
      console.log(`👨‍💼 Conversation takeover: ${agentEmail} (${reason})`);
      
      // Update conversation state
      this.updateConversationState(conversationId, {
        isUnderHumanControl: true,
        agentId: agentId,
        agentEmail: agentEmail,
        takeoverReason: reason,
        takeoverAt: new Date().toISOString()
      });
      
      // Pause ElevenLabs conversation if active
      const activeConv = this.activeConversations.get(conversationId);
      if (activeConv && activeConv.elevenLabsConversationId) {
        await this.elevenLabsService.transferToHuman(
          activeConv.elevenLabsConversationId, 
          reason, 
          { agentEmail, agentId }
        );
      }
      
    } catch (error) {
      console.error('❌ Failed to handle conversation takeover:', error);
    }
  }
  
  /**
   * Handle conversation release
   */
  async handleConversationRelease(data) {
    const { conversationId, agentId, agentEmail, summary } = data;
    
    try {
      console.log(`🤖 Conversation released: ${agentEmail} -> AI`);
      
      // Update conversation state
      this.updateConversationState(conversationId, {
        isUnderHumanControl: false,
        agentId: null,
        agentEmail: null,
        releaseSummary: summary,
        releasedAt: new Date().toISOString()
      });
      
      // Resume ElevenLabs conversation if active
      const activeConv = this.activeConversations.get(conversationId);
      if (activeConv && activeConv.elevenLabsConversationId) {
        await this.elevenLabsService.resumeAIControl(
          activeConv.elevenLabsConversationId, 
          summary
        );
      }
      
    } catch (error) {
      console.error('❌ Failed to handle conversation release:', error);
    }
  }
  
  /**
   * Handle outbound call initiated
   */
  handleOutboundCallInitiated(data) {
    const { phoneNumber, conversationId, organizationId, leadId } = data;
    
    console.log(`📞 Outbound call initiated: ${phoneNumber}`);
    
    // Update conversation state
    this.updateConversationState(leadId || conversationId, {
      elevenLabsConversationId: conversationId,
      phoneNumber: phoneNumber,
      organizationId: organizationId,
      callType: 'outbound',
      callInitiatedAt: new Date().toISOString(),
      status: 'call_active'
    });
    
    // Broadcast to WebSocket clients
    this.wsManager.broadcastToOrganization(organizationId, {
      type: 'call_initiated',
      conversationId: leadId || conversationId,
      phoneNumber: phoneNumber,
      organizationId: organizationId,
      callType: 'outbound',
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle user transcript from ElevenLabs
   */
  handleUserTranscript(data) {
    const { conversationId, text, confidence, timestamp, speaker } = data;
    
    console.log(`🎤 User transcript: "${text}" (${confidence}%)`);
    
    // Find conversation by ElevenLabs conversation ID
    const leadId = this.findLeadByElevenLabsConversationId(conversationId);
    if (!leadId) return;
    
    // Broadcast to WebSocket clients
    this.wsManager.broadcastToConversation(leadId, {
      type: 'sms_received', // Use same type as SMS for consistency
      conversationId: leadId,
      elevenLabsConversationId: conversationId,
      message: {
        id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: text,
        sentBy: 'user',
        timestamp: timestamp || new Date().toISOString(),
        type: 'voice',
        confidence: confidence,
        status: 'delivered'
      },
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle agent response from ElevenLabs
   */
  handleAgentResponse(data) {
    const { conversationId, text, confidence, timestamp, speaker } = data;
    
    console.log(`🤖 Agent response: "${text}"`);
    
    // Find conversation by ElevenLabs conversation ID
    const leadId = this.findLeadByElevenLabsConversationId(conversationId);
    if (!leadId) return;
    
    // Broadcast to WebSocket clients
    this.wsManager.broadcastToConversation(leadId, {
      type: 'agent_message_sent',
      conversationId: leadId,
      elevenLabsConversationId: conversationId,
      message: {
        id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: text,
        sentBy: 'agent',
        timestamp: timestamp || new Date().toISOString(),
        type: 'voice',
        confidence: confidence,
        status: 'delivered'
      },
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle tool calls from ElevenLabs
   */
  async handleToolCall(data) {
    const { conversationId, toolName, parameters, toolCallId, resolve, reject } = data;
    
    console.log(`🔧 Tool call: ${toolName}`, parameters);
    
    try {
      // Handle different tool types
      let result;
      
      switch (toolName) {
        case 'get_store_hours':
          result = {
            hours: 'Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM',
            timezone: 'America/Toronto',
            current_status: this.getStoreStatus()
          };
          break;
          
        case 'check_inventory':
          result = await this.checkInventory(parameters);
          break;
          
        case 'book_appointment':
          result = await this.bookAppointment(parameters);
          break;
          
        case 'create_lead':
          result = await this.createLead(parameters);
          break;
          
        case 'transfer_to_human':
          result = await this.initiateHumanTransfer(conversationId, parameters);
          break;
          
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
      resolve(result);
      
    } catch (error) {
      console.error(`❌ Tool call failed: ${toolName}`, error);
      reject(error);
    }
  }
  
  /**
   * Handle conversation ended
   */
  handleConversationEnded(data) {
    const { conversationId, reason, summary } = data;
    
    console.log(`✅ Conversation ended: ${conversationId} (${reason})`);
    
    // Find conversation by ElevenLabs conversation ID
    const leadId = this.findLeadByElevenLabsConversationId(conversationId);
    if (leadId) {
      // Update conversation state
      this.updateConversationState(leadId, {
        status: 'completed',
        endReason: reason,
        endSummary: summary,
        endedAt: new Date().toISOString()
      });
      
      // Broadcast to WebSocket clients
      this.wsManager.broadcastToConversation(leadId, {
        type: 'call_ended',
        conversationId: leadId,
        elevenLabsConversationId: conversationId,
        reason: reason,
        summary: summary,
        timestamp: new Date().toISOString()
      });
      
      // Clean up conversation state after delay
      setTimeout(() => {
        this.activeConversations.delete(leadId);
      }, 300000); // 5 minutes
    }
  }
  
  /**
   * Update conversation state
   */
  updateConversationState(conversationId, updates) {
    const current = this.activeConversations.get(conversationId) || {};
    this.activeConversations.set(conversationId, {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    });
  }
  
  /**
   * Find lead ID by ElevenLabs conversation ID
   */
  findLeadByElevenLabsConversationId(elevenLabsConversationId) {
    for (const [leadId, conversation] of this.activeConversations.entries()) {
      if (conversation.elevenLabsConversationId === elevenLabsConversationId) {
        return leadId;
      }
    }
    return null;
  }
  
  /**
   * Get current store status
   */
  getStoreStatus() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Business hours: Monday-Friday 9AM-7PM, Saturday-Sunday 10AM-6PM
    let isOpen = false;
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      isOpen = hour >= 9 && hour < 19;
    } else {
      isOpen = hour >= 10 && hour < 18;
    }
    
    return isOpen ? 'open' : 'closed';
  }
  
  /**
   * Check inventory (mock implementation)
   */
  async checkInventory(parameters) {
    const { product_name, size, color } = parameters;
    
    // Mock inventory check
    return {
      product: product_name,
      size: size,
      color: color,
      in_stock: Math.random() > 0.3, // 70% chance in stock
      quantity: Math.floor(Math.random() * 15) + 1,
      price: Math.floor(Math.random() * 2000) + 299,
      estimated_delivery: '3-5 business days'
    };
  }
  
  /**
   * Book appointment (mock implementation)
   */
  async bookAppointment(parameters) {
    const { service_type, preferred_time, customer_name, phone_number } = parameters;
    
    // Mock appointment booking
    return {
      appointment_id: `apt_${Date.now()}`,
      confirmed: true,
      service: service_type,
      scheduled_time: preferred_time,
      customer_name: customer_name,
      phone_number: phone_number,
      location: 'BICI Bike Store - Main Location',
      confirmation_sent: true
    };
  }
  
  /**
   * Create lead (mock implementation)
   */
  async createLead(parameters) {
    const { customer_name, phone_number, interest_type, budget } = parameters;
    
    // Mock lead creation
    return {
      lead_id: `lead_${Date.now()}`,
      customer_name: customer_name,
      phone_number: phone_number,
      status: 'created',
      interest_type: interest_type,
      budget: budget,
      score: Math.floor(Math.random() * 40) + 60, // 60-100 score
      next_action: 'follow_up_call',
      created_at: new Date().toISOString()
    };
  }
  
  /**
   * Initiate human transfer
   */
  async initiateHumanTransfer(conversationId, parameters) {
    const { reason, urgency, context } = parameters;
    
    // Find lead by ElevenLabs conversation ID
    const leadId = this.findLeadByElevenLabsConversationId(conversationId);
    if (!leadId) {
      throw new Error('Conversation not found');
    }
    
    // Update conversation state
    this.updateConversationState(leadId, {
      transferRequested: true,
      transferReason: reason,
      transferUrgency: urgency || 'normal',
      transferContext: context
    });
    
    // Broadcast transfer request to WebSocket clients
    this.wsManager.broadcastToConversation(leadId, {
      type: 'human_transfer_requested',
      conversationId: leadId,
      elevenLabsConversationId: conversationId,
      reason: reason,
      urgency: urgency,
      context: context,
      timestamp: new Date().toISOString()
    });
    
    return {
      transfer_requested: true,
      conversation_id: leadId,
      reason: reason,
      estimated_wait_time: '2-5 minutes',
      queue_position: 1
    };
  }
  
  /**
   * Start outbound call
   */
  async startOutboundCall(phoneNumber, leadId, organizationId, options = {}) {
    try {
      console.log(`📞 Starting outbound call to ${phoneNumber}`);
      
      // Get agent configuration
      const agentId = process.env.ELEVENLABS_AGENT_ID;
      if (!agentId) {
        throw new Error('ElevenLabs agent ID not configured');
      }
      
      // Prepare conversation data
      const conversationData = {
        leadId: leadId,
        organizationId: organizationId,
        initiatedBy: 'dashboard',
        dynamicVariables: options.dynamicVariables || {}
      };
      
      // Initiate call via ElevenLabs
      const result = await this.elevenLabsService.initiateOutboundCall(
        phoneNumber, 
        agentId, 
        conversationData
      );
      
      if (result.success) {
        // Update conversation state
        this.updateConversationState(leadId, {
          elevenLabsConversationId: result.conversation_id,
          callId: result.call_id,
          phoneNumber: phoneNumber,
          organizationId: organizationId,
          callType: 'outbound',
          status: 'call_initiated',
          initiatedAt: new Date().toISOString()
        });
        
        // Create ElevenLabs WebSocket connection for real-time communication
        try {
          await this.createElevenLabsConnection(result.conversation_id, agentId, organizationId, {
            phoneNumber: phoneNumber,
            leadId: leadId,
            callType: 'outbound'
          });
        } catch (wsError) {
          console.warn('⚠️ Failed to create ElevenLabs WebSocket connection:', wsError.message);
          // Don't fail the call for WebSocket connection issues
        }
        
        return {
          success: true,
          conversationId: result.conversation_id,
          callId: result.call_id,
          leadId: leadId
        };
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error(`❌ Failed to start outbound call:`, error);
      throw error;
    }
  }
  
  /**
   * Create ElevenLabs WebSocket connection for real-time conversation
   */
  async createElevenLabsConnection(conversationId, agentId, organizationId, metadata = {}) {
    try {
      console.log(`🔌 Creating ElevenLabs WebSocket connection for conversation ${conversationId}`);
      
      // Create WebSocket connection via ElevenLabs service
      const connection = await this.elevenLabsService.createConversationWebSocket(
        conversationId,
        agentId,
        organizationId,
        metadata
      );
      
      if (connection) {
        console.log(`✅ ElevenLabs WebSocket connected for ${conversationId}`);
        return connection;
      }
      
    } catch (error) {
      console.error(`❌ Failed to create ElevenLabs WebSocket connection:`, error);
      throw error;
    }
  }
  
  /**
   * Get conversation metrics
   */
  getMetrics() {
    const activeCount = this.activeConversations.size;
    let underHumanControl = 0;
    let activeCalls = 0;
    
    for (const conversation of this.activeConversations.values()) {
      if (conversation.isUnderHumanControl) underHumanControl++;
      if (conversation.status === 'call_active') activeCalls++;
    }
    
    return {
      totalActiveConversations: activeCount,
      conversationsUnderHumanControl: underHumanControl,
      activeCalls: activeCalls,
      elevenLabsConnected: this.elevenLabsService.isInitialized,
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Close all connections and cleanup
   */
  async close() {
    console.log('🔌 Closing ConversationBridge');
    
    // Close ElevenLabs connections
    this.elevenLabsService.closeAllConnections();
    
    // Clear conversation state
    this.activeConversations.clear();
  }
}

module.exports = ConversationBridge;