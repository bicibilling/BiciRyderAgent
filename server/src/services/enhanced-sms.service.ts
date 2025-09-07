import { twilioClient, formatPhoneNumber } from '../config/twilio.config';
import { ConversationService } from './conversation.service';
import { logger } from '../utils/logger';
import { CallSession, ConversationInsights } from '../types';
import { broadcastToClients } from './realtime.service';
import { storeInfo, businessHours } from '../config/elevenlabs.config';
import { redisService } from './redis.service';

const conversationService = new ConversationService();

interface SMSTemplate {
  condition: (insights: ConversationInsights, transcript?: string) => boolean;
  message: (insights: ConversationInsights) => string;
  delay?: number; // Delay in milliseconds before sending
  priority: number; // Higher priority templates are checked first
}

export class EnhancedSMSAutomationService {
  // Enhanced templates with smart conditions
  private smartTemplates: SMSTemplate[] = [
    // Store Hours Template
    {
      condition: (insights) => {
        const triggers = Array.isArray(insights.triggers) ? insights.triggers : 
                        typeof insights.triggers === 'string' ? [insights.triggers] : [];
        return triggers.some(t => 
          t.includes('asked_hours') || 
          t.includes('when_open') || 
          t.includes('store hours')
        );
      },
      message: () => {
        const hours = this.getTodaysHours();
        const isOpen = this.isStoreOpen();
        return isOpen 
          ? `🚴 BICI is open now until ${this.getClosingTime()}! Our full hours:\n${this.getWeeklyHours()}\n📍 ${storeInfo.address}`
          : `🚴 BICI is currently closed. We'll be open ${this.getNextOpenTime()}.\n\nFull hours:\n${this.getWeeklyHours()}`;
      },
      delay: 0,
      priority: 10
    },

    // Directions Template with Maps Integration
    {
      condition: (insights) => {
        const triggers = Array.isArray(insights.triggers) ? insights.triggers : 
                        typeof insights.triggers === 'string' ? [insights.triggers] : [];
        return triggers.some(t => 
          t.includes('asked_directions') || 
          t.includes('where_located') ||
          t.includes('how_to_get') ||
          t.includes('directions/location')
        );
      },
      message: () => {
        const encodedAddress = encodeURIComponent(storeInfo.address);
        return `📍 BICI Bike Store\n${storeInfo.address}\n\n` +
               `🗺️ Get Directions:\n` +
               `• Google Maps: https://maps.google.com/?q=${encodedAddress}\n` +
               `• Apple Maps: https://maps.apple.com/?address=${encodedAddress}\n\n` +
               `Free parking available! 🚗`;
      },
      delay: 0,
      priority: 9
    },







  ];

  async triggerSmartAutomation(
    session: CallSession, 
    insights: ConversationInsights,
    transcript?: string
  ): Promise<void> {
    try {
      // Get lead information
      const leadService = new (await import('./lead.service')).LeadService();
      const lead = await leadService.getLead(session.lead_id);
      
      if (!lead || !lead.phone_number) {
        logger.error('Lead or phone number not found for SMS automation');
        return;
      }

      // Check cached SMS automation state to prevent duplicate messages
      const cachedAutomationState = await redisService.getCachedSMSAutomationState(session.lead_id);
      const recentlySent = cachedAutomationState?.recentMessages || [];
      
      // Filter out messages sent in the last hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const validRecentMessages = recentlySent.filter((msg: any) => 
        new Date(msg.sent_at).getTime() > oneHourAgo
      );

      logger.info('SMS Automation Debug:', {
        followUpNeeded: insights.followUpNeeded,
        triggers: insights.triggers,
        triggersType: typeof insights.triggers,
        triggersLength: insights.triggers?.length,
        classification: insights.classification,
        recentMessageCount: validRecentMessages.length
      });

      const scheduledMessages: Array<{message: string, delay: number, template?: string}> = [];

      // Only send automated SMS if there's a specific reason to do so
      // First, check if ElevenLabs has recommended a specific follow-up
      if (insights.followUpNeeded && 
          insights.followUpNeeded !== 'none' && 
          insights.followUpNeeded !== 'no follow-up needed' &&
          insights.followUpNeeded !== 'no' &&
          insights.followUpNeeded !== 'false') {
        logger.info('ElevenLabs recommended follow-up:', insights.followUpNeeded);
        
        // Map ElevenLabs recommendations to specific messages - ONLY hours and directions
        const elevenLabsTemplates: Record<string, () => string> = {
          'send_hours': () => this.smartTemplates.find(t => t.message({} as any).includes('hours'))?.message(insights) || '',
          'send store hours': () => this.smartTemplates.find(t => t.message({} as any).includes('hours'))?.message(insights) || '',
          'send_directions': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || '',
          'send directions with map links': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || '',
          'send directions': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || '',
          'send location': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || ''
        };
        
        const recommendedMessage = elevenLabsTemplates[insights.followUpNeeded];
        const templateType = insights.followUpNeeded.includes('hours') ? 'store_hours' :
                            insights.followUpNeeded.includes('directions') ? 'directions' : 'general';
        
        // Check if we've recently sent this type of message
        const alreadySent = validRecentMessages.some((msg: any) => msg.template === templateType);
        
        if (recommendedMessage && !alreadySent) {
          scheduledMessages.push({
            message: recommendedMessage(),
            delay: insights.followUpNeeded.includes('manager') ? 0 : 2 * 60 * 1000, // Immediate for escalations
            template: templateType
          });
        } else if (alreadySent) {
          logger.info(`Skipping ${templateType} message - already sent recently for lead ${session.lead_id}`);
        }
      }
      
      // Only use trigger-based templates if we have specific action triggers
      // Don't send generic follow-ups just because conversation happened
      const hasTriggers = insights.triggers && 
                         (Array.isArray(insights.triggers) ? insights.triggers.length > 0 : 
                          typeof insights.triggers === 'string' ? (insights.triggers as string).length > 0 : false);
      
      // Only check for specific actionable triggers - hours and directions only
      const actionableTriggers = ['asked_hours', 'asked_directions', 'where_located', 'store hours', 
                                  'when_open', 'how_to_get', 'location', 'address'];
      
      if (scheduledMessages.length === 0 && hasTriggers) {
        const triggersArray = Array.isArray(insights.triggers) ? insights.triggers : 
                             typeof insights.triggers === 'string' ? [insights.triggers] : [];
        
        const hasActionableTrigger = triggersArray.some(trigger => 
          actionableTriggers.some(actionable => trigger.includes(actionable))
        );
        
        if (hasActionableTrigger) {
          logger.info('Found actionable triggers, checking templates:', insights.triggers);
          
          // Sort templates by priority
          const sortedTemplates = [...this.smartTemplates].sort((a, b) => b.priority - a.priority);
          
          // Check each template condition and schedule messages
          for (const template of sortedTemplates) {
            if (template.condition(insights, transcript)) {
              const message = template.message(insights);
              const templateType = message.includes('hours') ? 'store_hours' :
                                 message.includes('Directions') ? 'directions' : 'general';
              
              // Check if we've recently sent this type of message
              const alreadySent = validRecentMessages.some((msg: any) => msg.template === templateType);
              
              if (!alreadySent) {
                scheduledMessages.push({
                  message,
                  delay: template.delay || 0,
                  template: templateType
                });
              } else {
                logger.info(`Skipping ${templateType} template message - already sent recently for lead ${session.lead_id}`);
              }
              
              // Only send ONE message for actionable triggers
              break;
            }
          }
        } else {
          logger.info('No actionable triggers found, skipping automated SMS');
        }
      }

      // Send scheduled messages and update automation state
      const sentMessages: Array<{template: string, sent_at: string}> = [];
      
      for (const scheduled of scheduledMessages) {
        const sendMessage = async () => {
          await this.sendSMS(
            lead.phone_number,
            scheduled.message,
            session.organization_id
          );
          
          // Track sent message
          sentMessages.push({
            template: scheduled.template || 'general',
            sent_at: new Date().toISOString()
          });
        };
        
        if (scheduled.delay > 0) {
          setTimeout(sendMessage, scheduled.delay);
        } else {
          await sendMessage();
        }
        
        // Add delay between immediate messages
        if (scheduled.delay === 0 && scheduledMessages.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Update SMS automation state in cache
      if (sentMessages.length > 0) {
        const updatedAutomationState = {
          recentMessages: [...validRecentMessages, ...sentMessages],
          lastAutomationRun: new Date().toISOString(),
          totalMessagesSent: (cachedAutomationState?.totalMessagesSent || 0) + sentMessages.length
        };
        
        await redisService.cacheSMSAutomationState(session.lead_id, updatedAutomationState);
      }

      logger.info('Smart SMS automation triggered:', {
        sessionId: session.id,
        messageCount: scheduledMessages.length,
        classification: insights.classification,
        triggers: insights.triggers,
        sentMessageTemplates: sentMessages.map(m => m.template)
      });

    } catch (error) {
      logger.error('Error in smart SMS automation:', error);
    }
  }

  private async sendSMS(to: string, message: string, organizationId: string): Promise<any> {
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
        preview: message.substring(0, 50) + '...'
      });
      
      // Store in database
      await conversationService.storeConversation({
        organization_id: organizationId,
        phone_number_normalized: to.replace(/\D/g, ''),
        content: message,
        sent_by: 'agent',
        type: 'sms',
        metadata: { 
          message_sid: result.sid,
          automated: true,
          template_type: this.detectTemplateType(message)
        }
      });
      
      return result;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw error;
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

  private getClosingTime(): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const hours = businessHours[today as keyof typeof businessHours];
    return hours.close || 'soon';
  }

  private getNextOpenTime(): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date().getDay();
    
    for (let i = 1; i <= 7; i++) {
      const nextDay = (today + i) % 7;
      const dayName = days[nextDay];
      const hours = businessHours[dayName as keyof typeof businessHours];
      
      if (hours.open !== 'closed') {
        if (i === 1) return `tomorrow at ${hours.open}`;
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} at ${hours.open}`;
      }
    }
    
    return 'soon';
  }

  private getWeeklyHours(): string {
    return `Mon-Fri: 8:00 AM - 6:00 PM\nSat-Sun: 9:00 AM - 4:30 PM`;
  }

  private isStoreOpen(): boolean {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    const hours = businessHours[today as keyof typeof businessHours];
    
    if (hours.open === 'closed') return false;
    
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const openTime = parseInt(hours.open.replace(':', ''));
    const closeTime = parseInt(hours.close.replace(':', ''));
    
    return currentTime >= openTime && currentTime < closeTime;
  }


  private detectTemplateType(message: string): string {
    if (message.includes('hours')) return 'store_hours';
    if (message.includes('directions') || message.includes('Maps')) return 'directions';
    return 'general';
  }
}