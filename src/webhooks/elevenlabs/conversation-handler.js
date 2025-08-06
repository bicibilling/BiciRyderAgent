const { webhookLogger } = require('../../config/logger');
const { validateBody, schemas } = require('../../utils/validation');
const database = require('../../config/database');

class ElevenLabsConversationHandler {
  constructor() {
    this.logger = webhookLogger.child({ webhook: 'elevenlabs-conversation' });
    this.redis = database.getRedis();
    this.supabase = database.getSupabase();
  }

  /**
   * Handle ElevenLabs conversation webhook events
   */
  async handleWebhook(req, res) {
    try {
      const {
        conversation_id,
        agent_id,
        type,
        timestamp,
        data
      } = req.body;

      this.logger.info('Processing ElevenLabs webhook', {
        conversation_id,
        agent_id,
        type,
        timestamp
      });

      // Process based on event type
      switch (type) {
        case 'conversation_started':
          await this.handleConversationStarted(conversation_id, data);
          break;
          
        case 'conversation_ended':
          await this.handleConversationEnded(conversation_id, data);
          break;
          
        case 'user_transcript':
          await this.handleUserTranscript(conversation_id, data);
          break;
          
        case 'agent_response':
          await this.handleAgentResponse(conversation_id, data);
          break;
          
        case 'tool_call':
          await this.handleToolCall(conversation_id, data);
          break;
          
        case 'error':
          await this.handleError(conversation_id, data);
          break;
          
        default:
          this.logger.warn('Unknown webhook event type', {
            conversation_id,
            type,
            data
          });
      }

      // Store webhook event
      await this.storeWebhookEvent({
        conversation_id,
        agent_id,
        type,
        timestamp,
        data,
        processed_at: new Date().toISOString()
      });

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      this.logger.error('Webhook processing failed', {
        error: error.message,
        body: req.body
      });
      
      res.status(500).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  }

  /**
   * Handle conversation started event
   */
  async handleConversationStarted(conversationId, data) {
    try {
      this.logger.info('Conversation started', {
        conversation_id: conversationId,
        caller_id: data.caller_id,
        called_number: data.called_number
      });

      // Extract caller information
      const callerPhone = data.caller_id;
      const organizationId = await this.getOrganizationByPhoneNumber(data.called_number);

      // Create conversation record
      const conversation = {
        id: conversationId,
        organization_id: organizationId,
        phone_number_normalized: callerPhone,
        status: 'active',
        started_at: new Date().toISOString(),
        agent_id: data.agent_id,
        metadata: {
          caller_id: data.caller_id,
          called_number: data.called_number,
          call_sid: data.call_sid
        }
      };

      // Store in database
      await this.supabase
        .from('conversations')
        .insert(conversation);

      // Cache conversation state
      await this.redis.setex(
        `conversation:${conversationId}`,
        3600, // 1 hour
        JSON.stringify({
          ...conversation,
          cached_at: new Date().toISOString()
        })
      );

      // Broadcast to dashboard
      await this.broadcastToDashboard({
        type: 'conversation_started',
        conversation_id: conversationId,
        organization_id: organizationId,
        caller_phone: callerPhone,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle conversation started', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Handle conversation ended event
   */
  async handleConversationEnded(conversationId, data) {
    try {
      this.logger.info('Conversation ended', {
        conversation_id: conversationId,
        duration: data.duration_ms,
        reason: data.end_reason
      });

      // Update conversation record
      await this.supabase
        .from('conversations')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          duration_ms: data.duration_ms,
          end_reason: data.end_reason,
          metadata: data
        })
        .eq('id', conversationId);

      // Generate conversation summary
      const summary = await this.generateConversationSummary(conversationId, data);

      // Store summary
      await this.supabase
        .from('conversation_summaries')
        .insert({
          conversation_id: conversationId,
          summary: summary.summary,
          key_points: summary.key_points,
          action_items: summary.action_items,
          lead_score: summary.lead_score,
          created_at: new Date().toISOString()
        });

      // Clean up cache
      await this.redis.del(`conversation:${conversationId}`);

      // Broadcast to dashboard
      await this.broadcastToDashboard({
        type: 'conversation_ended',
        conversation_id: conversationId,
        duration: data.duration_ms,
        summary: summary,
        timestamp: new Date().toISOString()
      });

      // Trigger follow-up actions if needed
      await this.triggerFollowUpActions(conversationId, summary);

    } catch (error) {
      this.logger.error('Failed to handle conversation ended', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Handle user transcript event
   */
  async handleUserTranscript(conversationId, data) {
    try {
      // Store transcript
      await this.supabase
        .from('conversation_transcripts')
        .insert({
          conversation_id: conversationId,
          speaker: 'user',
          content: data.text,
          confidence: data.confidence,
          timestamp: new Date().toISOString()
        });

      // Update conversation cache
      await this.updateConversationCache(conversationId, {
        last_user_message: data.text,
        last_activity: new Date().toISOString()
      });

      // Broadcast to dashboard for real-time monitoring
      await this.broadcastToDashboard({
        type: 'user_transcript',
        conversation_id: conversationId,
        text: data.text,
        confidence: data.confidence,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle user transcript', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Handle agent response event
   */
  async handleAgentResponse(conversationId, data) {
    try {
      // Store transcript
      await this.supabase
        .from('conversation_transcripts')
        .insert({
          conversation_id: conversationId,
          speaker: 'agent',
          content: data.text,
          timestamp: new Date().toISOString()
        });

      // Update conversation cache
      await this.updateConversationCache(conversationId, {
        last_agent_message: data.text,
        last_activity: new Date().toISOString()
      });

      // Broadcast to dashboard
      await this.broadcastToDashboard({
        type: 'agent_response',
        conversation_id: conversationId,
        text: data.text,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle agent response', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Handle tool call event
   */
  async handleToolCall(conversationId, data) {
    try {
      this.logger.info('Tool call executed', {
        conversation_id: conversationId,
        tool_name: data.tool_name,
        success: data.success
      });

      // Store tool call record
      await this.supabase
        .from('tool_calls')
        .insert({
          conversation_id: conversationId,
          tool_name: data.tool_name,
          parameters: data.parameters,
          result: data.result,
          success: data.success,
          execution_time_ms: data.execution_time_ms,
          timestamp: new Date().toISOString()
        });

      // Update conversation cache with tool call info
      await this.updateConversationCache(conversationId, {
        last_tool_call: data.tool_name,
        last_activity: new Date().toISOString()
      });

      // Broadcast to dashboard
      await this.broadcastToDashboard({
        type: 'tool_call',
        conversation_id: conversationId,
        tool_name: data.tool_name,
        success: data.success,
        result: data.result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle tool call', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Handle error event
   */
  async handleError(conversationId, data) {
    try {
      this.logger.error('Conversation error occurred', {
        conversation_id: conversationId,
        error_type: data.error_type,
        error_message: data.error_message
      });

      // Store error record
      await this.supabase
        .from('conversation_errors')
        .insert({
          conversation_id: conversationId,
          error_type: data.error_type,
          error_message: data.error_message,
          error_data: data,
          timestamp: new Date().toISOString()
        });

      // Broadcast error to dashboard
      await this.broadcastToDashboard({
        type: 'conversation_error',
        conversation_id: conversationId,
        error_type: data.error_type,
        error_message: data.error_message,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle conversation error', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  /**
   * Generate conversation summary using AI
   */
  async generateConversationSummary(conversationId, data) {
    try {
      // Get all transcripts for the conversation
      const { data: transcripts } = await this.supabase
        .from('conversation_transcripts')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });

      if (!transcripts || transcripts.length === 0) {
        return {
          summary: 'No conversation content available',
          key_points: [],
          action_items: [],
          lead_score: 0
        };
      }

      // Basic summary generation (could be enhanced with AI)
      const userMessages = transcripts.filter(t => t.speaker === 'user');
      const agentMessages = transcripts.filter(t => t.speaker === 'agent');

      const keyTopics = this.extractKeyTopics(transcripts);
      const leadScore = this.calculateLeadScore(transcripts, data);

      return {
        summary: `Customer conversation lasting ${Math.round(data.duration_ms / 1000)} seconds. Topics discussed: ${keyTopics.join(', ')}.`,
        key_points: keyTopics,
        action_items: this.extractActionItems(transcripts),
        lead_score: leadScore,
        message_count: {
          user: userMessages.length,
          agent: agentMessages.length,
          total: transcripts.length
        }
      };

    } catch (error) {
      this.logger.error('Failed to generate conversation summary', {
        conversation_id: conversationId,
        error: error.message
      });
      
      return {
        summary: 'Summary generation failed',
        key_points: [],
        action_items: [],
        lead_score: 0
      };
    }
  }

  /**
   * Extract key topics from conversation
   */
  extractKeyTopics(transcripts) {
    const bikeKeywords = [
      'bike', 'bicycle', 'mountain', 'road', 'electric', 'e-bike',
      'repair', 'service', 'tune-up', 'maintenance', 'fitting',
      'purchase', 'buy', 'price', 'cost', 'budget', 'appointment'
    ];

    const topics = new Set();
    
    transcripts.forEach(transcript => {
      const content = transcript.content.toLowerCase();
      bikeKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          topics.add(keyword);
        }
      });
    });

    return Array.from(topics);
  }

  /**
   * Extract action items from conversation
   */
  extractActionItems(transcripts) {
    const actionItems = [];
    
    transcripts.forEach(transcript => {
      const content = transcript.content.toLowerCase();
      
      if (content.includes('appointment') || content.includes('book')) {
        actionItems.push('Schedule service appointment');
      }
      if (content.includes('call back') || content.includes('follow up')) {
        actionItems.push('Follow up with customer');
      }
      if (content.includes('quote') || content.includes('estimate')) {
        actionItems.push('Provide pricing quote');
      }
      if (content.includes('email') || content.includes('send')) {
        actionItems.push('Send information via email');
      }
    });

    return [...new Set(actionItems)]; // Remove duplicates
  }

  /**
   * Calculate lead score based on conversation
   */
  calculateLeadScore(transcripts, data) {
    let score = 0;
    
    // Base score for engaging in conversation
    score += Math.min(transcripts.length * 2, 20);
    
    // Bonus for longer conversations
    if (data.duration_ms > 120000) score += 10; // 2+ minutes
    if (data.duration_ms > 300000) score += 15; // 5+ minutes
    
    // Keywords that indicate buying intent
    const buyingIntentKeywords = [
      'buy', 'purchase', 'price', 'cost', 'budget', 'appointment',
      'when can', 'available', 'in stock', 'delivery'
    ];
    
    const conversationText = transcripts
      .map(t => t.content.toLowerCase())
      .join(' ');
    
    buyingIntentKeywords.forEach(keyword => {
      if (conversationText.includes(keyword)) {
        score += 5;
      }
    });
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Utility methods
   */
  async getOrganizationByPhoneNumber(phoneNumber) {
    try {
      const { data } = await this.supabase
        .from('organizations')
        .select('id')
        .eq('phone_number', phoneNumber)
        .single();
        
      return data?.id || process.env.DEFAULT_ORGANIZATION_ID;
    } catch (error) {
      return process.env.DEFAULT_ORGANIZATION_ID;
    }
  }

  async updateConversationCache(conversationId, updates) {
    try {
      const cached = await this.redis.get(`conversation:${conversationId}`);
      if (cached) {
        const conversation = JSON.parse(cached);
        const updated = { ...conversation, ...updates };
        await this.redis.setex(
          `conversation:${conversationId}`,
          3600,
          JSON.stringify(updated)
        );
      }
    } catch (error) {
      this.logger.warn('Failed to update conversation cache', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }

  async broadcastToDashboard(data) {
    try {
      // This would integrate with WebSocket server for real-time dashboard updates
      // For now, we'll just log and store in Redis for later retrieval
      await this.redis.lpush(
        'dashboard_events',
        JSON.stringify(data)
      );
      
      // Keep only last 100 events
      await this.redis.ltrim('dashboard_events', 0, 99);
      
    } catch (error) {
      this.logger.warn('Failed to broadcast to dashboard', {
        error: error.message
      });
    }
  }

  async storeWebhookEvent(event) {
    try {
      await this.supabase
        .from('webhook_events')
        .insert({
          source: 'elevenlabs',
          event_type: event.type,
          conversation_id: event.conversation_id,
          data: event,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      this.logger.warn('Failed to store webhook event', {
        error: error.message
      });
    }
  }

  async triggerFollowUpActions(conversationId, summary) {
    try {
      // Based on conversation summary, trigger appropriate follow-up actions
      if (summary.lead_score > 70) {
        // High-value lead, schedule immediate follow-up
        this.logger.info('High-value lead detected, scheduling follow-up', {
          conversation_id: conversationId,
          lead_score: summary.lead_score
        });
        
        // This could trigger email, SMS, or create a task for human agents
      }
      
      if (summary.action_items.includes('Schedule service appointment')) {
        // Customer interested in service, send appointment booking options
        this.logger.info('Service interest detected', {
          conversation_id: conversationId
        });
      }
      
    } catch (error) {
      this.logger.error('Failed to trigger follow-up actions', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  }
}

module.exports = ElevenLabsConversationHandler;