import { supabase } from '../config/supabase.config';
import { ConversationService } from './conversation.service';
import { SMSAutomationService } from './sms.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from './redis.service';

const conversationService = new ConversationService();
const smsService = new SMSAutomationService();

interface HumanControlSession {
  id: string;
  lead_id: string;
  agent_name: string;
  organization_id: string;
  started_at: Date;
  message_queue: string[];
}

export class HumanControlService {
  private activeSessions = new Map<string, HumanControlSession>();
  private isInitialized = false;
  
  /**
   * Initialize service by restoring sessions from Redis
   */
  private async initializeIfNeeded(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Restore sessions from Redis cache
      const cachedLeadIds = await redisService.getCachedHumanSessionLeads();
      
      for (const leadId of cachedLeadIds) {
        const cachedSession = await redisService.getCachedHumanSession(leadId);
        if (cachedSession) {
          // Restore to in-memory map
          this.activeSessions.set(leadId, {
            ...cachedSession,
            started_at: new Date(cachedSession.started_at)
          });
          logger.info('Restored human control session from cache:', { leadId, sessionId: cachedSession.id });
        }
      }
      
      if (cachedLeadIds.length > 0) {
        logger.info(`Restored ${cachedLeadIds.length} human control sessions from Redis cache`);
      }
      
      this.isInitialized = true;
    } catch (error) {
      logger.error('Error initializing human control service from cache:', error);
      this.isInitialized = true; // Continue even if cache restore fails
    }
  }

  async isUnderHumanControl(leadId: string): Promise<boolean> {
    await this.initializeIfNeeded();
    return this.activeSessions.has(leadId);
  }
  
  async joinConversation(
    leadId: string,
    agentName: string,
    organizationId: string
  ): Promise<HumanControlSession> {
    try {
      await this.initializeIfNeeded();
      
      // Check if already under control
      if (this.activeSessions.has(leadId)) {
        throw new Error('Conversation already under human control');
      }
      
      // Create session
      const session: HumanControlSession = {
        id: uuidv4(),
        lead_id: leadId,
        agent_name: agentName,
        organization_id: organizationId,
        started_at: new Date(),
        message_queue: []
      };
      
      // Store in memory (primary storage)
      this.activeSessions.set(leadId, session);
      
      // Store in Redis for persistence across server restarts
      await redisService.cacheHumanSession(leadId, session);
      
      // Store in database
      await supabase
        .from('human_control_sessions')
        .insert({
          id: session.id,
          lead_id: leadId,
          agent_name: agentName,
          organization_id: organizationId,
          started_at: session.started_at
        });
      
      // Add system message
      await conversationService.storeConversation({
        organization_id: organizationId,
        lead_id: leadId,
        phone_number_normalized: '',
        content: `${agentName} has joined the conversation`,
        sent_by: 'system',
        type: 'system'  // Use 'system' for system messages
      });
      
      logger.info('Human control session started:', { 
        sessionId: session.id, 
        leadId, 
        agentName 
      });
      
      return session;
    } catch (error) {
      logger.error('Error joining conversation:', error);
      throw error;
    }
  }
  
  async leaveConversation(leadId: string): Promise<void> {
    try {
      await this.initializeIfNeeded();
      
      const session = this.activeSessions.get(leadId);
      if (!session) {
        throw new Error('No active human control session');
      }
      
      // Update database
      await supabase
        .from('human_control_sessions')
        .update({
          ended_at: new Date()
        })
        .eq('id', session.id);
      
      // Add system message
      await conversationService.storeConversation({
        organization_id: session.organization_id,
        lead_id: leadId,
        phone_number_normalized: '',
        content: 'AI assistant has resumed control',
        sent_by: 'system',
        type: 'system'  // Use 'system' for system messages
      });
      
      // Remove from memory (primary storage)
      this.activeSessions.delete(leadId);
      
      // Remove from Redis cache
      await redisService.removeCachedHumanSession(leadId);
      
      logger.info('Human control session ended:', { 
        sessionId: session.id, 
        leadId 
      });
    } catch (error) {
      logger.error('Error leaving conversation:', error);
      throw error;
    }
  }
  
  async sendHumanMessage(
    leadId: string,
    message: string,
    phoneNumber: string
  ): Promise<void> {
    try {
      await this.initializeIfNeeded();
      
      const session = this.activeSessions.get(leadId);
      if (!session) {
        throw new Error('No active human control session');
      }
      
      // Send SMS
      await smsService.sendSMS(phoneNumber, message, session.organization_id);
      
      // Store as human agent message
      await conversationService.storeConversation({
        organization_id: session.organization_id,
        lead_id: leadId,
        phone_number_normalized: phoneNumber.replace(/\D/g, ''),
        content: message,
        sent_by: 'human_agent',
        type: 'sms'
      });
      
      // Update session in database
      await supabase
        .from('human_control_sessions')
        .update({
          messages_handled: session.message_queue.length + 1
        })
        .eq('id', session.id);
      
      // Update session in Redis (sync with any changes)
      await redisService.cacheHumanSession(leadId, session);
      
      logger.info('Human message sent:', { 
        sessionId: session.id, 
        leadId 
      });
    } catch (error) {
      logger.error('Error sending human message:', error);
      throw error;
    }
  }
  
  async queueMessage(leadId: string, message: string): Promise<void> {
    await this.initializeIfNeeded();
    
    const session = this.activeSessions.get(leadId);
    if (session) {
      session.message_queue.push(message);
      
      // Update Redis cache with new queue
      await redisService.cacheHumanSession(leadId, session);
      
      logger.info('Message queued for human agent:', { 
        sessionId: session.id, 
        queueLength: session.message_queue.length 
      });
    }
  }
  
  async getQueuedMessages(leadId: string): Promise<string[]> {
    await this.initializeIfNeeded();
    
    const session = this.activeSessions.get(leadId);
    if (session) {
      const messages = [...session.message_queue];
      session.message_queue = [];
      
      // Update Redis cache with cleared queue
      await redisService.cacheHumanSession(leadId, session);
      
      return messages;
    }
    return [];
  }
  
  async getActiveSessions(): Promise<HumanControlSession[]> {
    await this.initializeIfNeeded();
    return Array.from(this.activeSessions.values());
  }
  
  async clearAllSessions(): Promise<void> {
    await this.initializeIfNeeded();
    
    // Clear all sessions from memory
    const sessions = Array.from(this.activeSessions.values());
    for (const session of sessions) {
      try {
        await this.leaveConversation(session.lead_id);
      } catch (error) {
        logger.error('Error clearing session:', error);
      }
    }
    // Force clear the map and Redis cache
    this.activeSessions.clear();
    
    // Clear all cached sessions from Redis
    const cachedLeadIds = await redisService.getCachedHumanSessionLeads();
    for (const leadId of cachedLeadIds) {
      await redisService.removeCachedHumanSession(leadId);
    }
    
    logger.info('All human control sessions cleared from memory and cache');
  }
}