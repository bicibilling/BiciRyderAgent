/**
 * Google Calendar Integration
 * Handles appointment booking, availability checking, and calendar management
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export class CalendarIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.calendar = null;
    this.auth = null;
    this.serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    this.initializeGoogleAuth();
  }

  /**
   * Initialize Google Calendar authentication
   */
  initializeGoogleAuth() {
    try {
      this.auth = new JWT({
        email: this.serviceAccountKey.client_email,
        key: this.serviceAccountKey.private_key,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ]
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      console.log('✅ Google Calendar authentication initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar auth:', error);
      throw new Error('Google Calendar authentication failed');
    }
  }

  /**
   * Get available appointment slots for a service type
   */
  async getAvailableSlots(serviceType, preferredDate, duration = 60) {
    try {
      console.log(`📅 Getting available slots for ${serviceType} on ${preferredDate}`);

      const calendarId = await this.getServiceCalendarId(serviceType);
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // Next 2 weeks

      // Get existing events
      const events = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      // Get business hours configuration
      const businessHours = await this.getBusinessHours();

      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        startDate,
        endDate,
        businessHours,
        duration,
        events.data.items || []
      );

      return {
        success: true,
        service_type: serviceType,
        duration_minutes: duration,
        calendar_id: calendarId,
        available_slots: availableSlots.slice(0, 20), // First 20 slots
        total_available: availableSlots.length,
        search_period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      };

    } catch (error) {
      console.error('Calendar availability error:', error);
      return {
        success: false,
        error: 'Unable to check calendar availability',
        message: 'Calendar system temporarily unavailable'
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
        bike_details
      } = appointmentData;

      console.log(`📝 Booking appointment for ${customer_name} - ${service_type}`);

      const calendarId = await this.getServiceCalendarId(service_type);
      const startTime = new Date(appointment_datetime);
      const duration = this.getServiceDuration(service_type);
      const endTime = new Date(startTime.getTime() + (duration * 60 * 1000));

      // Check if slot is still available
      const isAvailable = await this.isSlotAvailable(calendarId, startTime, endTime);
      if (!isAvailable) {
        return {
          success: false,
          error: 'Selected time slot is no longer available',
          message: 'Please select a different time slot'
        };
      }

      // Create calendar event
      const event = {
        summary: `${service_type.replace('_', ' ').toUpperCase()} - ${customer_name}`,
        description: this.buildEventDescription({
          customer_name,
          customer_phone,
          customer_email,
          service_type,
          notes,
          bike_details
        }),
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Toronto'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Toronto'
        },
        attendees: [
          {
            email: customer_email,
            displayName: customer_name,
            responseStatus: 'needsAction'
          }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'popup', minutes: 60 },       // 1 hour
            { method: 'email', minutes: 60 }        // 1 hour email
          ]
        },
        extendedProperties: {
          private: {
            customer_phone: customer_phone,
            service_type: service_type,
            organization_id: this.organizationId,
            booking_source: 'ai_assistant',
            bike_details: JSON.stringify(bike_details || {})
          }
        }
      };

      const createdEvent = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: 'all' // Send email invitations
      });

      // Store appointment in database
      await this.storeAppointment({
        google_event_id: createdEvent.data.id,
        calendar_id: calendarId,
        organization_id: this.organizationId,
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime: startTime.toISOString(),
        estimated_duration: duration,
        status: 'confirmed',
        notes,
        bike_details
      });

      // Send confirmation SMS if phone number provided
      if (customer_phone) {
        await this.sendAppointmentConfirmation({
          phone: customer_phone,
          name: customer_name,
          service: service_type,
          datetime: startTime,
          event_id: createdEvent.data.id
        });
      }

      console.log(`✅ Appointment booked successfully: ${createdEvent.data.id}`);

      return {
        success: true,
        appointment_id: createdEvent.data.id,
        confirmation_link: createdEvent.data.htmlLink,
        appointment_details: {
          service_type: service_type,
          datetime: startTime.toISOString(),
          duration: duration,
          customer_name: customer_name,
          status: 'confirmed'
        },
        message: 'Appointment booked successfully. Confirmation email sent.'
      };

    } catch (error) {
      console.error('Appointment booking error:', error);
      return {
        success: false,
        error: 'Unable to book appointment',
        message: 'Appointment booking system temporarily unavailable'
      };
    }
  }

  /**
   * Cancel or reschedule appointment
   */
  async manageAppointment(eventId, action, newDateTime = null) {
    try {
      console.log(`🔄 Managing appointment ${eventId}: ${action}`);

      const calendarId = await this.getMainCalendarId();

      switch (action) {
        case 'cancel':
          await this.calendar.events.delete({
            calendarId: calendarId,
            eventId: eventId,
            sendUpdates: 'all'
          });

          await this.updateAppointmentStatus(eventId, 'cancelled');

          return {
            success: true,
            message: 'Appointment cancelled successfully'
          };

        case 'reschedule':
          if (!newDateTime) {
            throw new Error('New date/time required for rescheduling');
          }

          const event = await this.calendar.events.get({
            calendarId: calendarId,
            eventId: eventId
          });

          const duration = this.getServiceDuration(
            event.data.extendedProperties?.private?.service_type || 'consultation'
          );

          const newStartTime = new Date(newDateTime);
          const newEndTime = new Date(newStartTime.getTime() + (duration * 60 * 1000));

          // Check availability for new time
          const isAvailable = await this.isSlotAvailable(calendarId, newStartTime, newEndTime);
          if (!isAvailable) {
            return {
              success: false,
              error: 'Selected time slot is not available'
            };
          }

          // Update the event
          const updatedEvent = await this.calendar.events.patch({
            calendarId: calendarId,
            eventId: eventId,
            resource: {
              start: {
                dateTime: newStartTime.toISOString(),
                timeZone: 'America/Toronto'
              },
              end: {
                dateTime: newEndTime.toISOString(),
                timeZone: 'America/Toronto'
              }
            },
            sendUpdates: 'all'
          });

          await this.updateAppointmentDateTime(eventId, newStartTime.toISOString());

          return {
            success: true,
            message: 'Appointment rescheduled successfully',
            new_datetime: newStartTime.toISOString()
          };

        default:
          throw new Error(`Invalid action: ${action}`);
      }

    } catch (error) {
      console.error('Appointment management error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get upcoming appointments
   */
  async getUpcomingAppointments(days = 7) {
    try {
      const calendarId = await this.getMainCalendarId();
      const now = new Date();
      const endDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

      const events = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const appointments = (events.data.items || []).map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start_time: event.start.dateTime,
        end_time: event.end.dateTime,
        customer_phone: event.extendedProperties?.private?.customer_phone,
        service_type: event.extendedProperties?.private?.service_type,
        status: event.status,
        attendees: event.attendees?.map(a => ({
          email: a.email,
          name: a.displayName,
          response: a.responseStatus
        })) || []
      }));

      return {
        success: true,
        appointments: appointments,
        count: appointments.length,
        period: `${days} days`
      };

    } catch (error) {
      console.error('Error getting upcoming appointments:', error);
      return {
        success: false,
        error: error.message,
        appointments: []
      };
    }
  }

  /**
   * Calculate available time slots
   */
  calculateAvailableSlots(startDate, endDate, businessHours, duration, existingEvents) {
    const slots = [];
    const slotDuration = duration * 60 * 1000; // Convert to milliseconds

    for (let date = new Date(startDate); date < endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

      const dayHours = businessHours[dayName];
      if (!dayHours || !dayHours.open) continue; // Skip closed days

      const [openHour, openMinute] = dayHours.open.split(':').map(Number);
      const [closeHour, closeMinute] = dayHours.close.split(':').map(Number);

      const dayStart = new Date(date);
      dayStart.setHours(openHour, openMinute, 0, 0);

      const dayEnd = new Date(date);
      dayEnd.setHours(closeHour, closeMinute, 0, 0);

      // Generate 30-minute time slots
      for (let slotStart = new Date(dayStart); slotStart < dayEnd; slotStart.setMinutes(slotStart.getMinutes() + 30)) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        // Skip if slot extends beyond business hours
        if (slotEnd > dayEnd) continue;

        // Skip if slot conflicts with existing events
        const hasConflict = existingEvents.some(event => {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);

          return (slotStart < eventEnd && slotEnd > eventStart);
        });

        if (!hasConflict && slotStart > new Date()) { // Only future slots
          slots.push({
            datetime: slotStart.toISOString(),
            display_time: slotStart.toLocaleString('en-US', {
              timeZone: 'America/Toronto',
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            duration_minutes: duration,
            available: true
          });
        }
      }
    }

    return slots.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  /**
   * Check if a specific time slot is available
   */
  async isSlotAvailable(calendarId, startTime, endTime) {
    try {
      const events = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true
      });

      return (events.data.items || []).length === 0;

    } catch (error) {
      console.error('Error checking slot availability:', error);
      return false;
    }
  }

  /**
   * Build event description with customer details
   */
  buildEventDescription({ customer_name, customer_phone, customer_email, service_type, notes, bike_details }) {
    let description = `Service: ${service_type.replace('_', ' ').toUpperCase()}\n`;
    description += `Customer: ${customer_name}\n`;
    description += `Phone: ${customer_phone}\n`;
    description += `Email: ${customer_email}\n\n`;

    if (bike_details && Object.keys(bike_details).length > 0) {
      description += `Bike Details:\n`;
      Object.entries(bike_details).forEach(([key, value]) => {
        description += `- ${key}: ${value}\n`;
      });
      description += `\n`;
    }

    if (notes) {
      description += `Notes: ${notes}\n\n`;
    }

    description += `Booked via AI Assistant\n`;
    description += `Organization: ${this.organizationId}`;

    return description;
  }

  /**
   * Get service duration in minutes
   */
  getServiceDuration(serviceType) {
    const durations = {
      'tune_up': 60,
      'basic_repair': 45,
      'major_repair': 120,
      'bike_fitting': 90,
      'consultation': 30,
      'wheel_service': 60,
      'brake_service': 30,
      'drivetrain_service': 45
    };

    return durations[serviceType] || 60; // Default 1 hour
  }

  /**
   * Get calendar ID for specific service type
   */
  async getServiceCalendarId(serviceType) {
    // This could be configured per organization
    const serviceCalendars = {
      'tune_up': process.env.CALENDAR_ID_MAINTENANCE,
      'repair': process.env.CALENDAR_ID_REPAIR,
      'bike_fitting': process.env.CALENDAR_ID_FITTING,
      'consultation': process.env.CALENDAR_ID_SALES
    };

    return serviceCalendars[serviceType] || process.env.CALENDAR_ID_MAIN || 'primary';
  }

  async getMainCalendarId() {
    return process.env.CALENDAR_ID_MAIN || 'primary';
  }

  /**
   * Get business hours configuration
   */
  async getBusinessHours() {
    // This could be fetched from database based on organization
    return {
      monday: { open: '09:00', close: '19:00' },
      tuesday: { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday: { open: '09:00', close: '19:00' },
      friday: { open: '09:00', close: '19:00' },
      saturday: { open: '10:00', close: '18:00' },
      sunday: { open: '10:00', close: '18:00' }
    };
  }

  /**
   * Database integration methods (to be implemented)
   */
  async storeAppointment(appointmentData) {
    // Store appointment in Supabase database
    console.log('Storing appointment:', appointmentData);
    // Implementation depends on your database setup
  }

  async updateAppointmentStatus(eventId, status) {
    // Update appointment status in database
    console.log(`Updating appointment ${eventId} status to ${status}`);
  }

  async updateAppointmentDateTime(eventId, newDateTime) {
    // Update appointment datetime in database
    console.log(`Updating appointment ${eventId} datetime to ${newDateTime}`);
  }

  /**
   * Send appointment confirmation via SMS
   */
  async sendAppointmentConfirmation({ phone, name, service, datetime, event_id }) {
    try {
      const formattedDate = new Date(datetime).toLocaleString('en-US', {
        timeZone: 'America/Toronto',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const message = `Hi ${name}! Your ${service.replace('_', ' ')} appointment is confirmed for ${formattedDate}. We'll see you at Bici Bike Store! Reply STOP to opt out.`;

      // This would integrate with your SMS service
      console.log(`SMS confirmation sent to ${phone}: ${message}`);

      return { success: true };

    } catch (error) {
      console.error('Error sending confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process appointment reminders
   */
  async processAppointmentReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const upcomingAppointments = await this.getUpcomingAppointments(1);

      for (const appointment of upcomingAppointments.appointments) {
        const appointmentDate = new Date(appointment.start_time);

        // Send reminder 24 hours before
        if (appointmentDate >= tomorrow && appointmentDate < dayAfter) {
          await this.sendAppointmentReminder(appointment);
        }
      }

      return {
        success: true,
        reminders_sent: upcomingAppointments.appointments.length
      };

    } catch (error) {
      console.error('Error processing reminders:', error);
      return { success: false, error: error.message };
    }
  }

  async sendAppointmentReminder(appointment) {
    // Implementation for sending reminders
    console.log('Sending reminder for appointment:', appointment.id);
  }

  /**
   * Validate calendar configuration
   */
  async validateConfiguration() {
    try {
      await this.calendar.calendarList.list();

      return {
        valid: true,
        message: 'Google Calendar configuration valid'
      };

    } catch (error) {
      return {
        valid: false,
        message: `Calendar configuration error: ${error.message}`
      };
    }
  }
}

export default CalendarIntegration;