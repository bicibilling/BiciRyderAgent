import { supabase, handleSupabaseError } from '../config/supabase.config';
import { CallSession } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from './redis.service';

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
      
      // Cache the session for fast lookups
      await redisService.cacheCallSession(data.id, data);
      
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
      
      // First try to get session ID from cache by conversation ID
      let sessionId = await redisService.getCachedCallSessionIdByConversation(conversationId);
      let data: CallSession | null = null;
      
      if (sessionId) {
        // Update the session directly using the cached session ID
        const { data: updatedData, error } = await supabase
          .from('call_sessions')
          .update(updates)
          .eq('id', sessionId)
          .select()
          .single();
        
        if (updatedData && !error) {
          data = updatedData;
          logger.info('Updated session using cached ID:', data.id);
        }
      }
      
      if (!data) {
        // Fallback to original database-based lookup
        // 1. Direct match by elevenlabs_conversation_id
        let { data: directData, error } = await supabase
          .from('call_sessions')
          .update(updates)
          .eq('elevenlabs_conversation_id', conversationId)
          .select()
          .single();
        
        if (directData) {
          data = directData;
          logger.info('Found session by elevenlabs_conversation_id:', data.id);
        } else {
          // 2. Try to find by call_sid (stored in metadata)
          const { data: sessionsByCallSid, error: callSidError } = await supabase
            .from('call_sessions')
            .select('*')
            .eq('metadata->>call_sid', conversationId);
          
          if (sessionsByCallSid && sessionsByCallSid.length > 0) {
            const session = sessionsByCallSid[0];
            const { data: updatedSession, error: updateError } = await supabase
              .from('call_sessions')
              .update(updates)
              .eq('id', session.id)
              .select()
              .single();
            
            if (updatedSession) {
              data = updatedSession;
              logger.info('Found and updated session by call_sid:', data.id);
            }
          }
        }
      }
      
      if (data) {
        // Update cache with new data
        await redisService.cacheCallSession(data.id, data);
        return data;
      }
      
      logger.warn('No session found by conversation_id or call_sid, will try phone-based lookup');
      return null;
      
    } catch (error) {
      logger.error('Error updating call session:', error);
      return null;
    }
  }
  
  async getActiveSession(leadId: string): Promise<CallSession | null> {
    try {
      // Try to get cached session ID first
      const cachedSessionId = await redisService.getCachedCallSessionIdByLead(leadId);
      if (cachedSessionId) {
        const cachedSession = await redisService.getCachedCallSession(cachedSessionId);
        if (cachedSession && ['initiated', 'active'].includes(cachedSession.status)) {
          logger.debug('Retrieved active session from cache:', cachedSession.id);
          return cachedSession;
        }
      }
      
      // Fallback to database lookup
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
      
      // Cache the session if found
      if (data) {
        await redisService.cacheCallSession(data.id, data);
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

  async getSessionByConversationId(conversationId: string): Promise<CallSession | null> {
    try {
      // Try cache first by conversation ID
      const cachedSessionId = await redisService.getCachedCallSessionIdByConversation(conversationId);
      if (cachedSessionId) {
        const cachedSession = await redisService.getCachedCallSession(cachedSessionId);
        if (cachedSession) {
          logger.debug('Retrieved session by conversation ID from cache:', cachedSession.id);
          return cachedSession;
        }
      }
      
      // Fallback to database lookup
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('elevenlabs_conversation_id', conversationId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'get session by conversation id');
      }
      
      // Cache the session if found
      if (data) {
        await redisService.cacheCallSession(data.id, data);
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting session by conversation id:', error);
      return null;
    }
  }

  async cleanupStaleSessions(organizationId: string): Promise<number> {
    try {
      // Close any sessions older than 5 minutes that are still initiated/active
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('call_sessions')
        .update({ 
          status: 'completed',
          ended_at: new Date(),
          metadata: { auto_closed: true, reason: 'stale_session' }
        })
        .eq('organization_id', organizationId)
        .in('status', ['initiated', 'active'])
        .lt('started_at', fiveMinutesAgo.toISOString())
        .select();
      
      if (error) {
        logger.error('Error cleaning up stale sessions:', error);
        return 0;
      }
      
      const count = data?.length || 0;
      if (count > 0) {
        logger.info(`Cleaned up ${count} stale sessions`);
      }
      
      return count;
    } catch (error) {
      logger.error('Error in cleanupStaleSessions:', error);
      return 0;
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
        // Update cache with new data
        await redisService.cacheCallSession(data.id, data);
        
        // If session is completed, remove from cache after a short delay
        if (updates.status === 'completed') {
          setTimeout(async () => {
            await redisService.removeCachedCallSession(data.id, data);
          }, 30000); // 30 second delay
        }
        
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