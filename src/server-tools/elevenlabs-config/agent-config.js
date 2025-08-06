const ShopifyServerTools = require('../../integrations/shopify/server-tools');
const HubSpotServerTools = require('../../integrations/hubspot/server-tools');
const GoogleCalendarServerTools = require('../../integrations/google-calendar/server-tools');
const { serverToolLogger } = require('../../config/logger');

class ElevenLabsAgentConfig {
  constructor() {
    this.shopifyTools = new ShopifyServerTools();
    this.hubspotTools = new HubSpotServerTools();
    this.calendarTools = new GoogleCalendarServerTools();
    this.logger = serverToolLogger.child({ service: 'elevenlabs-agent-config' });
  }

  /**
   * Get complete agent configuration for ElevenLabs
   */
  getAgentConfiguration() {
    return {
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      name: "Bici AI Assistant",
      language: "en",
      
      // Voice configuration
      voice: {
        voice_id: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM", // Default voice
        stability: 0.65,
        similarity_boost: 0.85,
        speed: 1.0,
        optimize_streaming_latency: 2
      },

      // System prompt with comprehensive bike store knowledge
      system_prompt: this.getBikeStoreSystemPrompt(),

      // First message
      first_message: "Hi! I'm your AI assistant at Bici Bike Store. How can I help you with your biking needs today?",

      // Server tools configuration
      server_tools: this.getAllServerTools(),

      // Client tools (for real-time dashboard updates)
      client_tools: this.getClientTools(),

      // Conversation configuration
      conversation_config: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        
        // Language detection and switching
        language_detection: {
          enabled: true,
          supported_languages: ["en", "fr"],
          auto_switch: true,
          confidence_threshold: 0.8
        },

        // Max conversation length
        max_duration_ms: 1800000, // 30 minutes

        // Context preservation
        context_preservation: true,
        
        // Webhook for conversation events
        webhook_url: `${process.env.BASE_URL}/api/webhooks/elevenlabs/conversation`,
        webhook_version: "2.0"
      },

      // Knowledge base configuration
      knowledge_base: {
        enabled: true,
        sources: [
          {
            type: "file",
            name: "store_policies",
            description: "Store hours, locations, policies, and contact information"
          },
          {
            type: "file", 
            name: "bike_catalog",
            description: "Complete bike catalog with specifications and pricing"
          },
          {
            type: "file",
            name: "service_information", 
            description: "Repair services, maintenance packages, and pricing"
          },
          {
            type: "file",
            name: "faq",
            description: "Frequently asked questions and common customer inquiries"
          }
        ]
      },

      // Pronunciation dictionary for bike terminology
      pronunciation_dictionary: {
        enabled: true,
        entries: [
          { text: "Bici", phoneme: "BEE-chee" },
          { text: "Shimano", phoneme: "shih-MAH-no" },
          { text: "SRAM", phoneme: "SRAM" },
          { text: "Campagnolo", phoneme: "cam-pan-YO-lo" },
          { text: "derailleur", phoneme: "dih-RAY-ler" }
        ]
      }
    };
  }

  /**
   * Comprehensive system prompt for bike store operations
   */
  getBikeStoreSystemPrompt() {
    return `
You are Bici's AI assistant, a friendly and knowledgeable bike store expert helping customers over the phone.

## YOUR IDENTITY & ROLE
- You work for Bici Bike Store, a premium bike retailer specializing in road bikes, mountain bikes, e-bikes, and accessories
- You're an expert in bike repairs, maintenance, fitting, and product recommendations
- You help customers find the perfect bike, book service appointments, check orders, and provide expert advice
- You capture every interaction as a qualified lead for the sales team

## CORE CAPABILITIES
1. **Product Information & Recommendations**: Help customers choose the right bike based on their needs, budget, and riding style
2. **Order Status & Support**: Look up order status, tracking information, and resolve order-related questions
3. **Service Appointments**: Check availability and book repair, tune-up, and fitting appointments
4. **Lead Management**: Create and update customer records in our CRM system
5. **Support Tickets**: Handle complaints and service issues by creating support tickets

## CONVERSATION FLOW
1. **Greeting**: Always greet warmly and ask how you can help
2. **Identify Customer**: Use search_customer_crm to look up existing customers by phone/email
3. **Understand Needs**: Ask relevant questions to understand their specific requirements
4. **Provide Solutions**: Use appropriate server tools to check inventory, book appointments, or create leads
5. **Follow Up**: Always ensure customer satisfaction and offer additional assistance

## SERVER TOOLS USAGE GUIDELINES

### Customer Management (HubSpot CRM)
- **search_customer_crm**: Always search for existing customers first using phone number or email
- **create_customer_lead**: Create new leads for first-time customers with complete information
- **create_support_ticket**: For complaints, warranty issues, or complex problems
- **create_sales_opportunity**: When customer shows strong buying intent

### Product & Inventory (Shopify)
- **check_order_status**: Look up orders by phone, email, or order number
- **check_product_availability**: Verify stock levels for specific bikes and accessories
- **get_product_recommendations**: Provide personalized bike recommendations based on customer profile

### Appointments (Google Calendar)
- **check_appointment_availability**: Show available slots for services
- **book_service_appointment**: Schedule repair, tune-up, or fitting appointments
- **update_appointment**: Reschedule or modify existing appointments
- **cancel_appointment**: Cancel appointments when requested

## CONVERSATION BEST PRACTICES

### Information Gathering
- Ask about riding experience, intended use, budget, size preferences
- Gather complete contact information (name, phone, email)
- Understand urgency and timeline for purchases or services

### Product Recommendations
- Match bikes to customer's riding style (commuting, recreation, racing, mountain)
- Consider budget constraints and suggest alternatives
- Explain key differences between bike types and brands
- Mention current promotions or special offers

### Service Booking
- Explain different service types (basic tune-up, full service, repairs)
- Ask about specific issues or maintenance needs  
- Offer multiple appointment options
- Confirm customer contact details for reminders

### Customer Service
- Listen actively to complaints and concerns
- Acknowledge issues and show empathy
- Create support tickets for complex problems
- Follow up on resolutions and ensure satisfaction

## ESCALATION TRIGGERS
Transfer to human agent when:
- Customer requests to speak with a person
- Complex technical repairs beyond basic troubleshooting
- Price negotiations over $1,000
- Warranty disputes or refund requests
- Any situation where you're uncertain about the correct response

## IMPORTANT REMINDERS
- Always use server tools to access real-time data
- Create leads for every customer interaction
- Capture bike interests and preferences in customer records
- Book appointments promptly when customers express interest
- Maintain a friendly, helpful, and professional tone
- Ask clarifying questions when information is unclear

Remember: Your goal is to provide excellent customer service while capturing every interaction as a qualified lead for our sales team.
    `.trim();
  }

  /**
   * Get all server tools configuration
   */
  getAllServerTools() {
    return [
      // Shopify tools
      ...this.shopifyTools.getServerToolsConfig(),
      
      // HubSpot CRM tools
      ...this.hubspotTools.getServerToolsConfig(),
      
      // Google Calendar tools
      ...this.calendarTools.getServerToolsConfig(),

      // Additional utility tools
      ...this.getUtilityServerTools()
    ];
  }

  /**
   * Additional utility server tools
   */
  getUtilityServerTools() {
    return [
      {
        name: "get_store_information",
        description: "Get current store hours, location, contact information, and basic policies",
        method: "GET",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/store/info`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          info_type: {
            type: "string",
            enum: ["hours", "location", "contact", "policies", "promotions"],
            description: "Type of store information requested",
            required: true
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            info_type: { type: "string" },
            data: { type: "object" },
            message: { type: "string" }
          }
        }
      }
    ];
  }

  /**
   * Client tools for real-time dashboard updates
   */
  getClientTools() {
    return [
      {
        name: "update_customer_display",
        description: "Update customer information display on agent dashboard",
        parameters: {
          customer_data: {
            type: "object",
            description: "Customer information to display",
            required: true
          },
          action: {
            type: "string",
            enum: ["show", "highlight", "update"],
            description: "Display action to perform",
            required: true
          }
        }
      },
      {
        name: "show_product_recommendation",
        description: "Display product recommendations on agent dashboard",
        parameters: {
          products: {
            type: "array",
            description: "Array of recommended products",
            required: true
          },
          reason: {
            type: "string",
            description: "Reason for recommendation",
            required: true
          }
        }
      },
      {
        name: "trigger_follow_up_action",
        description: "Schedule automated follow-up actions",
        parameters: {
          action_type: {
            type: "string",
            enum: ["email", "sms", "call", "appointment_reminder"],
            description: "Type of follow-up action",
            required: true
          },
          delay_minutes: {
            type: "integer",
            description: "Minutes to wait before executing action",
            required: true
          },
          message_template: {
            type: "string",
            description: "Template for follow-up message",
            required: false
          }
        }
      }
    ];
  }

  /**
   * Get language-specific agent configuration
   */
  getLanguageSpecificConfig(language = 'en') {
    const baseConfig = this.getAgentConfiguration();
    
    if (language === 'fr') {
      return {
        ...baseConfig,
        language: 'fr',
        system_prompt: this.getFrenchSystemPrompt(),
        first_message: "Bonjour! Je suis votre assistant IA chez Bici Bike Store. Comment puis-je vous aider avec vos besoins de vélo aujourd'hui?"
      };
    }
    
    return baseConfig;
  }

  /**
   * French system prompt
   */
  getFrenchSystemPrompt() {
    return `
Vous êtes l'assistant IA de Bici, un expert sympathique et compétent en magasin de vélos aidant les clients au téléphone.

## VOTRE IDENTITÉ ET RÔLE
- Vous travaillez pour Bici Bike Store, un détaillant de vélos haut de gamme spécialisé dans les vélos de route, vélos de montagne, vélos électriques et accessoires
- Vous êtes expert en réparations, entretien, ajustement et recommandations de produits
- Vous aidez les clients à trouver le vélo parfait, réserver des rendez-vous de service, vérifier les commandes et fournir des conseils d'expert
- Vous capturez chaque interaction comme prospect qualifié pour l'équipe de vente

## CAPACITÉS PRINCIPALES
1. **Informations Produits & Recommandations**: Aider les clients à choisir le bon vélo selon leurs besoins, budget et style de conduite
2. **Statut Commande & Support**: Rechercher le statut des commandes, informations de suivi et résoudre questions liées aux commandes
3. **Rendez-vous Service**: Vérifier disponibilité et réserver rendez-vous de réparation, mise au point et ajustement
4. **Gestion Prospects**: Créer et mettre à jour dossiers clients dans notre système CRM
5. **Tickets Support**: Gérer plaintes et problèmes de service en créant tickets de support

Utilisez les mêmes outils serveur mais adaptez vos réponses en français naturel et professionnel.
    `.trim();
  }

  /**
   * Test all integrations
   */
  async testAllIntegrations() {
    try {
      this.logger.info('Testing all integrations');

      const results = {
        shopify: await this.shopifyTools.testConnection(),
        hubspot: await this.hubspotTools.testConnection(),
        calendar: await this.calendarTools.testConnection()
      };

      const allSuccessful = Object.values(results).every(result => result.success);

      this.logger.info('Integration tests completed', { 
        allSuccessful,
        results 
      });

      return {
        success: allSuccessful,
        integrations: results,
        message: allSuccessful 
          ? 'All integrations are working correctly'
          : 'Some integrations have issues - check logs for details'
      };

    } catch (error) {
      this.logger.error('Integration testing failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        message: 'Integration testing failed'
      };
    }
  }
}

module.exports = ElevenLabsAgentConfig;