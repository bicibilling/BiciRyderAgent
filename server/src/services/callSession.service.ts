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
        started_at: new Date()
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
      logger.info('Updating call session with ID:', conversationId);
      
      // Try to find by elevenlabs_conversation_id first
      const { data, error } = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('elevenlabs_conversation_id', conversationId)
        .select()
        .single();
      
      // If not found by conversation_id, try to find by lead and recent time
      if (error && error.code === 'PGRST116') {
        logger.warn('No session found by conversation_id, trying phone-based lookup');
        
        // Find the most recent session for this phone number (assuming updates.phone_number exists)
        // For now, just return null and log the issue
        logger.error('Could not find call session for conversation_id:', conversationId);
        return null;
      }
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'update call session');
      }
      
      if (data) {
        logger.info('Updated call session:', { 
          id: data.id, 
          status: updates.status 
        });
      } else {
        logger.warn('No call session data returned after update');
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

  async updateRecentSessionByPhone(phoneNumber: string, updates: Partial<CallSession>): Promise<CallSession | null> {
    try {
      logger.info('Looking for recent call session by phone:', phoneNumber);
      
      // Find the most recent session for this phone number that's still active/initiated
      const { data: recentSession, error: findError } = await supabase
        .from('call_sessions')
        .select('*, leads!inner(*)')
        .eq('leads.phone_number', phoneNumber)
        .in('status', ['initiated', 'active'])
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      if (findError || !recentSession) {
        logger.warn('No recent session found for phone:', phoneNumber);
        return null;
      }
      
      logger.info('Found recent session to update:', { id: recentSession.id });
      
      // Update the found session
      const { data, error } = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('id', recentSession.id)
        .select()
        .single();
      
      if (error) {
        handleSupabaseError(error, 'update recent call session');
      }
      
      if (data) {
        logger.info('Updated recent call session:', { 
          id: data.id, 
          status: updates.status 
        });
      }
      
      return data;
    } catch (error) {
      logger.error('Error updating recent call session:', error);
      return null;
    }
  }
}