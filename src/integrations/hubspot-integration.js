/**
 * HubSpot CRM Integration
 * Handles customer lookup, lead creation, and ticket management
 */

import fetch from 'node-fetch';

export class HubSpotIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
    this.baseURL = 'https://api.hubapi.com';
    this.rateLimitDelay = 100; // ms between requests
    this.maxRetries = 3;
  }

  /**
   * Search for existing contact by email or phone
   */
  async searchContact(email, phoneNumber) {
    try {
      console.log(`🔍 Searching HubSpot for contact: ${email || phoneNumber}`);
      
      const searchQuery = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: email ? 'email' : 'phone',
                operator: 'EQ',
                value: email || phoneNumber
              }
            ]
          }
        ],
        properties: [
          'email', 'phone', 'firstname', 'lastname', 'company',
          'lifecycle_stage', 'lead_status', 'last_activity_date',
          'bike_interest_type', 'bike_budget_min', 'bike_budget_max',
          'preferred_contact_method', 'customer_tier', 'notes_last_contacted'
        ],
        limit: 1
      };
      
      const response = await this.makeRequest('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify(searchQuery)
      });
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const contact = data.results[0];
        const properties = contact.properties;
        
        return {
          found: true,
          contact_id: contact.id,
          name: `${properties.firstname || ''} ${properties.lastname || ''}`.trim(),
          first_name: properties.firstname,
          last_name: properties.lastname,
          email: properties.email,
          phone: properties.phone,
          company: properties.company,
          lifecycle_stage: properties.lifecycle_stage,
          lead_status: properties.lead_status,
          last_activity: properties.last_activity_date,
          bike_interest: {
            type: properties.bike_interest_type,
            budget_min: properties.bike_budget_min,
            budget_max: properties.bike_budget_max
          },
          customer_tier: properties.customer_tier || 'new',
          preferred_contact: properties.preferred_contact_method,
          last_contacted: properties.notes_last_contacted
        };
      }
      
      return { found: false };
      
    } catch (error) {
      console.error('HubSpot contact search error:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Create new contact/lead in HubSpot
   */
  async createContact(contactData) {
    try {
      console.log(`➕ Creating HubSpot contact for ${contactData.email || contactData.phone}`);
      
      const properties = {
        email: contactData.email,
        phone: contactData.phone,
        firstname: contactData.firstName,
        lastname: contactData.lastName,
        company: contactData.company || 'Bici Bike Store Customer',
        
        // Lifecycle and lead management
        lifecycle_stage: 'lead',
        lead_status: 'new',
        lead_source: 'ai_phone_call',
        
        // Bike-specific properties
        bike_interest_type: contactData.bikeInterest?.type,
        bike_budget_min: contactData.bikeInterest?.budget?.min,
        bike_budget_max: contactData.bikeInterest?.budget?.max,
        bike_usage: contactData.bikeInterest?.usage,
        bike_timeline: contactData.bikeInterest?.timeline,
        
        // Contact preferences
        preferred_contact_method: contactData.preferredContact || 'phone',
        customer_tier: contactData.customerTier || 'new',
        
        // Organization tracking
        organization_source: this.organizationId,
        
        // Notes and context
        notes_last_contacted: new Date().toISOString(),
        hs_lead_status: 'NEW'
      };
      
      // Remove undefined values
      Object.keys(properties).forEach(key => {
        if (properties[key] === undefined || properties[key] === null) {
          delete properties[key];
        }
      });
      
      const response = await this.makeRequest('/crm/v3/objects/contacts', {
        method: 'POST',
        body: JSON.stringify({ properties })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HubSpot API error: ${errorData.message}`);
      }
      
      const newContact = await response.json();
      
      console.log(`✅ Created HubSpot contact: ${newContact.id}`);
      
      return {
        success: true,
        contact_id: newContact.id,
        message: 'Contact created successfully in HubSpot'
      };
      
    } catch (error) {
      console.error('HubSpot contact creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update existing contact with new information
   */
  async updateContact(contactId, updateData) {
    try {
      console.log(`📝 Updating HubSpot contact: ${contactId}`);
      
      const properties = {
        notes_last_contacted: new Date().toISOString(),
        last_activity_date: new Date().toISOString()
      };
      
      // Add bike interest updates if provided
      if (updateData.bikeInterest) {
        if (updateData.bikeInterest.type) {
          properties.bike_interest_type = updateData.bikeInterest.type;
        }
        if (updateData.bikeInterest.budget) {
          properties.bike_budget_min = updateData.bikeInterest.budget.min;
          properties.bike_budget_max = updateData.bikeInterest.budget.max;
        }
        if (updateData.bikeInterest.timeline) {
          properties.bike_timeline = updateData.bikeInterest.timeline;
        }
      }
      
      // Update lead status if provided
      if (updateData.leadStatus) {
        properties.lead_status = updateData.leadStatus;
      }
      
      // Update customer tier if provided
      if (updateData.customerTier) {
        properties.customer_tier = updateData.customerTier;
      }
      
      const response = await this.makeRequest(`/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HubSpot update error: ${errorData.message}`);
      }
      
      return {
        success: true,
        message: 'Contact updated successfully'
      };
      
    } catch (error) {
      console.error('HubSpot contact update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create support ticket associated with contact
   */
  async createTicket(contactId, ticketData) {
    try {
      console.log(`🎫 Creating HubSpot ticket for contact: ${contactId}`);
      
      const properties = {
        hs_ticket_subject: ticketData.subject,
        content: ticketData.description,
        hs_ticket_priority: ticketData.priority || 'MEDIUM',
        hs_ticket_category: ticketData.category || 'BIKE_SUPPORT',
        source_type: 'AI_PHONE_CALL',
        hs_ticket_pipeline: 'SUPPORT_PIPELINE',
        hs_ticket_stage: 'NEW'
      };
      
      // Create ticket
      const ticketResponse = await this.makeRequest('/crm/v3/objects/tickets', {
        method: 'POST',
        body: JSON.stringify({ properties })
      });
      
      if (!ticketResponse.ok) {
        const errorData = await ticketResponse.json();
        throw new Error(`HubSpot ticket creation error: ${errorData.message}`);
      }
      
      const ticket = await ticketResponse.json();
      
      // Associate ticket with contact
      await this.associateTicketWithContact(ticket.id, contactId);
      
      console.log(`✅ Created HubSpot ticket: ${ticket.id}`);
      
      return {
        success: true,
        ticket_id: ticket.id,
        message: 'Support ticket created and associated with contact'
      };
      
    } catch (error) {
      console.error('HubSpot ticket creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Associate ticket with contact
   */
  async associateTicketWithContact(ticketId, contactId) {
    try {
      const associationData = {
        from: { id: ticketId },
        to: { id: contactId },
        type: 'ticket_to_contact'
      };
      
      const response = await this.makeRequest(`/crm/v3/associations/tickets/contacts/batch/create`, {
        method: 'POST',
        body: JSON.stringify({ inputs: [associationData] })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Association error:', errorData);
      }
      
    } catch (error) {
      console.error('Error associating ticket with contact:', error);
    }
  }

  /**
   * Get contact's interaction history
   */
  async getContactHistory(contactId) {
    try {
      // Get activities associated with the contact
      const response = await this.makeRequest(`/crm/v3/objects/contacts/${contactId}/associations/calls`);
      
      if (!response.ok) {
        return { success: false, history: [] };
      }
      
      const associations = await response.json();
      
      // Get call details for each associated call
      const history = [];
      for (const assoc of associations.results || []) {
        const callResponse = await this.makeRequest(`/crm/v3/objects/calls/${assoc.id}`);
        if (callResponse.ok) {
          const call = await callResponse.json();
          history.push({
            id: call.id,
            type: 'call',
            subject: call.properties.hs_call_title,
            date: call.properties.hs_call_start_time,
            duration: call.properties.hs_call_duration,
            outcome: call.properties.hs_call_outcome
          });
        }
      }
      
      return {
        success: true,
        history: history.sort((a, b) => new Date(b.date) - new Date(a.date))
      };
      
    } catch (error) {
      console.error('Error getting contact history:', error);
      return { success: false, history: [], error: error.message };
    }
  }

  /**
   * Log call activity in HubSpot
   */
  async logCallActivity(contactId, callData) {
    try {
      console.log(`📞 Logging call activity for contact: ${contactId}`);
      
      const properties = {
        hs_call_title: `AI Call - ${callData.subject || 'Phone Consultation'}`,
        hs_call_body: callData.summary || callData.transcript || 'AI-handled phone call',
        hs_call_start_time: callData.startTime || new Date().toISOString(),
        hs_call_end_time: callData.endTime || new Date().toISOString(),
        hs_call_duration: callData.duration || 0,
        hs_call_outcome: callData.outcome || 'COMPLETED',
        hs_call_source: 'AI_ASSISTANT',
        hs_call_type: 'INBOUND',
        hs_call_status: 'COMPLETED'
      };
      
      // Create call record
      const response = await this.makeRequest('/crm/v3/objects/calls', {
        method: 'POST',
        body: JSON.stringify({ properties })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Call logging error: ${errorData.message}`);
      }
      
      const call = await response.json();
      
      // Associate call with contact
      await this.associateCallWithContact(call.id, contactId);
      
      return {
        success: true,
        call_id: call.id,
        message: 'Call activity logged successfully'
      };
      
    } catch (error) {
      console.error('Error logging call activity:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Associate call with contact
   */
  async associateCallWithContact(callId, contactId) {
    try {
      const associationData = {
        from: { id: callId },
        to: { id: contactId },
        type: 'call_to_contact'
      };
      
      await this.makeRequest(`/crm/v3/associations/calls/contacts/batch/create`, {
        method: 'POST',
        body: JSON.stringify({ inputs: [associationData] })
      });
      
    } catch (error) {
      console.error('Error associating call with contact:', error);
    }
  }

  /**
   * Create or update deal for sales opportunities
   */
  async createDeal(contactId, dealData) {
    try {
      console.log(`💰 Creating HubSpot deal for contact: ${contactId}`);
      
      const properties = {
        dealname: dealData.name || `Bike Purchase - ${new Date().toLocaleDateString()}`,
        amount: dealData.amount || 0,
        dealstage: dealData.stage || 'appointmentscheduled',
        pipeline: 'BIKE_SALES_PIPELINE',
        source: 'AI_PHONE_CALL',
        
        // Bike-specific deal properties
        bike_type: dealData.bikeType,
        bike_model: dealData.bikeModel,
        bike_size: dealData.bikeSize,
        expected_close_date: dealData.expectedCloseDate,
        
        // Notes and context
        deal_notes: dealData.notes || 'Generated from AI phone call',
        lead_source: 'ai_assistant'
      };
      
      const response = await this.makeRequest('/crm/v3/objects/deals', {
        method: 'POST',
        body: JSON.stringify({ properties })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Deal creation error: ${errorData.message}`);
      }
      
      const deal = await response.json();
      
      // Associate deal with contact
      await this.associateDealWithContact(deal.id, contactId);
      
      return {
        success: true,
        deal_id: deal.id,
        message: 'Deal created and associated with contact'
      };
      
    } catch (error) {
      console.error('HubSpot deal creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Associate deal with contact
   */
  async associateDealWithContact(dealId, contactId) {
    try {
      const associationData = {
        from: { id: dealId },
        to: { id: contactId },
        type: 'deal_to_contact'
      };
      
      await this.makeRequest(`/crm/v3/associations/deals/contacts/batch/create`, {
        method: 'POST',
        body: JSON.stringify({ inputs: [associationData] })
      });
      
    } catch (error) {
      console.error('Error associating deal with contact:', error);
    }
  }

  /**
   * Get contact's deals and opportunities
   */
  async getContactDeals(contactId) {
    try {
      const response = await this.makeRequest(`/crm/v3/objects/contacts/${contactId}/associations/deals`);
      
      if (!response.ok) {
        return { success: false, deals: [] };
      }
      
      const associations = await response.json();
      const deals = [];
      
      for (const assoc of associations.results || []) {
        const dealResponse = await this.makeRequest(`/crm/v3/objects/deals/${assoc.id}`);
        if (dealResponse.ok) {
          const deal = await dealResponse.json();
          deals.push({
            id: deal.id,
            name: deal.properties.dealname,
            amount: deal.properties.amount,
            stage: deal.properties.dealstage,
            close_date: deal.properties.closedate,
            created_date: deal.properties.createdate
          });
        }
      }
      
      return {
        success: true,
        deals: deals.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      };
      
    } catch (error) {
      console.error('Error getting contact deals:', error);
      return { success: false, deals: [], error: error.message };
    }
  }

  /**
   * Batch update contacts for performance
   */
  async batchUpdateContacts(contactUpdates) {
    try {
      const batchSize = 100; // HubSpot batch limit
      const batches = [];
      
      for (let i = 0; i < contactUpdates.length; i += batchSize) {
        batches.push(contactUpdates.slice(i, i + batchSize));
      }
      
      const results = [];
      
      for (const batch of batches) {
        const response = await this.makeRequest('/crm/v3/objects/contacts/batch/update', {
          method: 'POST',
          body: JSON.stringify({ inputs: batch })
        });
        
        if (response.ok) {
          const batchResult = await response.json();
          results.push(...batchResult.results);
        }
        
        // Rate limiting
        await this.delay(this.rateLimitDelay);
      }
      
      return {
        success: true,
        updated_count: results.length,
        results: results
      };
      
    } catch (error) {
      console.error('Batch update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Make authenticated request to HubSpot API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultHeaders = {
      'Authorization': `Bearer ${this.hubspotToken}`,
      'Content-Type': 'application/json'
    };
    
    const requestOptions = {
      headers: { ...defaultHeaders, ...options.headers },
      ...options
    };
    
    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        const response = await fetch(url, requestOptions);
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after') || 1;
          console.log(`Rate limited, waiting ${retryAfter} seconds...`);
          await this.delay(retryAfter * 1000);
          attempt++;
          continue;
        }
        
        return response;
        
      } catch (error) {
        attempt++;
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }
  }

  /**
   * Utility method for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate HubSpot configuration
   */
  async validateConfiguration() {
    try {
      const response = await this.makeRequest('/crm/v3/objects/contacts', {
        method: 'GET'
      });
      
      return {
        valid: response.ok,
        message: response.ok ? 'HubSpot configuration valid' : 'Invalid HubSpot configuration'
      };
      
    } catch (error) {
      return {
        valid: false,
        message: `HubSpot configuration error: ${error.message}`
      };
    }
  }

  /**
   * Get HubSpot analytics and metrics
   */
  async getAnalytics(dateRange = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      
      // This would require HubSpot Analytics API access
      // Implementation depends on your HubSpot tier and API access
      
      return {
        success: true,
        message: 'Analytics require additional HubSpot API permissions',
        data: {
          contacts_created: 0,
          calls_logged: 0,
          deals_created: 0,
          tickets_created: 0
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default HubSpotIntegration;