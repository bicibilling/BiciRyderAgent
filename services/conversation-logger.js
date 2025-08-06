/**
 * BICI AI Voice System - Conversation Logger
 * Comprehensive logging and classification of all conversations
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config');
const { ConversationStateManager } = require('./conversation-state');
const { normalizePhoneNumber } = require('../utils/phone');

class ConversationLogger {
  constructor(organizationId = 'bici-main') {
    this.organizationId = organizationId;
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    this.stateManager = new ConversationStateManager();
    
    // Classification keywords for automatic categorization
    this.classificationKeywords = this.initializeClassificationKeywords();
  }

  /**
   * Initialize classification keywords for auto-categorization
   */
  initializeClassificationKeywords() {
    return {
      appointment_booking: [
        'appointment', 'book', 'schedule', 'service', 'repair', 'maintenance',
        'tune-up', 'check-up', 'visit', 'come in', 'available', 'when can'
      ],
      
      product_inquiry: [
        'bike', 'bicycle', 'mountain', 'road', 'electric', 'e-bike', 'hybrid',
        'price', 'cost', 'how much', 'available', 'in stock', 'model', 'brand',
        'recommend', 'best', 'suitable', 'size', 'color', 'accessories'
      ],
      
      order_status: [
        'order', 'purchase', 'bought', 'status', 'tracking', 'shipped',
        'delivered', 'where is', 'when will', 'receipt', 'invoice'
      ],
      
      support_request: [
        'problem', 'issue', 'broken', 'not working', 'defective', 'warranty',
        'return', 'exchange', 'refund', 'help', 'fix', 'repair'
      ],
      
      complaint: [
        'complain', 'complaint', 'unhappy', 'dissatisfied', 'bad', 'terrible',
        'awful', 'poor', 'worst', 'angry', 'frustrated', 'manager'
      ],
      
      store_information: [
        'hours', 'open', 'close', 'location', 'address', 'directions',
        'parking', 'how to get', 'where are you', 'contact', 'phone'
      ]
    };
  }

  /**
   * Log conversation start (SOW requirement)
   */
  async logConversationStart(conversationData) {
    try {
      const {
        conversation_id,
        call_sid,
        phone_number,
        event_data
      } = conversationData;

      const normalizedPhone = normalizePhoneNumber(phone_number);

      // Create initial conversation record
      const conversationRecord = {
        elevenlabs_conversation_id: conversation_id,
        twilio_call_sid: call_sid,
        organization_id: this.organizationId,
        phone_number_normalized: normalizedPhone,
        content: 'Conversation started',
        sent_by: 'system',
        type: 'voice',
        call_direction: event_data?.direction || 'inbound',
        call_status: 'started',
        metadata: {
          start_event: event_data,
          started_at: new Date().toISOString()
        }
      };

      const { data, error } = await this.supabase
        .from('conversations')
        .insert(conversationRecord)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Store in Redis for real-time access
      await this.stateManager.storeConversationState(conversation_id, {
        conversation_id,
        call_sid,
        phone_number: normalizedPhone,
        organization_id: this.organizationId,
        status: 'started',
        started_at: new Date().toISOString(),
        database_record_id: data.id
      });

      console.log(`📝 Logged conversation start: ${conversation_id}`);
      return data;

    } catch (error) {
      console.error('❌ Failed to log conversation start:', error);
      return null;
    }
  }

  /**
   * Log conversation end with classification
   */
  async logConversationEnd(conversationData) {
    try {
      const {
        conversation_id,
        call_sid,
        phone_number,
        event_data
      } = conversationData;

      const normalizedPhone = normalizePhoneNumber(phone_number);

      // Get conversation transcript for analysis
      const transcript = await this.stateManager.getTranscript(conversation_id);
      const fullTranscript = transcript.map(entry => `${entry.speaker}: ${entry.text}`).join('\n');

      // Classify conversation
      const classification = await this.classifyConversation(fullTranscript, event_data);

      // Create conversation end record
      const conversationRecord = {
        elevenlabs_conversation_id: conversation_id,
        twilio_call_sid: call_sid,
        organization_id: this.organizationId,
        phone_number_normalized: normalizedPhone,
        content: this.generateConversationSummary(transcript),
        sent_by: 'system',
        type: 'voice',
        call_classification: classification.category,
        call_direction: event_data?.direction || 'inbound',
        call_status: 'completed',
        call_duration: event_data?.duration || 0,
        confidence_score: classification.confidence,
        sentiment: classification.sentiment,
        metadata: {
          end_event: event_data,
          classification_details: classification,
          transcript_length: transcript.length,
          ended_at: new Date().toISOString()
        }
      };

      const { data, error } = await this.supabase
        .from('conversations')
        .insert(conversationRecord)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update Redis state
      await this.stateManager.storeConversationState(conversation_id, {
        status: 'completed',
        ended_at: new Date().toISOString(),
        classification: classification.category,
        summary: conversationRecord.content,
        database_record_id: data.id
      });

      // Remove from active conversations
      await this.stateManager.removeActiveConversation(conversation_id);

      console.log(`✅ Logged conversation end: ${conversation_id} (${classification.category})`);
      return data;

    } catch (error) {
      console.error('❌ Failed to log conversation end:', error);
      return null;
    }
  }

  /**
   * Log user speech transcript
   */
  async logUserSpeech(speechData) {
    try {
      const {
        conversation_id,
        transcript,
        confidence,
        timestamp
      } = speechData;

      // Store in transcript table
      const transcriptRecord = {
        elevenlabs_conversation_id: conversation_id,
        speaker: 'user',
        text: transcript,
        confidence_score: confidence || 1.0,
        start_time: timestamp ? new Date(timestamp) : new Date(),
        metadata: {
          logged_at: new Date().toISOString()
        }
      };

      const { data, error } = await this.supabase
        .from('conversation_transcripts')
        .insert(transcriptRecord)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Also store in Redis for real-time access
      await this.stateManager.storeTranscript(conversation_id, {
        type: 'user_speech',
        speaker: 'user',
        text: transcript,
        confidence: confidence,
        timestamp: timestamp || new Date().toISOString()
      });

      console.log(`👤 Logged user speech: ${conversation_id} - "${transcript}"`);
      return data;

    } catch (error) {
      console.error('❌ Failed to log user speech:', error);
      return null;
    }
  }

  /**
   * Log agent response
   */
  async logAgentResponse(responseData) {
    try {
      const {
        conversation_id,
        response,
        timestamp
      } = responseData;

      // Store in transcript table
      const transcriptRecord = {
        elevenlabs_conversation_id: conversation_id,
        speaker: 'agent',
        text: response,
        confidence_score: 1.0,
        start_time: timestamp ? new Date(timestamp) : new Date(),
        metadata: {
          logged_at: new Date().toISOString()
        }
      };

      const { data, error } = await this.supabase
        .from('conversation_transcripts')
        .insert(transcriptRecord)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Also store in Redis for real-time access
      await this.stateManager.storeTranscript(conversation_id, {
        type: 'agent_response',
        speaker: 'agent',
        text: response,
        timestamp: timestamp || new Date().toISOString()
      });

      console.log(`🤖 Logged agent response: ${conversation_id} - "${response}"`);
      return data;

    } catch (error) {
      console.error('❌ Failed to log agent response:', error);
      return null;
    }
  }

  /**
   * Log tool calls during conversation
   */
  async logToolCall(toolData) {
    try {
      const {
        conversation_id,
        tool_name,
        tool_arguments,
        tool_result
      } = toolData;

      // Store tool call in transcript
      await this.stateManager.storeTranscript(conversation_id, {
        type: 'tool_call',
        speaker: 'system',
        text: `Tool used: ${tool_name}`,
        tool_name,
        tool_arguments,
        tool_result,
        timestamp: new Date().toISOString()
      });

      console.log(`🔧 Logged tool call: ${conversation_id} - ${tool_name}`);

    } catch (error) {
      console.error('❌ Failed to log tool call:', error);
    }
  }

  /**
   * Log conversation errors
   */
  async logError(errorData) {
    try {
      const {
        conversation_id,
        error_type,
        error_message
      } = errorData;

      await this.stateManager.storeTranscript(conversation_id, {
        type: 'error',
        speaker: 'system',
        text: `Error: ${error_type} - ${error_message}`,
        error_type,
        error_message,
        timestamp: new Date().toISOString()
      });

      console.log(`❌ Logged conversation error: ${conversation_id} - ${error_type}`);

    } catch (error) {
      console.error('❌ Failed to log conversation error:', error);
    }
  }

  /**
   * Update conversation status
   */
  async updateConversationStatus(statusData) {
    try {
      const {
        conversation_id,
        status,
        call_duration,
        summary,
        classification,
        participants
      } = statusData;

      // Update in database
      const { error } = await this.supabase
        .from('conversations')
        .update({
          call_status: status,
          call_duration: call_duration,
          content: summary || 'Conversation completed',
          call_classification: classification,
          updated_at: new Date().toISOString(),
          metadata: {
            participants,
            status_updated_at: new Date().toISOString()
          }
        })
        .eq('elevenlabs_conversation_id', conversation_id);

      if (error) {
        throw error;
      }

      // Update Redis state
      await this.stateManager.storeConversationState(conversation_id, {
        status,
        call_duration,
        summary,
        classification,
        updated_at: new Date().toISOString()
      });

      console.log(`📊 Updated conversation status: ${conversation_id} - ${status}`);

    } catch (error) {
      console.error('❌ Failed to update conversation status:', error);
    }
  }

  /**
   * Update call classification
   */
  async updateCallClassification(callSid, classification) {
    try {
      const { error } = await this.supabase
        .from('conversations')
        .update({
          call_classification: classification.category,
          confidence_score: classification.confidence,
          sentiment: classification.sentiment,
          metadata: {
            classification_details: classification,
            classified_at: new Date().toISOString()
          }
        })
        .eq('twilio_call_sid', callSid);

      if (error) {
        throw error;
      }

      console.log(`🎯 Updated call classification: ${callSid} - ${classification.category}`);

    } catch (error) {
      console.error('❌ Failed to update call classification:', error);
    }
  }

  /**
   * Log call status changes
   */
  async logCallStatusChange(statusData) {
    try {
      const {
        call_sid,
        status,
        duration,
        recording_url,
        organization_id
      } = statusData;

      // Create status change record
      const statusRecord = {
        twilio_call_sid: call_sid,
        organization_id: organization_id || this.organizationId,
        content: `Call status changed to: ${status}`,
        sent_by: 'system',
        type: 'voice',
        call_status: status,
        call_duration: duration,
        metadata: {
          status_change: {
            status,
            duration,
            recording_url,
            timestamp: new Date().toISOString()
          }
        }
      };

      const { error } = await this.supabase
        .from('conversations')
        .insert(statusRecord);

      if (error) {
        throw error;
      }

      console.log(`📞 Logged call status change: ${call_sid} - ${status}`);

    } catch (error) {
      console.error('❌ Failed to log call status change:', error);
    }
  }

  /**
   * Log call failures
   */
  async logCallFailure(failureData) {
    try {
      const {
        call_sid,
        phone_number,
        failure_reason,
        organization_id
      } = failureData;

      const normalizedPhone = normalizePhoneNumber(phone_number);

      const failureRecord = {
        twilio_call_sid: call_sid,
        organization_id: organization_id || this.organizationId,
        phone_number_normalized: normalizedPhone,
        content: `Call failed: ${failure_reason}`,
        sent_by: 'system',
        type: 'voice',
        call_status: 'failed',
        call_direction: 'outbound',
        metadata: {
          failure_reason,
          failed_at: new Date().toISOString()
        }
      };

      const { error } = await this.supabase
        .from('conversations')
        .insert(failureRecord);

      if (error) {
        throw error;
      }

      console.log(`📞 Logged call failure: ${call_sid} - ${failure_reason}`);

    } catch (error) {
      console.error('❌ Failed to log call failure:', error);
    }
  }

  /**
   * Update recording status
   */
  async updateRecordingStatus(recordingData) {
    try {
      const {
        call_sid,
        recording_sid,
        recording_url,
        recording_status,
        recording_duration
      } = recordingData;

      const { error } = await this.supabase
        .from('conversations')
        .update({
          metadata: {
            recording: {
              recording_sid,
              recording_url,
              recording_status,
              recording_duration,
              updated_at: new Date().toISOString()
            }
          }
        })
        .eq('twilio_call_sid', call_sid);

      if (error) {
        throw error;
      }

      console.log(`🎙️  Updated recording status: ${recording_sid} - ${recording_status}`);

    } catch (error) {
      console.error('❌ Failed to update recording status:', error);
    }
  }

  /**
   * Get conversation history for a phone number
   */
  async getConversationHistory(phoneNumber, organizationId, limit = 10) {
    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      const { data, error } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', normalizedPhone)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('❌ Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Get conversation by call SID
   */
  async getConversationByCallSid(callSid) {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('twilio_call_sid', callSid)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;

    } catch (error) {
      console.error('❌ Failed to get conversation by call SID:', error);
      return null;
    }
  }

  /**
   * Classify conversation based on content (SOW requirement)
   */
  async classifyConversation(transcript, eventData = {}) {
    try {
      const lowerTranscript = transcript.toLowerCase();
      let bestMatch = { category: 'general_inquiry', confidence: 0.1, matches: [] };

      // Check each classification category
      for (const [category, keywords] of Object.entries(this.classificationKeywords)) {
        const matches = keywords.filter(keyword => 
          lowerTranscript.includes(keyword.toLowerCase())
        );

        if (matches.length > 0) {
          const confidence = Math.min(0.9, matches.length / keywords.length + 0.3);
          
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category,
              confidence,
              matches,
              keywords_matched: matches.length,
              total_keywords: keywords.length
            };
          }
        }
      }

      // Determine sentiment
      const sentiment = this.analyzeSentiment(transcript);

      // Factor in call duration for confidence
      const duration = eventData.duration || 0;
      if (duration > 120) { // Longer calls tend to be more meaningful
        bestMatch.confidence = Math.min(0.95, bestMatch.confidence + 0.1);
      }

      const classification = {
        category: bestMatch.category,
        confidence: parseFloat(bestMatch.confidence.toFixed(2)),
        sentiment: sentiment,
        keywords_matched: bestMatch.matches || [],
        classification_method: 'keyword_matching',
        classified_at: new Date().toISOString()
      };

      console.log(`🎯 Classified conversation: ${classification.category} (${classification.confidence})`);
      return classification;

    } catch (error) {
      console.error('❌ Failed to classify conversation:', error);
      return {
        category: 'unknown',
        confidence: 0.0,
        sentiment: 'neutral',
        error: error.message
      };
    }
  }

  /**
   * Analyze sentiment of conversation
   */
  analyzeSentiment(transcript) {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'perfect',
      'happy', 'satisfied', 'pleased', 'thank', 'thanks', 'awesome'
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate',
      'angry', 'frustrated', 'disappointed', 'complain', 'problem', 'issue'
    ];

    const lowerTranscript = transcript.toLowerCase();
    
    const positiveCount = positiveWords.filter(word => 
      lowerTranscript.includes(word)
    ).length;

    const negativeCount = negativeWords.filter(word => 
      lowerTranscript.includes(word)
    ).length;

    if (positiveCount > negativeCount) {
      return 'positive';
    } else if (negativeCount > positiveCount) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  /**
   * Generate conversation summary from transcript
   */
  generateConversationSummary(transcript) {
    if (!transcript || transcript.length === 0) {
      return 'No conversation content recorded';
    }

    // Simple summary generation - in production would use more sophisticated NLP
    const userMessages = transcript.filter(entry => entry.speaker === 'user');
    const agentMessages = transcript.filter(entry => entry.speaker === 'agent');

    if (userMessages.length === 0) {
      return 'Customer did not speak during call';
    }

    const firstUserMessage = userMessages[0]?.text || '';
    const lastAgentMessage = agentMessages[agentMessages.length - 1]?.text || '';

    const summary = `Customer inquiry: ${firstUserMessage.substring(0, 100)}${firstUserMessage.length > 100 ? '...' : ''}`;
    
    if (lastAgentMessage) {
      return `${summary} | Agent response: ${lastAgentMessage.substring(0, 100)}${lastAgentMessage.length > 100 ? '...' : ''}`;
    }

    return summary;
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(organizationId, timeframe = '24h') {
    try {
      const timeframeHours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // 30d
      const startTime = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from('conversations')
        .select('call_classification, call_duration, sentiment, timestamp')
        .eq('organization_id', organizationId)
        .gte('timestamp', startTime.toISOString());

      if (error) {
        throw error;
      }

      const analytics = {
        total_conversations: data.length,
        avg_duration: data.length > 0 ? 
          (data.reduce((sum, conv) => sum + (conv.call_duration || 0), 0) / data.length).toFixed(1) : 0,
        
        by_classification: {},
        by_sentiment: {},
        
        hourly_distribution: {},
        
        timeframe: timeframe
      };

      data.forEach(conv => {
        // By classification
        const classification = conv.call_classification || 'unknown';
        analytics.by_classification[classification] = (analytics.by_classification[classification] || 0) + 1;

        // By sentiment
        const sentiment = conv.sentiment || 'neutral';
        analytics.by_sentiment[sentiment] = (analytics.by_sentiment[sentiment] || 0) + 1;

        // Hourly distribution
        const hour = new Date(conv.timestamp).getHours();
        analytics.hourly_distribution[hour] = (analytics.hourly_distribution[hour] || 0) + 1;
      });

      return analytics;

    } catch (error) {
      console.error('❌ Failed to get conversation analytics:', error);
      return { error: 'Failed to get analytics' };
    }
  }
}

module.exports = { ConversationLogger };