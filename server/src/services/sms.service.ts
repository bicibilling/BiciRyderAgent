import { twilioClient, formatPhoneNumber } from '../config/twilio.config';
import { ConversationService } from './conversation.service';
import { logger } from '../utils/logger';
import { CallSession, ConversationInsights } from '../types';
import { storeInfo, businessHours } from '../config/elevenlabs.config';

const conversationService = new ConversationService();

export class SMSAutomationService {
  private automationTemplates = {
    store_hours: (hours: string) => 
      `Thanks for calling BICI! 🚴 Our hours today are ${hours}. We're located at ${storeInfo.address}. See you soon!`,
    
    appointment_confirmation: (date: string, time: string) =>
      `Your service appointment at BICI is confirmed for ${date} at ${time}. Please bring your bike 15 minutes early for check-in. Reply CANCEL to cancel.`,
    
    directions: () =>
      `BICI is located at ${storeInfo.address}. Get directions: https://maps.google.com/?q=${encodeURIComponent(storeInfo.address)}`,
    
    follow_up: (name: string = 'there') =>
      `Hi ${name}, thanks for your interest in our bikes! Feel free to call us at ${storeInfo.phone} or visit our store. Happy cycling! 🚴`,
    
    escalation_notification: () =>
      `We've received your message and one of our team members will get back to you shortly. For immediate assistance, call ${storeInfo.phone}.`,
      
    service_info: () =>
      `BICI offers: ${storeInfo.services.join(', ')}. Call us at ${storeInfo.phone} to learn more!`
  };
  
  async sendSMS(to: string, message: string, organizationId: string): Promise<any> {
    try {
      const formattedTo = formatPhoneNumber(to);
      
      const result = await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: formattedTo
      });
      
      logger.info('SMS sent successfully:', { 
        to: formattedTo, 
        messageSid: result.sid,
        messageLength: message.length 
      });
      
      // Store the sent message
      await conversationService.storeConversation({
        organization_id: organizationId,
        phone_number_normalized: to.replace(/\D/g, ''),
        content: message,
        sent_by: 'agent',
        type: 'sms',
        metadata: { message_sid: result.sid }
      });
      
      // Log to automation table
      await this.logAutomation(organizationId, to, message, result.sid);
      
      return result;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw error;
    }
  }
  
  async triggerAutomation(session: CallSession, insights: ConversationInsights): Promise<void> {
    try {
      // Get lead to get phone number
      const leadService = new (await import('./lead.service')).LeadService();
      const lead = await leadService.getLead(session.lead_id);
      if (!lead || !lead.phone_number) {
        logger.error('Lead or phone number not found for SMS automation');
        return;
      }
      
      const { triggers, classification } = insights;
      const messages: string[] = [];
      
      // Check for specific triggers
      if (triggers.includes('asked_hours')) {
        const hours = this.getTodaysHours();
        messages.push(this.automationTemplates.store_hours(hours));
      }
      
      if (triggers.includes('asked_directions')) {
        messages.push(this.automationTemplates.directions());
      }
      
      if (triggers.includes('appointment_request') && insights.appointmentScheduled) {
        // For now, send a general appointment message
        messages.push('Thanks for your interest in scheduling an appointment! Our team will contact you shortly to confirm the details.');
      }
      
      // Send follow-up for sales inquiries
      if (classification === 'sales' && insights.purchaseIntent && insights.purchaseIntent > 0.5) {
        // Delay this message by 5 minutes
        setTimeout(async () => {
          await this.sendSMS(
            lead.phone_number,
            this.automationTemplates.follow_up(),
            session.organization_id
          );
        }, 5 * 60 * 1000);
      }
      
      // Send messages
      for (const message of messages) {
        await this.sendSMS(
          lead.phone_number,
          message,
          session.organization_id
        );
        
        // Add small delay between multiple messages
        if (messages.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info('SMS automation triggered:', { 
        sessionId: session.id, 
        messageCount: messages.length,
        triggers 
      });
    } catch (error) {
      logger.error('Error in SMS automation:', error);
    }
  }
  
  private getTodaysHours(): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const hours = businessHours[today as keyof typeof businessHours];
    
    if (hours.open === 'closed') {
      return 'Closed today';
    }
    
    return `${hours.open} - ${hours.close}`;
  }
  
  private async logAutomation(
    organizationId: string, 
    phoneNumber: string, 
    message: string, 
    messageSid: string
  ): Promise<void> {
    try {
      const { supabase } = await import('../config/supabase.config');
      
      await supabase
        .from('sms_automation_log')
        .insert({
          organization_id: organizationId,
          phone_number: phoneNumber,
          message_content: message,
          template_type: this.detectTemplateType(message),
          sent_at: new Date(),
          status: 'sent',
          message_sid: messageSid
        });
    } catch (error) {
      logger.error('Error logging SMS automation:', error);
    }
  }
  
  private detectTemplateType(message: string): string {
    if (message.includes('hours')) return 'store_hours';
    if (message.includes('appointment')) return 'appointment_confirmation';
    if (message.includes('directions')) return 'directions';
    if (message.includes('thanks for your interest')) return 'follow_up';
    return 'general';
  }
}