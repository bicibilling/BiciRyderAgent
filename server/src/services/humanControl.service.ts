import { supabase } from '../config/supabase.config';
import { ConversationService } from './conversation.service';
import { SMSAutomationService } from './sms.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

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
  
  async isUnderHumanControl(leadId: string): Promise<boolean> {
    return this.activeSessions.has(leadId);
  }
  
  async joinConversation(
    leadId: string,
    agentName: string,
    organizationId: string
  ): Promise<HumanControlSession> {
    try {
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
      
      // Store in memory
      this.activeSessions.set(leadId, session);
      
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
      
      // Remove from memory
      this.activeSessions.delete(leadId);
      
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
      
      // Update session
      await supabase
        .from('human_control_sessions')
        .update({
          messages_handled: session.message_queue.length + 1
        })
        .eq('id', session.id);
      
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
    const session = this.activeSessions.get(leadId);
    if (session) {
      session.message_queue.push(message);
      logger.info('Message queued for human agent:', { 
        sessionId: session.id, 
        queueLength: session.message_queue.length 
      });
    }
  }
  
  async getQueuedMessages(leadId: string): Promise<string[]> {
    const session = this.activeSessions.get(leadId);
    if (session) {
      const messages = [...session.message_queue];
      session.message_queue = [];
      return messages;
    }
    return [];
  }
  
  getActiveSessions(): HumanControlSession[] {
    return Array.from(this.activeSessions.values());
  }
}