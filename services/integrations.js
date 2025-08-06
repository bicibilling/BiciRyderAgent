/**
 * BICI AI Voice System - Third-Party Integrations
 * Shopify, HubSpot, and Google Calendar integrations
 */

const { google } = require('googleapis');
const { config } = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { normalizePhoneNumber } = require('../utils/phone');

// =============================================
// HUBSPOT CRM INTEGRATION
// =============================================

class HubSpotIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.hubspotToken = config.integrations.hubspot.accessToken;
    this.baseURL = 'https://api.hubapi.com';
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
  }

  /**
   * Search for contact by email or phone
   */
  async searchContact(email, phoneNumber) {
    if (!this.hubspotToken) {
      return { found: false, error: 'HubSpot not configured' };
    }

    try {
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
          'bike_interest', 'budget_range', 'preferred_language'
        ]
      };

      const response = await fetch(`${this.baseURL}/crm/v3/objects/contacts/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchQuery)
      });

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const contact = data.results[0];
        return {
          found: true,
          contact_id: contact.id,
          name: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim(),
          email: contact.properties.email,
          phone: contact.properties.phone,
          company: contact.properties.company,
          lifecycle_stage: contact.properties.lifecycle_stage,
          lead_status: contact.properties.lead_status,
          last_activity: contact.properties.last_activity_date,
          bike_interest: contact.properties.bike_interest,
          budget_range: contact.properties.budget_range,
          preferred_language: contact.properties.preferred_language || 'en'
        };
      }

      return { found: false };

    } catch (error) {
      console.error('❌ HubSpot contact search error:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Create new contact in HubSpot
   */
  async createContact(contactData) {
    if (!this.hubspotToken) {
      return { success: false, error: 'HubSpot not configured' };
    }

    try {
      const properties = {
        email: contactData.email,
        phone: contactData.phone,
        firstname: contactData.firstName,
        lastname: contactData.lastName,
        company: contactData.company || 'BICI Bike Store Customer',
        lifecycle_stage: 'lead',
        lead_status: 'new',
        bike_interest: JSON.stringify(contactData.bikeInterest || {}),
        budget_range: contactData.budgetRange || '',
        lead_source: 'ai_phone_call',
        preferred_language: contactData.preferredLanguage || 'en'
      };

      const response = await fetch(`${this.baseURL}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      const newContact = await response.json();

      console.log(`✅ Created HubSpot contact: ${newContact.id}`);

      return {
        success: true,
        contact_id: newContact.id,
        message: 'Contact created successfully in HubSpot'
      };

    } catch (error) {
      console.error('❌ HubSpot contact creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update existing contact
   */
  async updateContact(contactId, updateData) {
    if (!this.hubspotToken) {
      return { success: false, error: 'HubSpot not configured' };
    }

    try {
      const response = await fetch(`${this.baseURL}/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties: updateData })
      });

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      console.log(`✅ Updated HubSpot contact: ${contactId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ HubSpot contact update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create support ticket
   */
  async createTicket(contactId, ticketData) {
    if (!this.hubspotToken) {
      return { success: false, error: 'HubSpot not configured' };
    }

    try {
      const properties = {
        hs_ticket_subject: ticketData.subject,
        content: ticketData.description,
        hs_ticket_priority: ticketData.priority || 'MEDIUM',
        hs_ticket_category: ticketData.category || 'BIKE_SUPPORT',
        source_type: 'AI_PHONE_CALL'
      };

      // Create ticket
      const ticketResponse = await fetch(`${this.baseURL}/crm/v3/objects/tickets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (!ticketResponse.ok) {
        throw new Error(`HubSpot API error: ${ticketResponse.status}`);
      }

      const ticket = await ticketResponse.json();

      // Associate ticket with contact
      if (contactId) {
        await this.associateTicketWithContact(ticket.id, contactId);
      }

      console.log(`🎫 Created HubSpot ticket: ${ticket.id}`);

      return {
        success: true,
        ticket_id: ticket.id,
        message: 'Support ticket created and associated with contact'
      };

    } catch (error) {
      console.error('❌ HubSpot ticket creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Associate ticket with contact
   */
  async associateTicketWithContact(ticketId, contactId) {
    try {
      await fetch(`${this.baseURL}/crm/v3/objects/tickets/${ticketId}/associations/contacts/${contactId}/280`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        }
      });

    } catch (error) {
      console.error('❌ HubSpot association error:', error);
    }
  }
}

// =============================================
// GOOGLE CALENDAR INTEGRATION
// =============================================

class CalendarIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    
    // Initialize Google Calendar API
    this.calendar = null;
    this.initializeGoogleAuth();
  }

  /**
   * Initialize Google OAuth2 client
   */
  initializeGoogleAuth() {
    if (!config.integrations.google.clientId) {
      console.warn('⚠️  Google Calendar not configured');
      return;
    }

    try {
      const auth = new google.auth.OAuth2(
        config.integrations.google.clientId,
        config.integrations.google.clientSecret
      );

      // Set refresh token
      auth.setCredentials({
        refresh_token: config.integrations.google.refreshToken
      });

      this.calendar = google.calendar({ version: 'v3', auth });
      console.log('✅ Google Calendar initialized');

    } catch (error) {
      console.error('❌ Google Calendar initialization error:', error);
    }
  }

  /**
   * Get available appointment slots
   */
  async getAvailableSlots(serviceType, preferredDate, duration = 60) {
    if (!this.calendar) {
      return { success: false, error: 'Google Calendar not configured' };
    }

    try {
      const calendarId = config.integrations.google.calendarId;
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // Next 2 weeks

      // Get existing events
      const response = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const existingEvents = response.data.items || [];

      // Get business hours
      const businessHours = this.getBusinessHours();

      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        startDate,
        endDate,
        businessHours,
        duration,
        existingEvents
      );

      return {
        success: true,
        service_type: serviceType,
        duration_minutes: duration,
        available_slots: availableSlots.slice(0, 20), // First 20 slots
        total_available: availableSlots.length
      };

    } catch (error) {
      console.error('❌ Calendar availability error:', error);
      return { 
        success: false, 
        error: 'Unable to check calendar availability' 
      };
    }
  }

  /**
   * Book appointment
   */
  async bookAppointment(appointmentData) {
    if (!this.calendar) {
      return { success: false, error: 'Google Calendar not configured' };
    }

    try {
      const {
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        notes,
        duration = 60
      } = appointmentData;

      const calendarId = config.integrations.google.calendarId;
      const startTime = new Date(appointment_datetime);
      const endTime = new Date(startTime.getTime() + (duration * 60 * 1000));

      // Create calendar event
      const event = {
        summary: `${service_type} - ${customer_name}`,
        description: `
Service: ${service_type}
Customer: ${customer_name}
Phone: ${customer_phone}
Email: ${customer_email}
Notes: ${notes || 'No additional notes'}

Booked via AI Assistant
        `.trim(),
        start: {
          dateTime: startTime.toISOString(),
          timeZone: config.business.organization.timezone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: config.business.organization.timezone
        },
        attendees: customer_email ? [
          { email: customer_email, displayName: customer_name }
        ] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'popup', minutes: 60 }       // 1 hour
          ]
        }
      };

      const createdEvent = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      // Store in database
      const appointmentRecord = {
        google_event_id: createdEvent.data.id,
        organization_id: this.organizationId,
        customer_name,
        customer_phone: normalizePhoneNumber(customer_phone),
        customer_email,
        service_type,
        appointment_datetime: startTime.toISOString(),
        duration_minutes: duration,
        status: 'confirmed',
        notes: notes || '',
        metadata: {
          google_event: createdEvent.data,
          created_via: 'ai_assistant'
        }
      };

      const { error } = await this.supabase
        .from('appointments')
        .insert(appointmentRecord);

      if (error) {
        console.error('❌ Failed to store appointment in database:', error);
      }

      console.log(`📅 Booked appointment: ${createdEvent.data.id}`);

      return {
        success: true,
        appointment_id: createdEvent.data.id,
        confirmation_link: createdEvent.data.htmlLink,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        message: 'Appointment booked successfully'
      };

    } catch (error) {
      console.error('❌ Appointment booking error:', error);
      return { 
        success: false, 
        error: 'Unable to book appointment' 
      };
    }
  }

  /**
   * Update appointment
   */
  async updateAppointment(appointmentId, updateData) {
    if (!this.calendar) {
      return { success: false, error: 'Google Calendar not configured' };
    }

    try {
      const calendarId = config.integrations.google.calendarId;
      
      // Get existing event
      const existingEvent = await this.calendar.events.get({
        calendarId: calendarId,
        eventId: appointmentId
      });

      // Update event
      const updatedEvent = {
        ...existingEvent.data,
        ...updateData
      };

      await this.calendar.events.update({
        calendarId: calendarId,
        eventId: appointmentId,
        resource: updatedEvent,
        sendUpdates: 'all'
      });

      // Update in database
      await this.supabase
        .from('appointments')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('google_event_id', appointmentId);

      console.log(`📅 Updated appointment: ${appointmentId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Appointment update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(appointmentId, reason = 'Cancelled by customer') {
    if (!this.calendar) {
      return { success: false, error: 'Google Calendar not configured' };
    }

    try {
      const calendarId = config.integrations.google.calendarId;

      // Delete from Google Calendar
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: appointmentId,
        sendUpdates: 'all'
      });

      // Update in database
      await this.supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          notes: reason,
          updated_at: new Date().toISOString()
        })
        .eq('google_event_id', appointmentId);

      console.log(`📅 Cancelled appointment: ${appointmentId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Appointment cancellation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Utility methods
   */

  getBusinessHours() {
    return {
      weekdays: {
        start: 9, // 9 AM
        end: 19,  // 7 PM
        breaks: [{ start: 12, end: 13 }] // Lunch break
      },
      weekends: {
        start: 10, // 10 AM
        end: 18,   // 6 PM
        breaks: []
      }
    };
  }

  calculateAvailableSlots(startDate, endDate, businessHours, duration, existingEvents) {
    const slots = [];
    const slotDuration = duration; // minutes
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const hours = isWeekend ? businessHours.weekends : businessHours.weekdays;

      // Skip if no business hours for this day type
      if (!hours) continue;

      // Generate slots for this day
      for (let hour = hours.start; hour < hours.end; hour++) {
        for (let minute = 0; minute < 60; minute += slotDuration) {
          const slotStart = new Date(date);
          slotStart.setHours(hour, minute, 0, 0);
          
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

          // Skip past times
          if (slotStart <= new Date()) continue;

          // Check if slot conflicts with existing events
          const hasConflict = existingEvents.some(event => {
            const eventStart = new Date(event.start.dateTime || event.start.date);
            const eventEnd = new Date(event.end.dateTime || event.end.date);
            
            return (slotStart < eventEnd && slotEnd > eventStart);
          });

          // Check if slot is during break time
          const isDuringBreak = hours.breaks?.some(breakTime => {
            const breakStart = breakTime.start;
            const breakEnd = breakTime.end;
            const slotHour = slotStart.getHours();
            
            return slotHour >= breakStart && slotHour < breakEnd;
          });

          if (!hasConflict && !isDuringBreak) {
            slots.push({
              datetime: slotStart.toISOString(),
              formatted_time: slotStart.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }),
              duration_minutes: slotDuration
            });
          }
        }
      }
    }

    return slots.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }
}

// =============================================
// SHOPIFY INTEGRATION
// =============================================

class ShopifyIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.shopDomain = config.integrations.shopify.shopDomain;
    this.accessToken = config.integrations.shopify.accessToken;
    this.baseURL = `https://${this.shopDomain}/admin/api/2023-10`;
  }

  /**
   * Search customer by phone or email
   */
  async searchCustomer(identifier, type = 'phone') {
    if (!this.accessToken) {
      return { found: false, error: 'Shopify not configured' };
    }

    try {
      const query = type === 'email' ? 
        `email:${identifier}` : 
        `phone:${normalizePhoneNumber(identifier)}`;

      const response = await fetch(
        `${this.baseURL}/customers/search.json?query=${encodeURIComponent(query)}`,
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.customers && data.customers.length > 0) {
        const customer = data.customers[0];
        
        // Get order history
        const ordersResponse = await fetch(
          `${this.baseURL}/customers/${customer.id}/orders.json`,
          {
            headers: {
              'X-Shopify-Access-Token': this.accessToken
            }
          }
        );

        const ordersData = await ordersResponse.json();

        return {
          found: true,
          customer_id: customer.id,
          name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          email: customer.email,
          phone: customer.phone,
          total_spent: customer.total_spent,
          orders_count: customer.orders_count,
          orders: ordersData.orders || [],
          addresses: customer.addresses || [],
          created_at: customer.created_at,
          updated_at: customer.updated_at
        };
      }

      return { found: false };

    } catch (error) {
      console.error('❌ Shopify customer search error:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId) {
    if (!this.accessToken) {
      return { found: false, error: 'Shopify not configured' };
    }

    try {
      const response = await fetch(
        `${this.baseURL}/orders/${orderId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        found: true,
        order: data.order
      };

    } catch (error) {
      console.error('❌ Shopify order lookup error:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Get product information
   */
  async getProduct(productId) {
    if (!this.accessToken) {
      return { found: false, error: 'Shopify not configured' };
    }

    try {
      const response = await fetch(
        `${this.baseURL}/products/${productId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        found: true,
        product: data.product
      };

    } catch (error) {
      console.error('❌ Shopify product lookup error:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Check inventory levels
   */
  async checkInventory(variantId) {
    if (!this.accessToken) {
      return { success: false, error: 'Shopify not configured' };
    }

    try {
      const response = await fetch(
        `${this.baseURL}/inventory_levels.json?inventory_item_ids=${variantId}`,
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        inventory_levels: data.inventory_levels
      };

    } catch (error) {
      console.error('❌ Shopify inventory check error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = {
  HubSpotIntegration,
  CalendarIntegration,
  ShopifyIntegration
};