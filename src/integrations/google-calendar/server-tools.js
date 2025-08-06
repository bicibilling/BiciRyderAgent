const GoogleCalendarClient = require('./client');
const { serverToolLogger } = require('../../config/logger');

class GoogleCalendarServerTools {
  constructor() {
    this.client = new GoogleCalendarClient();
    this.logger = serverToolLogger.child({ service: 'google-calendar-server-tools' });
  }

  /**
   * Server tool configuration for ElevenLabs
   */
  getServerToolsConfig() {
    return [
      {
        name: "check_appointment_availability",
        description: "Check available appointment slots for bike services (repair, tune-up, fitting, consultation)",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/calendar/availability`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          service_type: {
            type: "string",
            enum: ["bike_repair", "bike_tuneup", "bike_fitting", "consultation", "warranty_service"],
            description: "Type of service appointment needed",
            required: true
          },
          preferred_date: {
            type: "string",
            description: "Preferred date in YYYY-MM-DD format (optional, defaults to today)",
            required: false
          },
          duration_minutes: {
            type: "integer",
            description: "Appointment duration in minutes (optional, uses service default)",
            minimum: 30,
            maximum: 240,
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            service_type: { type: "string" },
            duration_minutes: { type: "integer" },
            available_slots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  datetime: { type: "string" },
                  formatted_time: { type: "string" },
                  duration_minutes: { type: "integer" },
                  available: { type: "boolean" }
                }
              }
            },
            total_available: { type: "integer" },
            date_range: { type: "object" }
          }
        }
      },
      {
        name: "book_service_appointment",
        description: "Book a service appointment for the customer at a specific date and time",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/calendar/book`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          customer_name: {
            type: "string",
            description: "Customer's full name",
            required: true
          },
          customer_phone: {
            type: "string",
            description: "Customer's phone number in international format",
            required: true
          },
          customer_email: {
            type: "string",
            description: "Customer's email address (for confirmations)",
            required: false
          },
          service_type: {
            type: "string",
            enum: ["bike_repair", "bike_tuneup", "bike_fitting", "consultation", "warranty_service"],
            description: "Type of service appointment",
            required: true
          },
          appointment_datetime: {
            type: "string",
            description: "Appointment date and time in ISO format (YYYY-MM-DDTHH:MM:SS)",
            required: true
          },
          notes: {
            type: "string",
            description: "Any additional notes or special requests from the customer",
            required: false
          },
          duration_minutes: {
            type: "integer",
            description: "Appointment duration in minutes (optional, uses service default)",
            minimum: 30,
            maximum: 240,
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            appointment_id: { type: "string" },
            event_link: { type: "string" },
            start_time: { type: "string" },
            end_time: { type: "string" },
            duration_minutes: { type: "integer" },
            service_type: { type: "string" },
            customer_name: { type: "string" },
            confirmation_sent: { type: "boolean" },
            message: { type: "string" }
          }
        }
      },
      {
        name: "update_appointment",
        description: "Update an existing appointment (reschedule or modify details)",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/calendar/update`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          appointment_id: {
            type: "string",
            description: "Google Calendar event ID of the appointment to update",
            required: true
          },
          appointment_datetime: {
            type: "string",
            description: "New appointment date and time in ISO format (if rescheduling)",
            required: false
          },
          notes: {
            type: "string",
            description: "Updated notes or special requests",
            required: false
          },
          duration_minutes: {
            type: "integer",
            description: "Updated appointment duration in minutes",
            minimum: 30,
            maximum: 240,
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            appointment_id: { type: "string" },
            message: { type: "string" },
            updated_event: { type: "object" }
          }
        }
      },
      {
        name: "cancel_appointment",
        description: "Cancel an existing appointment",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/calendar/cancel`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          appointment_id: {
            type: "string",
            description: "Google Calendar event ID of the appointment to cancel",
            required: true
          },
          reason: {
            type: "string",
            description: "Reason for cancellation",
            required: false,
            default: "Customer request"
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            appointment_id: { type: "string" },
            cancelled_event: { type: "object" },
            message: { type: "string" }
          }
        }
      }
    ];
  }

  /**
   * Handle appointment availability check server tool request
   */
  async handleAvailabilityCheck(req, res) {
    try {
      const { service_type, preferred_date, duration_minutes } = req.body;

      this.logger.info('Processing availability check request', { 
        service_type,
        preferred_date,
        duration_minutes 
      });

      const result = await this.client.getAvailableSlots(
        service_type, 
        preferred_date, 
        duration_minutes
      );

      this.logger.info('Availability check completed', { 
        service_type,
        success: result.success,
        slotsFound: result.total_available 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Availability check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during availability check',
        available_slots: [],
        total_available: 0
      });
    }
  }

  /**
   * Handle appointment booking server tool request
   */
  async handleAppointmentBooking(req, res) {
    try {
      const {
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        notes,
        duration_minutes
      } = req.body;

      this.logger.info('Processing appointment booking request', { 
        customer_name,
        service_type,
        appointment_datetime 
      });

      const appointmentData = {
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        notes,
        duration_minutes
      };

      const result = await this.client.bookAppointment(appointmentData);

      this.logger.info('Appointment booking completed', { 
        customer_name,
        service_type,
        success: result.success,
        appointment_id: result.appointment_id 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Appointment booking error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during appointment booking'
      });
    }
  }

  /**
   * Handle appointment update server tool request
   */
  async handleAppointmentUpdate(req, res) {
    try {
      const { appointment_id, appointment_datetime, notes, duration_minutes } = req.body;

      this.logger.info('Processing appointment update request', { 
        appointment_id,
        appointment_datetime 
      });

      const updateData = {};
      if (appointment_datetime) updateData.appointment_datetime = appointment_datetime;
      if (notes) updateData.notes = notes;
      if (duration_minutes) updateData.duration_minutes = duration_minutes;

      const result = await this.client.updateAppointment(appointment_id, updateData);

      this.logger.info('Appointment update completed', { 
        appointment_id,
        success: result.success 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Appointment update error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during appointment update'
      });
    }
  }

  /**
   * Handle appointment cancellation server tool request
   */
  async handleAppointmentCancellation(req, res) {
    try {
      const { appointment_id, reason } = req.body;

      this.logger.info('Processing appointment cancellation request', { 
        appointment_id,
        reason 
      });

      const result = await this.client.cancelAppointment(appointment_id, reason);

      this.logger.info('Appointment cancellation completed', { 
        appointment_id,
        success: result.success 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Appointment cancellation error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during appointment cancellation'
      });
    }
  }

  /**
   * Test Google Calendar connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing Google Calendar connection');
      
      const result = await this.client.testConnection();
      
      this.logger.info('Google Calendar connection test completed', { success: result.success });

      return result;

    } catch (error) {
      this.logger.error('Google Calendar connection test failed', { error: error.message });
      
      return {
        success: false,
        error: `Google Calendar connection test failed: ${error.message}`
      };
    }
  }
}

module.exports = GoogleCalendarServerTools;