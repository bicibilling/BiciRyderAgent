const { Client } = require('@hubspot/api-client');
const { integrationLogger } = require('../../config/logger');
const { normalizePhoneNumber, validateEmail } = require('../../utils/validation');

class HubSpotClient {
  constructor() {
    this.client = new Client({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN
    });

    this.logger = integrationLogger.child({ integration: 'hubspot' });
  }

  /**
   * Search for contacts by email or phone number
   */
  async searchContact(email, phoneNumber) {
    try {
      this.logger.info('Searching HubSpot contact', { 
        email: email ? email.substring(0, 4) + '***' : null,
        phone: phoneNumber ? phoneNumber.substring(0, 4) + '***' : null 
      });

      if (!email && !phoneNumber) {
        throw new Error('Either email or phone number is required');
      }

      const searchQuery = {
        filterGroups: [
          {
            filters: []
          }
        ],
        properties: [
          'email', 'phone', 'firstname', 'lastname', 'company',
          'lifecycle_stage', 'lead_status', 'last_activity_date',
          'bike_interest', 'lead_source', 'createdate', 'lastmodifieddate',
          'hs_lead_status', 'num_associated_deals'
        ]
      };

      // Add filters based on available identifiers
      if (email) {
        const { isValid, normalized } = validateEmail(email);
        if (!isValid) {
          throw new Error('Invalid email format');
        }
        searchQuery.filterGroups[0].filters.push({
          propertyName: 'email',
          operator: 'EQ',
          value: normalized
        });
      }

      if (phoneNumber) {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        // Add phone filter (if email wasn't provided or as additional OR condition)
        if (!email) {
          searchQuery.filterGroups[0].filters.push({
            propertyName: 'phone',
            operator: 'EQ',
            value: normalizedPhone
          });
        } else {
          // Add as OR condition
          searchQuery.filterGroups.push({
            filters: [{
              propertyName: 'phone',
              operator: 'EQ',
              value: normalizedPhone
            }]
          });
        }
      }

      const response = await this.client.crm.contacts.searchApi.doSearch(searchQuery);

      if (response.results && response.results.length > 0) {
        const contact = response.results[0];
        const transformedContact = this.transformContactData(contact);

        this.logger.info('HubSpot contact found', { 
          contactId: contact.id,
          email: transformedContact.email,
          phone: transformedContact.phone 
        });

        return {
          found: true,
          ...transformedContact
        };
      }

      this.logger.info('No HubSpot contact found', { email, phoneNumber });
      return { found: false };

    } catch (error) {
      this.logger.error('HubSpot contact search failed', { 
        email, 
        phoneNumber,
        error: error.message 
      });
      
      return { 
        found: false, 
        error: error.message 
      };
    }
  }

  /**
   * Create new contact in HubSpot
   */
  async createContact(contactData) {
    try {
      this.logger.info('Creating HubSpot contact', { 
        email: contactData.email?.substring(0, 4) + '***',
        phone: contactData.phone?.substring(0, 4) + '***' 
      });

      const properties = {
        email: contactData.email,
        phone: contactData.phone ? normalizePhoneNumber(contactData.phone) : undefined,
        firstname: contactData.firstName,
        lastname: contactData.lastName,
        company: contactData.company || 'Bici Bike Store Customer',
        lifecycle_stage: 'lead',
        lead_status: 'new',
        lead_source: 'ai_phone_call',
        bike_interest: contactData.bikeInterest || '',
        hs_lead_status: 'NEW'
      };

      // Remove undefined properties
      Object.keys(properties).forEach(key => {
        if (properties[key] === undefined) {
          delete properties[key];
        }
      });

      const response = await this.client.crm.contacts.basicApi.create({
        properties: properties
      });

      const transformedContact = this.transformContactData(response);

      this.logger.info('HubSpot contact created', { 
        contactId: response.id,
        email: properties.email,
        phone: properties.phone 
      });

      return {
        success: true,
        ...transformedContact,
        message: 'Contact created successfully in HubSpot'
      };

    } catch (error) {
      this.logger.error('HubSpot contact creation failed', { 
        contactData,
        error: error.message 
      });
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Update existing contact
   */
  async updateContact(contactId, updateData) {
    try {
      this.logger.info('Updating HubSpot contact', { contactId });

      const properties = {};
      
      // Map update data to HubSpot properties
      if (updateData.firstName) properties.firstname = updateData.firstName;
      if (updateData.lastName) properties.lastname = updateData.lastName;
      if (updateData.email) properties.email = updateData.email;
      if (updateData.phone) properties.phone = normalizePhoneNumber(updateData.phone);
      if (updateData.company) properties.company = updateData.company;
      if (updateData.bikeInterest) properties.bike_interest = updateData.bikeInterest;
      if (updateData.leadStatus) properties.lead_status = updateData.leadStatus;
      if (updateData.notes) properties.hs_analytics_source_data_1 = updateData.notes;

      const response = await this.client.crm.contacts.basicApi.update(contactId, {
        properties: properties
      });

      const transformedContact = this.transformContactData(response);

      this.logger.info('HubSpot contact updated', { contactId });

      return {
        success: true,
        ...transformedContact,
        message: 'Contact updated successfully'
      };

    } catch (error) {
      this.logger.error('HubSpot contact update failed', { 
        contactId,
        error: error.message 
      });
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Create support ticket in HubSpot
   */
  async createTicket(contactId, ticketData) {
    try {
      this.logger.info('Creating HubSpot ticket', { contactId, subject: ticketData.subject });

      const properties = {
        hs_ticket_subject: ticketData.subject,
        content: ticketData.description,
        hs_ticket_priority: ticketData.priority || 'MEDIUM',
        hs_ticket_category: ticketData.category || 'BIKE_SUPPORT',
        source_type: 'AI_PHONE_CALL',
        hs_ticket_source: 'PHONE'
      };

      // Create ticket
      const ticketResponse = await this.client.crm.tickets.basicApi.create({
        properties: properties
      });

      // Associate ticket with contact
      if (contactId) {
        await this.associateTicketWithContact(ticketResponse.id, contactId);
      }

      this.logger.info('HubSpot ticket created', { 
        ticketId: ticketResponse.id,
        contactId,
        subject: ticketData.subject 
      });

      return {
        success: true,
        ticket_id: ticketResponse.id,
        ticket_number: ticketResponse.properties.hs_ticket_id,
        subject: ticketResponse.properties.hs_ticket_subject,
        status: ticketResponse.properties.hs_ticket_status,
        priority: ticketResponse.properties.hs_ticket_priority,
        created_at: ticketResponse.properties.createdate,
        message: 'Support ticket created and associated with contact'
      };

    } catch (error) {
      this.logger.error('HubSpot ticket creation failed', { 
        contactId,
        ticketData,
        error: error.message 
      });
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Associate ticket with contact
   */
  async associateTicketWithContact(ticketId, contactId) {
    try {
      await this.client.crm.associations.v4.basicApi.create(
        'tickets',
        ticketId,
        'contacts',
        contactId,
        [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }]
      );

      this.logger.info('Ticket associated with contact', { ticketId, contactId });

    } catch (error) {
      this.logger.error('Ticket association failed', { 
        ticketId,
        contactId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get contact's interaction history
   */
  async getContactHistory(contactId) {
    try {
      this.logger.info('Fetching contact history', { contactId });

      // Get contact details with associated objects
      const contact = await this.client.crm.contacts.basicApi.getById(
        contactId,
        ['email', 'phone', 'firstname', 'lastname', 'company', 'lifecycle_stage', 'lead_status'],
        ['tickets', 'deals', 'notes']
      );

      // Get recent activities
      const activities = await this.client.crm.objects.calls.basicApi.getPage(
        10, // limit
        undefined, // after
        ['hs_call_title', 'hs_call_duration', 'hs_call_body', 'hs_call_status', 'hs_call_direction']
      );

      this.logger.info('Contact history retrieved', { 
        contactId,
        activitiesCount: activities.results.length 
      });

      return {
        success: true,
        contact: this.transformContactData(contact),
        recent_activities: activities.results.map(activity => ({
          id: activity.id,
          type: 'call',
          title: activity.properties.hs_call_title,
          duration: activity.properties.hs_call_duration,
          notes: activity.properties.hs_call_body,
          status: activity.properties.hs_call_status,
          direction: activity.properties.hs_call_direction,
          created_at: activity.properties.createdate
        }))
      };

    } catch (error) {
      this.logger.error('Contact history retrieval failed', { 
        contactId,
        error: error.message 
      });
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Create or update deal for contact
   */
  async createDeal(contactId, dealData) {
    try {
      this.logger.info('Creating HubSpot deal', { contactId, dealName: dealData.dealName });

      const properties = {
        dealname: dealData.dealName,
        amount: dealData.amount || '0',
        dealstage: dealData.stage || 'qualifiedtobuy',
        pipeline: dealData.pipeline || 'default',
        closedate: dealData.closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        bike_type: dealData.bikeType || '',
        lead_source: 'ai_phone_call'
      };

      const dealResponse = await this.client.crm.deals.basicApi.create({
        properties: properties
      });

      // Associate deal with contact
      if (contactId) {
        await this.client.crm.associations.v4.basicApi.create(
          'deals',
          dealResponse.id,
          'contacts',
          contactId,
          [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
        );
      }

      this.logger.info('HubSpot deal created', { 
        dealId: dealResponse.id,
        contactId,
        dealName: dealData.dealName 
      });

      return {
        success: true,
        deal_id: dealResponse.id,
        deal_name: dealResponse.properties.dealname,
        amount: dealResponse.properties.amount,
        stage: dealResponse.properties.dealstage,
        created_at: dealResponse.properties.createdate,
        message: 'Deal created and associated with contact'
      };

    } catch (error) {
      this.logger.error('HubSpot deal creation failed', { 
        contactId,
        dealData,
        error: error.message 
      });
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Transform HubSpot contact data for consistent API response
   */
  transformContactData(contact) {
    const props = contact.properties || {};
    
    return {
      contact_id: contact.id,
      name: `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unknown',
      first_name: props.firstname || '',
      last_name: props.lastname || '',
      email: props.email || '',
      phone: props.phone || '',
      company: props.company || '',
      lifecycle_stage: props.lifecycle_stage || '',
      lead_status: props.lead_status || props.hs_lead_status || '',
      bike_interest: props.bike_interest || '',
      lead_source: props.lead_source || '',
      last_activity_date: props.last_activity_date || props.lastmodifieddate || '',
      created_at: props.createdate || '',
      updated_at: props.lastmodifieddate || ''
    };
  }

  /**
   * Test HubSpot connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing HubSpot connection');
      
      // Test by getting account info
      const accountInfo = await this.client.oauth.accessTokensApi.get(process.env.HUBSPOT_ACCESS_TOKEN);
      
      this.logger.info('HubSpot connection test successful', { 
        hubId: accountInfo.hubId 
      });

      return {
        success: true,
        message: 'HubSpot connection successful',
        hub_id: accountInfo.hubId,
        scopes: accountInfo.scopes
      };

    } catch (error) {
      this.logger.error('HubSpot connection test failed', { error: error.message });
      
      return {
        success: false,
        error: `HubSpot connection failed: ${error.message}`
      };
    }
  }
}

module.exports = HubSpotClient;