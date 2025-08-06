const { google } = require('googleapis');
const { integrationLogger } = require('../../config/logger');
const { validateEmail, normalizePhoneNumber } = require('../../utils/validation');

class GoogleCalendarClient {
  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob' // For refresh token flow
    );

    // Set refresh token
    this.auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    this.logger = integrationLogger.child({ integration: 'google-calendar' });

    // Service calendar mapping
    this.serviceCalendars = {
      'bike_repair': process.env.GOOGLE_CALENDAR_ID || 'primary',
      'bike_tuneup': process.env.GOOGLE_CALENDAR_ID || 'primary',
      'bike_fitting': process.env.GOOGLE_CALENDAR_ID || 'primary',
      'consultation': process.env.GOOGLE_CALENDAR_ID || 'primary',
      'warranty_service': process.env.GOOGLE_CALENDAR_ID || 'primary'
    };

    // Business hours configuration
    this.businessHours = {
      monday: { start: '09:00', end: '18:00' },
      tuesday: { start: '09:00', end: '18:00' },
      wednesday: { start: '09:00', end: '18:00' },
      thursday: { start: '09:00', end: '18:00' },
      friday: { start: '09:00', end: '18:00' },
      saturday: { start: '10:00', end: '17:00' },
      sunday: { start: '10:00', end: '16:00' }
    };

    // Service duration mapping (in minutes)
    this.serviceDurations = {
      'bike_repair': 90,
      'bike_tuneup': 60,
      'bike_fitting': 45,
      'consultation': 30,
      'warranty_service': 60
    };
  }

  /**
   * Get available appointment slots for a service type
   */
  async getAvailableSlots(serviceType, preferredDate, duration = null) {
    try {
      this.logger.info('Getting available slots', { serviceType, preferredDate });

      const calendarId = this.getServiceCalendarId(serviceType);
      const appointmentDuration = duration || this.serviceDurations[serviceType] || 60;

      // Calculate date range (next 14 days from preferred date or today)
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14);
      endDate.setHours(23, 59, 59, 999);

      // Get existing events
      const eventsResponse = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const existingEvents = eventsResponse.data.items || [];

      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        startDate,
        endDate,
        appointmentDuration,
        existingEvents
      );

      this.logger.info('Available slots calculated', { 
        serviceType,
        appointmentDuration,
        slotsFound: availableSlots.length 
      });

      return {
        success: true,
        service_type: serviceType,
        duration_minutes: appointmentDuration,
        available_slots: availableSlots.slice(0, 20), // First 20 slots
        total_available: availableSlots.length,
        date_range: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        }
      };

    } catch (error) {
      this.logger.error('Get available slots failed', { 
        serviceType,
        preferredDate,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to check calendar availability: ${error.message}`,
        available_slots: [],
        total_available: 0
      };
    }
  }

  /**
   * Book an appointment
   */
  async bookAppointment(appointmentData) {
    try {
      const {
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        notes,
        duration_minutes
      } = appointmentData;

      this.logger.info('Booking appointment', { 
        customer_name,
        service_type,
        appointment_datetime 
      });

      // Validate email
      if (customer_email) {
        const { isValid } = validateEmail(customer_email);
        if (!isValid) {
          throw new Error('Invalid email address format');
        }
      }

      // Validate phone
      const normalizedPhone = normalizePhoneNumber(customer_phone);

      const calendarId = this.getServiceCalendarId(service_type);
      const duration = duration_minutes || this.serviceDurations[service_type] || 60;
      
      const startTime = new Date(appointment_datetime);
      const endTime = new Date(startTime.getTime() + (duration * 60 * 1000));

      // Check if slot is still available
      const isAvailable = await this.isSlotAvailable(calendarId, startTime, endTime);
      if (!isAvailable) {
        throw new Error('Selected time slot is no longer available');
      }

      // Create calendar event
      const event = {
        summary: `${this.formatServiceType(service_type)} - ${customer_name}`,
        description: this.buildEventDescription({
          customer_name,
          customer_phone: normalizedPhone,
          customer_email,
          service_type,
          notes,
          source: 'AI Assistant'
        }),
        start: {
          dateTime: startTime.toISOString(),
          timeZone: process.env.DEFAULT_TIMEZONE || 'America/Toronto'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: process.env.DEFAULT_TIMEZONE || 'America/Toronto'
        },
        attendees: customer_email ? [
          { 
            email: customer_email, 
            displayName: customer_name,
            responseStatus: 'needsAction'
          }
        ] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'popup', minutes: 60 },      // 1 hour
            { method: 'sms', minutes: 30 }         // 30 minutes
          ]
        },
        extendedProperties: {
          private: {
            customer_phone: normalizedPhone,
            service_type: service_type,
            booking_source: 'ai_assistant',
            customer_name: customer_name
          }
        }
      };

      const createdEvent = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: customer_email ? 'all' : 'none'
      });

      // Store appointment in database (if we have a database integration)
      const appointmentRecord = await this.storeAppointment({
        google_event_id: createdEvent.data.id,
        customer_name,
        customer_phone: normalizedPhone,
        customer_email,
        service_type,
        appointment_datetime: startTime.toISOString(),
        duration_minutes: duration,
        status: 'confirmed',
        notes,
        calendar_id: calendarId
      });

      this.logger.info('Appointment booked successfully', { 
        eventId: createdEvent.data.id,
        customer_name,
        service_type,
        appointment_datetime 
      });

      return {
        success: true,
        appointment_id: createdEvent.data.id,
        event_link: createdEvent.data.htmlLink,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: duration,
        service_type: service_type,
        customer_name: customer_name,
        confirmation_sent: !!customer_email,
        message: 'Appointment booked successfully'
      };

    } catch (error) {
      this.logger.error('Appointment booking failed', { 
        appointmentData,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to book appointment: ${error.message}`
      };
    }
  }

  /**
   * Update an existing appointment
   */
  async updateAppointment(appointmentId, updateData) {
    try {
      this.logger.info('Updating appointment', { appointmentId });

      const calendarId = this.getServiceCalendarId(updateData.service_type || 'bike_repair');

      // Get existing event
      const existingEvent = await this.calendar.events.get({
        calendarId: calendarId,
        eventId: appointmentId
      });

      // Prepare updated event data
      const updatedEvent = { ...existingEvent.data };

      if (updateData.appointment_datetime) {
        const newStartTime = new Date(updateData.appointment_datetime);
        const duration = updateData.duration_minutes || 
                        this.serviceDurations[updateData.service_type] || 60;
        const newEndTime = new Date(newStartTime.getTime() + (duration * 60 * 1000));

        // Check if new slot is available
        const isAvailable = await this.isSlotAvailable(calendarId, newStartTime, newEndTime, appointmentId);
        if (!isAvailable) {
          throw new Error('New time slot is not available');
        }

        updatedEvent.start.dateTime = newStartTime.toISOString();
        updatedEvent.end.dateTime = newEndTime.toISOString();
      }

      if (updateData.notes) {
        updatedEvent.description = this.updateEventDescription(
          updatedEvent.description, 
          updateData.notes
        );
      }

      // Update the event
      const updatedEventResponse = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: appointmentId,
        resource: updatedEvent,
        sendUpdates: 'all'
      });

      this.logger.info('Appointment updated successfully', { 
        appointmentId,
        updatedFields: Object.keys(updateData) 
      });

      return {
        success: true,
        appointment_id: appointmentId,
        message: 'Appointment updated successfully',
        updated_event: {
          start_time: updatedEventResponse.data.start.dateTime,
          end_time: updatedEventResponse.data.end.dateTime,
          summary: updatedEventResponse.data.summary
        }
      };

    } catch (error) {
      this.logger.error('Appointment update failed', { 
        appointmentId,
        updateData,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to update appointment: ${error.message}`
      };
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId, reason = 'Customer request') {
    try {
      this.logger.info('Cancelling appointment', { appointmentId, reason });

      const calendarId = this.getServiceCalendarId('bike_repair'); // Default calendar

      // Get event details before deletion
      const event = await this.calendar.events.get({
        calendarId: calendarId,
        eventId: appointmentId
      });

      // Delete the event
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: appointmentId,
        sendUpdates: 'all'
      });

      this.logger.info('Appointment cancelled successfully', { 
        appointmentId,
        eventSummary: event.data.summary 
      });

      return {
        success: true,
        appointment_id: appointmentId,
        cancelled_event: {
          summary: event.data.summary,
          start_time: event.data.start.dateTime,
          end_time: event.data.end.dateTime
        },
        message: 'Appointment cancelled successfully'
      };

    } catch (error) {
      this.logger.error('Appointment cancellation failed', { 
        appointmentId,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to cancel appointment: ${error.message}`
      };
    }
  }

  /**
   * Calculate available time slots
   */
  calculateAvailableSlots(startDate, endDate, duration, existingEvents) {
    const slots = [];
    const currentDate = new Date(startDate);

    while (currentDate < endDate) {
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
      const businessHours = this.businessHours[dayOfWeek];

      if (businessHours) {
        const daySlots = this.generateDaySlotsfilter(currentDate, businessHours, duration, existingEvents);
        slots.push(...daySlots);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  /**
   * Generate available slots for a specific day
   */
  generateDaySlotsfilter(date, businessHours, duration, existingEvents) {
    const slots = [];
    const [startHour, startMinute] = businessHours.start.split(':').map(Number);
    const [endHour, endMinute] = businessHours.end.split(':').map(Number);

    const dayStart = new Date(date);
    dayStart.setHours(startHour, startMinute, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, endMinute, 0, 0);

    // Generate 30-minute intervals
    const intervalMinutes = 30;
    let currentSlot = new Date(dayStart);

    while (currentSlot.getTime() + (duration * 60 * 1000) <= dayEnd.getTime()) {
      const slotEnd = new Date(currentSlot.getTime() + (duration * 60 * 1000));

      // Check if slot conflicts with existing events
      const hasConflict = existingEvents.some(event => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        return (currentSlot < eventEnd && slotEnd > eventStart);
      });

      // Skip past appointments (add 1 hour buffer)
      const now = new Date();
      const bufferTime = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour from now

      if (!hasConflict && currentSlot >= bufferTime) {
        slots.push({
          datetime: currentSlot.toISOString(),
          formatted_time: currentSlot.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: process.env.DEFAULT_TIMEZONE || 'America/Toronto'
          }),
          duration_minutes: duration,
          available: true
        });
      }

      currentSlot = new Date(currentSlot.getTime() + (intervalMinutes * 60 * 1000));
    }

    return slots;
  }

  /**
   * Check if a time slot is available
   */
  async isSlotAvailable(calendarId, startTime, endTime, excludeEventId = null) {
    try {
      const events = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true
      });

      const conflictingEvents = events.data.items.filter(event => {
        if (excludeEventId && event.id === excludeEventId) {
          return false; // Exclude the event being updated
        }

        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        return (startTime < eventEnd && endTime > eventStart);
      });

      return conflictingEvents.length === 0;

    } catch (error) {
      this.logger.error('Slot availability check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Store appointment in database
   */
  async storeAppointment(appointmentData) {
    try {
      // This would integrate with your database (Supabase in this case)
      // For now, we'll just log the appointment data
      this.logger.info('Storing appointment data', { 
        google_event_id: appointmentData.google_event_id,
        customer_name: appointmentData.customer_name,
        service_type: appointmentData.service_type 
      });

      // TODO: Implement actual database storage
      return {
        id: appointmentData.google_event_id,
        stored: true
      };

    } catch (error) {
      this.logger.error('Appointment storage failed', { error: error.message });
      return { stored: false, error: error.message };
    }
  }

  /**
   * Helper methods
   */
  getServiceCalendarId(serviceType) {
    return this.serviceCalendars[serviceType] || this.serviceCalendars['bike_repair'];
  }

  formatServiceType(serviceType) {
    const formatMap = {
      'bike_repair': 'Bike Repair',
      'bike_tuneup': 'Bike Tune-up',
      'bike_fitting': 'Bike Fitting',
      'consultation': 'Consultation',
      'warranty_service': 'Warranty Service'
    };
    return formatMap[serviceType] || 'Service Appointment';
  }

  buildEventDescription(data) {
    return `
Service: ${this.formatServiceType(data.service_type)}
Customer: ${data.customer_name}
Phone: ${data.customer_phone}
Email: ${data.customer_email || 'Not provided'}

${data.notes ? `Notes: ${data.notes}` : ''}

Booked via: ${data.source}
    `.trim();
  }

  updateEventDescription(existingDescription, newNotes) {
    const lines = existingDescription.split('\n');
    const notesIndex = lines.findIndex(line => line.startsWith('Notes:'));
    
    if (notesIndex >= 0) {
      lines[notesIndex] = `Notes: ${newNotes}`;
    } else {
      // Insert notes before the "Booked via" line
      const bookedViaIndex = lines.findIndex(line => line.startsWith('Booked via:'));
      if (bookedViaIndex >= 0) {
        lines.splice(bookedViaIndex, 0, '', `Notes: ${newNotes}`);
      } else {
        lines.push('', `Notes: ${newNotes}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Test Google Calendar connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing Google Calendar connection');
      
      // Test by getting calendar list
      const calendars = await this.calendar.calendarList.list({
        maxResults: 1
      });
      
      this.logger.info('Google Calendar connection test successful', { 
        calendarsCount: calendars.data.items.length 
      });

      return {
        success: true,
        message: 'Google Calendar connection successful',
        primary_calendar: calendars.data.items[0]?.summary || 'Unknown'
      };

    } catch (error) {
      this.logger.error('Google Calendar connection test failed', { error: error.message });
      
      return {
        success: false,
        error: `Google Calendar connection failed: ${error.message}`
      };
    }
  }
}

module.exports = GoogleCalendarClient;