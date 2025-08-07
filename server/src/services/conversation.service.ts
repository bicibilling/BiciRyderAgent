import { supabase, handleSupabaseError } from '../config/supabase.config';
import { Conversation } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { broadcastToClients } from './realtime.service';

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
      
      // Update cache
      if (data.lead_id) {
        const cached = this.conversationCache.get(data.lead_id) || [];
        cached.push(stored);
        this.conversationCache.set(data.lead_id, cached);
      }
      
      logger.info('Stored conversation:', { 
        id: stored.id, 
        lead_id: data.lead_id,
        type: data.type 
      });
      
      // Broadcast real-time update
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
      // Always fetch from database for accuracy
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
      
      // Update cache
      this.conversationCache.set(leadId, conversations);
      
      return conversations;
    } catch (error) {
      logger.error('Error getting recent conversations:', error);
      return [];
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
      const summary = {
        id: uuidv4(),
        ...summaryData,
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
      const smsMessages = conversations.filter(c => c.type === 'sms' || c.type === 'text');
      
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