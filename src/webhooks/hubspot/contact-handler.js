const { webhookLogger } = require('../../config/logger');
const database = require('../../config/database');

class HubSpotContactHandler {
  constructor() {
    this.logger = webhookLogger.child({ webhook: 'hubspot-contacts' });
    this.redis = database.getRedis();
    this.supabase = database.getSupabase();
  }

  /**
   * Handle HubSpot contact webhook events
   */
  async handleContactWebhook(req, res) {
    try {
      const events = req.body;
      
      this.logger.info('Processing HubSpot webhook', {
        events_count: events.length
      });

      // Process each event
      for (const event of events) {
        await this.processContactEvent(event);
      }

      res.status(200).json({
        success: true,
        message: 'HubSpot webhook processed successfully'
      });

    } catch (error) {
      this.logger.error('HubSpot webhook processing failed', {
        error: error.message,
        body: req.body
      });
      
      res.status(500).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  }

  /**
   * Process individual contact event
   */
  async processContactEvent(event) {
    try {
      const {
        objectId,
        propertyName,
        propertyValue,
        changeSource,
        eventId,
        subscriptionId,
        portalId,
        occurredAt
      } = event;

      this.logger.info('Processing contact event', {
        object_id: objectId,
        property_name: propertyName,
        change_source: changeSource,
        occurred_at: occurredAt
      });

      // Process based on property that changed
      switch (propertyName) {
        case 'lifecyclestage':
          await this.handleLifecycleStageChange(objectId, propertyValue, event);
          break;
          
        case 'lead_status':
          await this.handleLeadStatusChange(objectId, propertyValue, event);
          break;
          
        case 'email':
          await this.handleEmailChange(objectId, propertyValue, event);
          break;
          
        case 'phone':
          await this.handlePhoneChange(objectId, propertyValue, event);
          break;
          
        case 'bike_interest':
          await this.handleBikeInterestChange(objectId, propertyValue, event);
          break;
          
        default:
          await this.handleGenericPropertyChange(objectId, propertyName, propertyValue, event);
      }

      // Store webhook event
      await this.storeWebhookEvent({
        source: 'hubspot',
        event_type: 'contact_property_change',
        object_id: objectId,
        property_name: propertyName,
        property_value: propertyValue,
        change_source: changeSource,
        data: event,
        processed_at: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to process contact event', {
        object_id: event.objectId,
        error: error.message
      });
    }
  }

  /**
   * Handle lifecycle stage changes
   */
  async handleLifecycleStageChange(contactId, newStage, event) {
    try {
      this.logger.info('Contact lifecycle stage changed', {
        contact_id: contactId,
        new_stage: newStage
      });

      // Get contact details from HubSpot or cache
      const contactData = await this.getContactData(contactId);
      
      if (!contactData) {
        this.logger.warn('Contact data not found', { contact_id: contactId });
        return;
      }

      // Update lead in our system
      await this.updateLeadFromHubSpot(contactData, {
        lifecycle_stage: newStage,
        updated_at: new Date().toISOString()
      });

      // Trigger stage-specific actions
      await this.triggerLifecycleStageActions(contactId, newStage, contactData);

      // Broadcast to dashboard
      await this.broadcastContactUpdate({
        type: 'lifecycle_stage_changed',
        contact_id: contactId,
        new_stage: newStage,
        contact_data: contactData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle lifecycle stage change', {
        contact_id: contactId,
        new_stage: newStage,
        error: error.message
      });
    }
  }

  /**
   * Handle lead status changes
   */
  async handleLeadStatusChange(contactId, newStatus, event) {
    try {
      this.logger.info('Contact lead status changed', {
        contact_id: contactId,
        new_status: newStatus
      });

      const contactData = await this.getContactData(contactId);
      
      if (!contactData) return;

      // Update lead status in our system
      await this.updateLeadFromHubSpot(contactData, {
        lead_status: newStatus,
        updated_at: new Date().toISOString()
      });

      // Trigger status-specific actions
      await this.triggerLeadStatusActions(contactId, newStatus, contactData);

      // Broadcast to dashboard
      await this.broadcastContactUpdate({
        type: 'lead_status_changed',
        contact_id: contactId,
        new_status: newStatus,
        contact_data: contactData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle lead status change', {
        contact_id: contactId,
        new_status: newStatus,
        error: error.message
      });
    }
  }

  /**
   * Handle email changes
   */
  async handleEmailChange(contactId, newEmail, event) {
    try {
      this.logger.info('Contact email changed', {
        contact_id: contactId,
        new_email: newEmail?.substring(0, 4) + '***'
      });

      const contactData = await this.getContactData(contactId);
      
      if (!contactData) return;

      // Update email in our system
      await this.updateLeadFromHubSpot(contactData, {
        email: newEmail,
        updated_at: new Date().toISOString()
      });

      // Update email cache
      await this.updateContactCache(contactId, { email: newEmail });

    } catch (error) {
      this.logger.error('Failed to handle email change', {
        contact_id: contactId,
        error: error.message
      });
    }
  }

  /**
   * Handle phone number changes
   */
  async handlePhoneChange(contactId, newPhone, event) {
    try {
      this.logger.info('Contact phone changed', {
        contact_id: contactId,
        new_phone: newPhone?.substring(0, 4) + '***'
      });

      const contactData = await this.getContactData(contactId);
      
      if (!contactData) return;

      // Normalize phone number
      const { normalizePhoneNumber } = require('../../utils/validation');
      const normalizedPhone = normalizePhoneNumber(newPhone);

      // Update phone in our system
      await this.updateLeadFromHubSpot(contactData, {
        phone_number_normalized: normalizedPhone,
        updated_at: new Date().toISOString()
      });

      // Update phone cache
      await this.updateContactCache(contactId, { phone: normalizedPhone });

    } catch (error) {
      this.logger.error('Failed to handle phone change', {
        contact_id: contactId,
        error: error.message
      });
    }
  }

  /**
   * Handle bike interest changes
   */
  async handleBikeInterestChange(contactId, newInterest, event) {
    try {
      this.logger.info('Contact bike interest changed', {
        contact_id: contactId,
        new_interest: newInterest
      });

      const contactData = await this.getContactData(contactId);
      
      if (!contactData) return;

      // Update bike interest in our system
      await this.updateLeadFromHubSpot(contactData, {
        bike_interest: newInterest,
        updated_at: new Date().toISOString()
      });

      // Trigger interest-specific actions (recommendations, follow-ups)
      await this.triggerBikeInterestActions(contactId, newInterest, contactData);

    } catch (error) {
      this.logger.error('Failed to handle bike interest change', {
        contact_id: contactId,
        new_interest: newInterest,
        error: error.message
      });
    }
  }

  /**
   * Handle generic property changes
   */
  async handleGenericPropertyChange(contactId, propertyName, propertyValue, event) {
    try {
      this.logger.info('Contact property changed', {
        contact_id: contactId,
        property_name: propertyName,
        property_value: propertyValue
      });

      // Update contact cache
      await this.updateContactCache(contactId, {
        [propertyName]: propertyValue
      });

    } catch (error) {
      this.logger.error('Failed to handle generic property change', {
        contact_id: contactId,
        property_name: propertyName,
        error: error.message
      });
    }
  }

  /**
   * Get contact data from cache or HubSpot API
   */
  async getContactData(contactId) {
    try {
      // Try cache first
      const cached = await this.redis.get(`hubspot_contact:${contactId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // If not cached, would fetch from HubSpot API
      // For now, return basic structure
      return {
        id: contactId,
        email: null,
        phone: null,
        firstname: null,
        lastname: null,
        lifecycle_stage: null,
        lead_status: null,
        bike_interest: null
      };

    } catch (error) {
      this.logger.error('Failed to get contact data', {
        contact_id: contactId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Update lead in our system based on HubSpot data
   */
  async updateLeadFromHubSpot(contactData, updates) {
    try {
      // Find existing lead by HubSpot contact ID or email/phone
      let { data: existingLead } = await this.supabase
        .from('leads')
        .select('*')
        .or(`
          metadata->>hubspot_contact_id.eq.${contactData.id},
          email.eq.${contactData.email || 'null'},
          phone_number_normalized.eq.${contactData.phone || 'null'}
        `)
        .single();

      if (existingLead) {
        // Update existing lead
        const leadUpdates = {
          ...updates,
          metadata: {
            ...existingLead.metadata,
            hubspot_contact_id: contactData.id,
            last_hubspot_sync: new Date().toISOString()
          }
        };

        await this.supabase
          .from('leads')
          .update(leadUpdates)
          .eq('id', existingLead.id);

        this.logger.info('Lead updated from HubSpot', {
          lead_id: existingLead.id,
          hubspot_contact_id: contactData.id
        });

      } else {
        // Create new lead if contact has sufficient data
        if (contactData.email || contactData.phone) {
          const newLead = {
            id: `hubspot_${contactData.id}_${Date.now()}`,
            organization_id: process.env.DEFAULT_ORGANIZATION_ID,
            customer_name: `${contactData.firstname || ''} ${contactData.lastname || ''}`.trim(),
            email: contactData.email,
            phone_number_normalized: contactData.phone,
            lead_source: 'hubspot_sync',
            ...updates,
            metadata: {
              hubspot_contact_id: contactData.id,
              created_from_hubspot: true,
              last_hubspot_sync: new Date().toISOString()
            },
            created_at: new Date().toISOString()
          };

          await this.supabase
            .from('leads')
            .insert(newLead);

          this.logger.info('New lead created from HubSpot', {
            lead_id: newLead.id,
            hubspot_contact_id: contactData.id
          });
        }
      }

    } catch (error) {
      this.logger.error('Failed to update lead from HubSpot', {
        hubspot_contact_id: contactData.id,
        error: error.message
      });
    }
  }

  /**
   * Update contact cache
   */
  async updateContactCache(contactId, updates) {
    try {
      const cacheKey = `hubspot_contact:${contactId}`;
      const cached = await this.redis.get(cacheKey);
      
      let contactData = cached ? JSON.parse(cached) : { id: contactId };
      contactData = { ...contactData, ...updates, cached_at: new Date().toISOString() };

      await this.redis.setex(cacheKey, 3600, JSON.stringify(contactData)); // 1 hour cache

    } catch (error) {
      this.logger.warn('Failed to update contact cache', {
        contact_id: contactId,
        error: error.message
      });
    }
  }

  /**
   * Trigger actions based on lifecycle stage
   */
  async triggerLifecycleStageActions(contactId, stage, contactData) {
    try {
      switch (stage) {
        case 'lead':
          // New lead actions
          await this.sendWelcomeSequence(contactData);
          break;
          
        case 'marketingqualifiedlead':
          // MQL actions
          await this.assignToSalesRep(contactData);
          break;
          
        case 'salesqualifiedlead':
          // SQL actions
          await this.scheduleFollowUpCall(contactData);
          break;
          
        case 'opportunity':
          // Opportunity actions
          await this.createSalesOpportunity(contactData);
          break;
          
        case 'customer':
          // New customer actions
          await this.sendCustomerOnboarding(contactData);
          break;
      }
    } catch (error) {
      this.logger.error('Failed to trigger lifecycle stage actions', {
        contact_id: contactId,
        stage,
        error: error.message
      });
    }
  }

  /**
   * Trigger actions based on lead status
   */
  async triggerLeadStatusActions(contactId, status, contactData) {
    try {
      switch (status) {
        case 'new':
          await this.prioritizeNewLead(contactData);
          break;
          
        case 'in_progress':
          await this.trackLeadProgress(contactData);
          break;
          
        case 'connected':
          await this.scheduleFollowUp(contactData);
          break;
          
        case 'bad_timing':
          await this.scheduleNurtureSequence(contactData);
          break;
      }
    } catch (error) {
      this.logger.error('Failed to trigger lead status actions', {
        contact_id: contactId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Trigger actions based on bike interest
   */
  async triggerBikeInterestActions(contactId, interest, contactData) {
    try {
      // Send relevant product recommendations
      await this.sendProductRecommendations(contactData, interest);
      
      // Create targeted marketing campaign
      await this.addToTargetedCampaign(contactData, interest);
      
    } catch (error) {
      this.logger.error('Failed to trigger bike interest actions', {
        contact_id: contactId,
        interest,
        error: error.message
      });
    }
  }

  /**
   * Action implementations (placeholder methods)
   */
  async sendWelcomeSequence(contactData) {
    this.logger.info('Sending welcome sequence', { contact_id: contactData.id });
  }

  async assignToSalesRep(contactData) {
    this.logger.info('Assigning to sales rep', { contact_id: contactData.id });
  }

  async scheduleFollowUpCall(contactData) {
    this.logger.info('Scheduling follow-up call', { contact_id: contactData.id });
  }

  async createSalesOpportunity(contactData) {
    this.logger.info('Creating sales opportunity', { contact_id: contactData.id });
  }

  async sendCustomerOnboarding(contactData) {
    this.logger.info('Sending customer onboarding', { contact_id: contactData.id });
  }

  async prioritizeNewLead(contactData) {
    this.logger.info('Prioritizing new lead', { contact_id: contactData.id });
  }

  async trackLeadProgress(contactData) {
    this.logger.info('Tracking lead progress', { contact_id: contactData.id });
  }

  async scheduleFollowUp(contactData) {
    this.logger.info('Scheduling follow-up', { contact_id: contactData.id });
  }

  async scheduleNurtureSequence(contactData) {
    this.logger.info('Scheduling nurture sequence', { contact_id: contactData.id });
  }

  async sendProductRecommendations(contactData, interest) {
    this.logger.info('Sending product recommendations', { 
      contact_id: contactData.id,
      interest 
    });
  }

  async addToTargetedCampaign(contactData, interest) {
    this.logger.info('Adding to targeted campaign', { 
      contact_id: contactData.id,
      interest 
    });
  }

  /**
   * Utility methods
   */
  async broadcastContactUpdate(data) {
    try {
      await this.redis.lpush(
        'contact_updates',
        JSON.stringify(data)
      );
      
      await this.redis.ltrim('contact_updates', 0, 99);
    } catch (error) {
      this.logger.warn('Failed to broadcast contact update', {
        error: error.message
      });
    }
  }

  async storeWebhookEvent(event) {
    try {
      await this.supabase
        .from('webhook_events')
        .insert({
          source: event.source,
          event_type: event.event_type,
          object_id: event.object_id,
          data: event,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      this.logger.warn('Failed to store webhook event', {
        error: error.message
      });
    }
  }
}

module.exports = HubSpotContactHandler;