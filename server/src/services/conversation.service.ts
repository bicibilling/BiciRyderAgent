import { supabase, handleSupabaseError } from '../config/supabase.config';
import { Conversation } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { broadcastToClients } from './realtime.service';
import { redisService } from './redis.service';

export class ConversationService {
  private conversationCache = new Map<string, Conversation[]>();
  
  async storeConversation(data: Partial<Conversation>): Promise<Conversation> {
    try {
      const conversation = {
        id: uuidv4(),
        ...data,
        timestamp: new Date()
      };
      
      const { data: stored, error } = await supabase
        .from('conversations')
        .insert(conversation)
        .select()
        .single();
      
      if (error) {
        handleSupabaseError(error, 'store conversation');
      }
      
      // Update in-memory cache (preserve existing behavior)
      if (data.lead_id) {
        const cached = this.conversationCache.get(data.lead_id) || [];
        cached.push(stored);
        this.conversationCache.set(data.lead_id, cached);
      }
      
      // Invalidate Redis caches when new conversation is stored
      if (data.lead_id) {
        try {
          // Clear context cache (will be rebuilt with new conversation)
          await redisService.clearLeadCache(data.lead_id);
          logger.debug(`Invalidated cache for lead ${data.lead_id} after storing conversation`);
        } catch (redisError) {
          logger.warn('Failed to invalidate cache after storing conversation:', redisError);
        }
      }
      
      logger.info('Stored conversation:', { 
        id: stored.id, 
        lead_id: data.lead_id,
        type: data.type 
      });
      
      // Broadcast real-time update (preserve existing SSE behavior)
      broadcastToClients({
        type: 'conversation_added',
        lead_id: data.lead_id,
        conversation: stored,
        sent_by: data.sent_by,
        message_type: data.type
      });
      
      return stored;
    } catch (error) {
      logger.error('Error storing conversation:', error);
      throw error;
    }
  }
  
  async getRecentConversations(leadId: string, limit: number = 6): Promise<Conversation[]> {
    try {
      // Try to get cached conversations first (2 minute TTL for recent messages)
      try {
        const cachedConversations = await redisService.getCachedConversations(leadId, limit);
        if (cachedConversations) {
          logger.debug(`Conversations cache hit for lead ${leadId}, limit ${limit}`);
          // Also update in-memory cache for consistency
          this.conversationCache.set(leadId, cachedConversations);
          return cachedConversations;
        }
      } catch (redisError) {
        logger.warn('Conversations cache error, fetching from database:', redisError);
      }
      
      // Fetch from database
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        handleSupabaseError(error, 'get recent conversations');
      }
      
      // Reverse to get chronological order
      const conversations = (data || []).reverse();
      
      // Update in-memory cache (preserve existing behavior)
      this.conversationCache.set(leadId, conversations);
      
      // Cache in Redis for future requests
      try {
        await redisService.cacheConversations(leadId, conversations, limit);
        logger.debug(`Cached conversations for lead ${leadId}, limit ${limit}`);
      } catch (redisError) {
        logger.warn('Failed to cache conversations, continuing:', redisError);
      }
      
      return conversations;
    } catch (error) {
      logger.error('Error getting recent conversations:', error);
      return [];
    }
  }
  
  async getConversationCount(leadId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', leadId);
      
      if (error) {
        logger.error('Error getting conversation count:', error);
        return 0;
      }
      
      return count || 0;
    } catch (error) {
      logger.error('Error getting conversation count:', error);
      return 0;
    }
  }

  async getConversationHistory(phoneNumber: string, organizationId: string): Promise<Conversation[]> {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', phoneNumber.replace(/\D/g, ''))
        .order('timestamp', { ascending: true });
      
      if (error) {
        handleSupabaseError(error, 'get conversation history');
      }
      
      return data || [];
    } catch (error) {
      logger.error('Error getting conversation history:', error);
      return [];
    }
  }
  
  async createSummary(summaryData: any): Promise<any> {
    try {
      // Include all fields needed for conversation summaries
      const summary = {
        id: uuidv4(),
        organization_id: summaryData.organization_id,
        lead_id: summaryData.lead_id,
        phone_number: summaryData.phone_number,
        summary: summaryData.summary,
        key_points: summaryData.key_points,
        next_steps: summaryData.next_steps,
        sentiment_score: summaryData.sentiment_score,
        call_classification: summaryData.call_classification,
        conversation_type: summaryData.conversation_type, // Track if it's voice or sms
        created_at: new Date()
      };
      
      const { data, error } = await supabase
        .from('conversation_summaries')
        .insert(summary)
        .select()
        .single();
      
      if (error) {
        handleSupabaseError(error, 'create conversation summary');
      }
      
      // Invalidate cache when new summary is created
      if (summaryData.lead_id) {
        try {
          // Clear summaries cache and context cache (will be rebuilt with new summary)
          await redisService.clearLeadCache(summaryData.lead_id);
          logger.debug(`Invalidated cache for lead ${summaryData.lead_id} after creating summary`);
        } catch (redisError) {
          logger.warn('Failed to invalidate cache after creating summary:', redisError);
        }
      }
      
      logger.info('Created conversation summary:', { 
        id: data.id, 
        lead_id: summaryData.lead_id 
      });
      
      return data;
    } catch (error) {
      logger.error('Error creating summary:', error);
      throw error;
    }
  }
  
  async getLatestSummary(leadId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'get latest summary');
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting latest summary:', error);
      return null;
    }
  }

  async getAllSummaries(leadId: string): Promise<any[]> {
    try {
      // Try to get cached summaries first (5 minute TTL for more stable summary data)
      try {
        const cachedSummaries = await redisService.getCachedSummaries(leadId);
        if (cachedSummaries) {
          logger.debug(`Summaries cache hit for lead ${leadId}`);
          return cachedSummaries;
        }
      } catch (redisError) {
        logger.warn('Summaries cache error, fetching from database:', redisError);
      }
      
      // Fetch from database
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10); // Get last 10 summaries for comprehensive context
      
      if (error) {
        handleSupabaseError(error, 'get all summaries');
      }
      
      const summaries = data || [];
      
      // Cache the summaries for future requests
      try {
        await redisService.cacheSummaries(leadId, summaries);
        logger.debug(`Cached summaries for lead ${leadId}`);
      } catch (redisError) {
        logger.warn('Failed to cache summaries, continuing:', redisError);
      }
      
      return summaries;
    } catch (error) {
      logger.error('Error getting all summaries:', error);
      return [];
    }
  }
  
  async generateComprehensiveSummary(leadId: string): Promise<string> {
    try {
      const conversations = await this.getRecentConversations(leadId, 20);
      const latestSummary = await this.getLatestSummary(leadId);
      
      let comprehensiveSummary = '';
      
      // Add existing summary if available
      if (latestSummary?.summary) {
        comprehensiveSummary += `Previous Summary: ${latestSummary.summary}\n\n`;
      }
      
      // Group by type
      const voiceCalls = conversations.filter(c => c.type === 'voice');
      const smsMessages = conversations.filter(c => c.type === 'sms');
      
      if (voiceCalls.length > 0) {
        comprehensiveSummary += `Voice Calls: ${voiceCalls.length} calls\n`;
      }
      
      if (smsMessages.length > 0) {
        comprehensiveSummary += `SMS Exchanges: ${smsMessages.length} messages\n`;
        
        // Include last few messages
        const lastMessages = smsMessages.slice(-3);
        if (lastMessages.length > 0) {
          comprehensiveSummary += 'Recent SMS:\n';
          lastMessages.forEach(msg => {
            const sender = msg.sent_by === 'user' ? 'Customer' : 'Agent';
            comprehensiveSummary += `- ${sender}: ${msg.content.substring(0, 100)}\n`;
          });
        }
      }
      
      return comprehensiveSummary || 'No previous interactions';
    } catch (error) {
      logger.error('Error generating comprehensive summary:', error);
      return 'Unable to retrieve conversation history';
    }
  }
}