import { supabase, handleSupabaseError } from '../config/supabase.config';
import { CallSession } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class CallSessionService {
  async createSession(sessionData: Partial<CallSession>): Promise<CallSession> {
    try {
      const session = {
        id: uuidv4(),
        ...sessionData,
        started_at: new Date(),
        escalated_to_human: false
      };
      
      const { data, error } = await supabase
        .from('call_sessions')
        .insert(session)
        .select()
        .single();
      
      if (error) {
        handleSupabaseError(error, 'create call session');
      }
      
      logger.info('Created call session:', { 
        id: data.id, 
        lead_id: sessionData.lead_id 
      });
      
      return data;
    } catch (error) {
      logger.error('Error creating call session:', error);
      throw error;
    }
  }
  
  async updateSession(
    conversationId: string, 
    updates: Partial<CallSession>
  ): Promise<CallSession | null> {
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('elevenlabs_conversation_id', conversationId)
        .select()
        .single();
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'update call session');
      }
      
      if (data) {
        logger.info('Updated call session:', { 
          id: data.id, 
          status: updates.status 
        });
      }
      
      return data;
    } catch (error) {
      logger.error('Error updating call session:', error);
      return null;
    }
  }
  
  async getActiveSession(leadId: string): Promise<CallSession | null> {
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('lead_id', leadId)
        .in('status', ['initiated', 'active'])
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'get active session');
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting active session:', error);
      return null;
    }
  }
  
  async getSessionHistory(leadId: string): Promise<CallSession[]> {
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('lead_id', leadId)
        .order('started_at', { ascending: false });
      
      if (error) {
        handleSupabaseError(error, 'get session history');
      }
      
      return data || [];
    } catch (error) {
      logger.error('Error getting session history:', error);
      return [];
    }
  }
}