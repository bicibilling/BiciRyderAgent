const HubSpotClient = require('./client');
const { serverToolLogger } = require('../../config/logger');

class HubSpotServerTools {
  constructor() {
    this.client = new HubSpotClient();
    this.logger = serverToolLogger.child({ service: 'hubspot-server-tools' });
  }

  /**
   * Server tool configuration for ElevenLabs
   */
  getServerToolsConfig() {
    return [
      {
        name: "search_customer_crm",
        description: "Search for existing customer in CRM system using email or phone number to get customer history and context",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/hubspot/contacts/search`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          email: {
            type: "string",
            description: "Customer's email address",
            required: false
          },
          phone_number: {
            type: "string",
            description: "Customer's phone number in international format (+1234567890)",
            required: false
          }
        },
        required_one_of: ["email", "phone_number"],
        response_schema: {
          type: "object",
          properties: {
            found: { type: "boolean" },
            contact_id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            company: { type: "string" },
            lifecycle_stage: { type: "string" },
            lead_status: { type: "string" },
            bike_interest: { type: "string" },
            last_activity_date: { type: "string" }
          }
        }
      },
      {
        name: "create_customer_lead",
        description: "Create a new customer lead in CRM system with information gathered during the call",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/hubspot/contacts/create`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          first_name: {
            type: "string",
            description: "Customer's first name",
            required: true
          },
          last_name: {
            type: "string",
            description: "Customer's last name",
            required: false
          },
          email: {
            type: "string",
            description: "Customer's email address",
            required: false
          },
          phone: {
            type: "string",
            description: "Customer's phone number",
            required: true
          },
          company: {
            type: "string",
            description: "Customer's company name",
            required: false
          },
          bike_interest: {
            type: "string",
            description: "Type of bike or service the customer is interested in",
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            contact_id: { type: "string" },
            name: { type: "string" },
            message: { type: "string" }
          }
        }
      },
      {
        name: "create_support_ticket",
        description: "Create a support ticket in CRM for customer issues, complaints, or service requests",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/hubspot/tickets/create`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          contact_id: {
            type: "string",
            description: "HubSpot contact ID (from previous search or create contact call)",
            required: false
          },
          subject: {
            type: "string",
            description: "Brief subject line describing the issue or request",
            required: true
          },
          description: {
            type: "string",
            description: "Detailed description of the customer's issue or request",
            required: true
          },
          priority: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH"],
            description: "Priority level of the ticket",
            required: false,
            default: "MEDIUM"
          },
          category: {
            type: "string",
            enum: ["BIKE_REPAIR", "WARRANTY", "PRODUCT_INQUIRY", "BILLING", "GENERAL"],
            description: "Category of the support request",
            required: false,
            default: "GENERAL"
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            ticket_id: { type: "string" },
            ticket_number: { type: "string" },
            subject: { type: "string" },
            status: { type: "string" },
            message: { type: "string" }
          }
        }
      },
      {
        name: "create_sales_opportunity",
        description: "Create a sales opportunity/deal in CRM when customer shows strong buying intent",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/hubspot/deals/create`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          contact_id: {
            type: "string",
            description: "HubSpot contact ID (from previous search or create contact call)",
            required: true
          },
          deal_name: {
            type: "string",
            description: "Name of the sales opportunity (e.g., 'Mountain Bike Purchase - John Smith')",
            required: true
          },
          amount: {
            type: "string",
            description: "Estimated deal value in dollars",
            required: false
          },
          bike_type: {
            type: "string",
            description: "Type of bike or product they're interested in",
            required: false
          },
          stage: {
            type: "string",
            enum: ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent", "closedwon", "closedlost"],
            description: "Current stage of the sales opportunity",
            required: false,
            default: "qualifiedtobuy"
          },
          close_date: {
            type: "string",
            description: "Expected close date in ISO format (YYYY-MM-DD)",
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            deal_id: { type: "string" },
            deal_name: { type: "string" },
            amount: { type: "string" },
            stage: { type: "string" },
            message: { type: "string" }
          }
        }
      },
      {
        name: "get_customer_history",
        description: "Get customer's interaction history and previous conversations from CRM",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/hubspot/contacts/history`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          contact_id: {
            type: "string",
            description: "HubSpot contact ID",
            required: true
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            contact: { type: "object" },
            recent_activities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  title: { type: "string" },
                  notes: { type: "string" },
                  created_at: { type: "string" }
                }
              }
            }
          }
        }
      }
    ];
  }

  /**
   * Handle customer search server tool request
   */
  async handleCustomerSearch(req, res) {
    try {
      const { email, phone_number } = req.body;

      this.logger.info('Processing customer search request', { 
        email: email ? email.substring(0, 4) + '***' : null,
        phone_number: phone_number ? phone_number.substring(0, 4) + '***' : null 
      });

      const result = await this.client.searchContact(email, phone_number);

      this.logger.info('Customer search completed', { 
        email: email ? email.substring(0, 4) + '***' : null,
        phone_number: phone_number ? phone_number.substring(0, 4) + '***' : null,
        found: result.found
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Customer search error', { error: error.message });
      res.status(500).json({
        found: false,
        error: 'Internal server error during customer search'
      });
    }
  }

  /**
   * Handle customer lead creation server tool request
   */
  async handleLeadCreation(req, res) {
    try {
      const { first_name, last_name, email, phone, company, bike_interest } = req.body;

      this.logger.info('Processing lead creation request', { 
        first_name,
        email: email ? email.substring(0, 4) + '***' : null,
        phone: phone ? phone.substring(0, 4) + '***' : null 
      });

      const contactData = {
        firstName: first_name,
        lastName: last_name,
        email,
        phone,
        company,
        bikeInterest: bike_interest
      };

      const result = await this.client.createContact(contactData);

      this.logger.info('Lead creation completed', { 
        first_name,
        success: result.success,
        contact_id: result.contact_id 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Lead creation error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during lead creation'
      });
    }
  }

  /**
   * Handle support ticket creation server tool request
   */
  async handleTicketCreation(req, res) {
    try {
      const { contact_id, subject, description, priority, category } = req.body;

      this.logger.info('Processing ticket creation request', { 
        contact_id,
        subject,
        priority,
        category 
      });

      const ticketData = {
        subject,
        description,
        priority: priority || 'MEDIUM',
        category: category || 'GENERAL'
      };

      const result = await this.client.createTicket(contact_id, ticketData);

      this.logger.info('Ticket creation completed', { 
        contact_id,
        success: result.success,
        ticket_id: result.ticket_id 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Ticket creation error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during ticket creation'
      });
    }
  }

  /**
   * Handle deal creation server tool request
   */
  async handleDealCreation(req, res) {
    try {
      const { contact_id, deal_name, amount, bike_type, stage, close_date } = req.body;

      this.logger.info('Processing deal creation request', { 
        contact_id,
        deal_name,
        amount,
        bike_type 
      });

      const dealData = {
        dealName: deal_name,
        amount,
        bikeType: bike_type,
        stage: stage || 'qualifiedtobuy',
        closeDate: close_date
      };

      const result = await this.client.createDeal(contact_id, dealData);

      this.logger.info('Deal creation completed', { 
        contact_id,
        success: result.success,
        deal_id: result.deal_id 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Deal creation error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during deal creation'
      });
    }
  }

  /**
   * Handle customer history retrieval server tool request
   */
  async handleCustomerHistory(req, res) {
    try {
      const { contact_id } = req.body;

      this.logger.info('Processing customer history request', { contact_id });

      const result = await this.client.getContactHistory(contact_id);

      this.logger.info('Customer history completed', { 
        contact_id,
        success: result.success,
        activitiesCount: result.recent_activities?.length || 0 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Customer history error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during customer history retrieval'
      });
    }
  }

  /**
   * Test HubSpot connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing HubSpot connection');
      
      const result = await this.client.testConnection();
      
      this.logger.info('HubSpot connection test completed', { success: result.success });

      return result;

    } catch (error) {
      this.logger.error('HubSpot connection test failed', { error: error.message });
      
      return {
        success: false,
        error: `HubSpot connection test failed: ${error.message}`
      };
    }
  }
}

module.exports = HubSpotServerTools;