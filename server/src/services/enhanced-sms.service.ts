import { twilioClient, formatPhoneNumber } from '../config/twilio.config';
import { ConversationService } from './conversation.service';
import { logger } from '../utils/logger';
import { CallSession, ConversationInsights } from '../types';
import { broadcastToClients } from './realtime.service';
import { storeInfo, businessHours } from '../config/elevenlabs.config';

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

    // Sales Follow-up for High Intent
    {
      condition: (insights) => 
        insights.classification === 'sales' && 
        insights.purchaseIntent && 
        insights.purchaseIntent > 0.7,
      message: (insights) => {
        const name = insights.customerName || 'there';
        const bikeType = insights.bikePreferences?.type || 'bike';
        return `Hi ${name}! 🚴 Thanks for your interest in our ${bikeType}s!\n\n` +
               `Ready to test ride? We have demo bikes available.\n` +
               `Call ${storeInfo.phone} or reply to schedule your visit.\n\n` +
               `Pro tip: Weekday mornings are less busy for personalized service! 💡`;
      },
      delay: 5 * 60 * 1000, // 5 minutes
      priority: 8
    },

    // Service Appointment Reminder
    {
      condition: (insights) => 
        insights.classification === 'service' && 
        insights.appointmentScheduled,
      message: (insights) => {
        const appointmentDetails = insights.appointmentDetails || {};
        return `🔧 Service Appointment Confirmed!\n\n` +
               `Please bring:\n` +
               `• Your bike (obviously! 😊)\n` +
               `• Any specific parts/accessories\n` +
               `• Previous service records if available\n\n` +
               `Our expert mechanics are ready to help! Reply CANCEL to cancel.`;
      },
      delay: 0,
      priority: 10
    },

    // Support Issue Escalation
    {
      condition: (insights) => 
        insights.classification === 'support' && 
        insights.sentiment && 
        insights.sentiment < 0.3,
      message: () => 
        `We understand your concern and want to help! 🤝\n\n` +
        `A manager will call you within 30 minutes.\n` +
        `You can also reach them directly at ${storeInfo.phone} ext. 2.\n\n` +
        `Your satisfaction is our priority.`,
      delay: 0,
      priority: 11
    },

    // Bike Recommendations ONLY if explicitly asked for recommendations or models
    {
      condition: (insights) => {
        const triggers = Array.isArray(insights.triggers) ? insights.triggers : 
                        typeof insights.triggers === 'string' ? [insights.triggers] : [];
        return insights.classification === 'sales' && 
               insights.bikePreferences?.type &&
               triggers.some(t => 
                 t.includes('recommendation') || 
                 t.includes('suggest') ||
                 t.includes('which bike') ||
                 t.includes('what models')
               );
      },
      message: (insights) => {
        const bikeType = insights.bikePreferences?.type || 'bike';
        const recommendations = this.getBikeRecommendations(bikeType);
        return `🚴 Based on your interest in ${bikeType}s:\n\n${recommendations}\n\n` +
               `Visit us for a test ride or call ${storeInfo.phone} for availability!`;
      },
      delay: 2 * 60 * 1000, // 2 minutes
      priority: 6
    },

    // Price Quote Follow-up
    {
      condition: (insights) => {
        const triggers = Array.isArray(insights.triggers) ? insights.triggers : 
                        typeof insights.triggers === 'string' ? [insights.triggers] : [];
        return triggers.some(t => 
          t.includes('asked_price') || 
          t.includes('budget_mentioned') ||
          t.includes('price')
        );
      },
      message: (insights) => {
        const budget = insights.budgetRange || 'your budget';
        return `💰 BICI Price Match Guarantee!\n\n` +
               `We'll match any local competitor's price.\n` +
               `Financing available from $50/month.\n\n` +
               `Current promotions:\n` +
               `• 10% off accessories with bike purchase\n` +
               `• Free first service (value $89)\n` +
               `• 0% financing for 6 months (OAC)\n\n` +
               `Visit us to discuss options within ${budget}!`;
      },
      delay: 3 * 60 * 1000, // 3 minutes
      priority: 7
    },


    // Only send thank you if customer expressed strong interest and needs follow-up
    {
      condition: (insights) => 
        insights.classification === 'sales' && 
        insights.purchaseIntent && 
        insights.purchaseIntent > 0.5 &&
        insights.purchaseIntent <= 0.7 && // Mid-level interest (high intent already handled above)
        !insights.appointmentScheduled,
      message: (insights) => {
        const name = insights.customerName || 'there';
        return `Thanks for your interest, ${name}! 🚴\n\n` +
               `Feel free to reach out with any questions:\n` +
               `📞 ${storeInfo.phone}\n` +
               `📧 ${storeInfo.email}\n\n` +
               `We're here to help find your perfect bike!`;
      },
      delay: 10 * 60 * 1000, // 10 minutes
      priority: 1
    }
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

      logger.info('SMS Automation Debug:', {
        followUpNeeded: insights.followUpNeeded,
        triggers: insights.triggers,
        triggersType: typeof insights.triggers,
        triggersLength: insights.triggers?.length,
        classification: insights.classification
      });

      const scheduledMessages: Array<{message: string, delay: number}> = [];

      // Only send automated SMS if there's a specific reason to do so
      // First, check if ElevenLabs has recommended a specific follow-up
      if (insights.followUpNeeded && 
          insights.followUpNeeded !== 'none' && 
          insights.followUpNeeded !== 'no follow-up needed' &&
          insights.followUpNeeded !== 'no' &&
          insights.followUpNeeded !== 'false') {
        logger.info('ElevenLabs recommended follow-up:', insights.followUpNeeded);
        
        // Map ElevenLabs recommendations to specific messages
        const elevenLabsTemplates: Record<string, () => string> = {
          'send_hours': () => this.smartTemplates.find(t => t.message({} as any).includes('hours'))?.message(insights) || '',
          'send store hours': () => this.smartTemplates.find(t => t.message({} as any).includes('hours'))?.message(insights) || '',
          'send_directions': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || '',
          'send directions with map links': () => this.smartTemplates.find(t => t.message({} as any).includes('Directions'))?.message(insights) || '',
          'send_price_list': () => this.smartTemplates.find(t => t.message({} as any).includes('Price Match'))?.message(insights) || '',
          'send price list': () => this.smartTemplates.find(t => t.message({} as any).includes('Price Match'))?.message(insights) || '',
          'confirm_appointment': () => `🔧 Service Appointment Confirmed!\n\nPlease bring:\n• Your bike\n• Any specific parts/accessories\n• Previous service records if available\n\nOur expert mechanics are ready to help!`,
          'confirm appointment details': () => `🔧 Service Appointment Confirmed!\n\nPlease bring:\n• Your bike\n• Any specific parts/accessories\n• Previous service records if available\n\nOur expert mechanics are ready to help!`,
          'manager_callback': () => `We understand your concern! 🤝\n\nA manager will call you within 30 minutes.\nYou can also reach them directly at ${storeInfo.phone} ext. 2.\n\nYour satisfaction is our priority.`,
          'arrange manager callback for escalation': () => `We understand your concern! 🤝\n\nA manager will call you within 30 minutes.\nYou can also reach them directly at ${storeInfo.phone} ext. 2.\n\nYour satisfaction is our priority.`,
          'thank_you': () => `Thanks for calling BICI! 🚴\n\nWe're here to help:\n📞 ${storeInfo.phone}\n📧 ${storeInfo.email}\n🌐 ${storeInfo.website}\n\nHappy cycling! 🌟`,
          'send thank you message': () => `Thanks for calling BICI! 🚴\n\nWe're here to help:\n📞 ${storeInfo.phone}\n📧 ${storeInfo.email}\n🌐 ${storeInfo.website}\n\nHappy cycling! 🌟`
        };
        
        const recommendedMessage = elevenLabsTemplates[insights.followUpNeeded];
        if (recommendedMessage) {
          scheduledMessages.push({
            message: recommendedMessage(),
            delay: insights.followUpNeeded.includes('manager') ? 0 : 2 * 60 * 1000 // Immediate for escalations
          });
        }
      }
      
      // Only use trigger-based templates if we have specific action triggers
      // Don't send generic follow-ups just because conversation happened
      const hasTriggers = insights.triggers && 
                         (Array.isArray(insights.triggers) ? insights.triggers.length > 0 : 
                          typeof insights.triggers === 'string' ? (insights.triggers as string).length > 0 : false);
      
      // Only check for specific actionable triggers - hours, directions, appointments
      const actionableTriggers = ['asked_hours', 'asked_directions', 'where_located', 'store hours', 
                                  'when_open', 'how_to_get', 'appointment', 'asked_price'];
      
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
              scheduledMessages.push({
                message,
                delay: template.delay || 0
              });
              
              // Only send ONE message for actionable triggers
              break;
            }
          }
        } else {
          logger.info('No actionable triggers found, skipping automated SMS');
        }
      }

      // Send scheduled messages
      for (const scheduled of scheduledMessages) {
        if (scheduled.delay > 0) {
          setTimeout(async () => {
            await this.sendSMS(
              lead.phone_number,
              scheduled.message,
              session.organization_id
            );
          }, scheduled.delay);
        } else {
          await this.sendSMS(
            lead.phone_number,
            scheduled.message,
            session.organization_id
          );
        }
        
        // Add delay between immediate messages
        if (scheduled.delay === 0 && scheduledMessages.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      logger.info('Smart SMS automation triggered:', {
        sessionId: session.id,
        messageCount: scheduledMessages.length,
        classification: insights.classification,
        triggers: insights.triggers
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

  private isGoodBikingWeather(): boolean {
    // This could integrate with a weather API
    // For now, return true during daylight hours
    const hour = new Date().getHours();
    return hour >= 8 && hour <= 19;
  }

  private getBikeRecommendations(bikeType: string): string {
    const recommendations: Record<string, string> = {
      'road': '• Specialized Allez - $1,200\n• Trek Domane AL - $1,400\n• Giant Contend - $950',
      'mountain': '• Trek Marlin 7 - $850\n• Specialized Rockhopper - $750\n• Giant Talon - $680',
      'hybrid': '• Trek FX 3 - $850\n• Specialized Sirrus - $700\n• Giant Escape - $650',
      'e-bike': '• Specialized Turbo Vado - $3,500\n• Trek Verve+ - $2,800\n• Giant Explore E+ - $2,400',
      'kids': '• Trek Precaliber - $350\n• Specialized Riprock - $400\n• Giant ARX - $320'
    };
    
    return recommendations[bikeType.toLowerCase()] || 
           '• Various models available\n• Test rides recommended\n• Expert fitting included';
  }

  private detectTemplateType(message: string): string {
    if (message.includes('hours')) return 'store_hours';
    if (message.includes('directions')) return 'directions';
    if (message.includes('appointment')) return 'appointment';
    if (message.includes('test ride')) return 'sales_followup';
    if (message.includes('price')) return 'price_quote';
    if (message.includes('weather')) return 'weather_suggestion';
    if (message.includes('concern')) return 'support_escalation';
    return 'general';
  }
}