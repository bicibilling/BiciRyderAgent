# **🚴‍♂️ BICI AI Voice Agent System: COMPLETE IMPLEMENTATION GUIDE**

## **📋 PROJECT OVERVIEW & SOW ALIGNMENT**

**Primary Objective**: Build a production-ready AI phone system to handle **2,000+ monthly calls** using ElevenLabs and Twilio, targeting **<50% human intervention** while capturing every interaction as a qualified lead.

### **SOW Call Distribution & AI Solutions**
- **53% Sales/Product Information** → AI automation with RAG knowledge base
- **18% Order Status/Support** → Real-time Shopify integration via server tools  
- **14% Service Appointments** → Google Calendar booking with WebSocket coordination
- **15% Human Escalation** → Intelligent routing with seamless context transfer

### **Technology Stack (SOW Specified)**
- **AI Voice**: ElevenLabs Conversational AI with advanced WebSocket integration
- **Telephony**: Twilio native integration with personalization webhooks
- **Database/CRM**: Supabase (dev) + HubSpot (production) with multi-tenant architecture
- **Integrations**: Shopify API, Google Calendar, HubSpot CRM
- **Dashboard**: Real-time agent interface with WebSocket streaming

---

## **🔌 ADVANCED WEBSOCKET ARCHITECTURE**

### **1. ElevenLabs WebSocket Integration**

#### **A. WebSocket Connection Management**
```javascript
// WebSocket URL: wss://api.elevenlabs.io/v1/convai/conversation
class ElevenLabsWebSocket {
  constructor(organizationId, leadId, agentConfig) {
    this.organizationId = organizationId;
    this.leadId = leadId;
    this.agentConfig = agentConfig;
    this.ws = null;
    this.connectionState = 'disconnected';
    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }
  
  async connect(signedUrl) {
    try {
      this.ws = new WebSocket(signedUrl);
      
      // Connection opened
      this.ws.onopen = () => {
        this.connectionState = 'connected';
        this.sendConversationInitiation();
        console.log('🔗 ElevenLabs WebSocket connected');
      };
      
      // Message received
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      };
      
      // Connection closed
      this.ws.onclose = (event) => {
        this.connectionState = 'disconnected';
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        if (!event.wasClean) {
          this.attemptReconnection();
        }
      };
      
      // Error handling
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.handleConnectionError(error);
      };
      
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      throw error;
    }
  }
  
  sendConversationInitiation() {
    const initMessage = {
      type: 'conversation_initiation',
      conversation_config: {
        agent_id: this.agentConfig.agent_id,
        // Dynamic variables from customer context
        dynamic_variables: this.buildDynamicVariables(),
        // Voice configuration
        voice_config: {
          voice_id: this.agentConfig.voice_id,
          stability: this.agentConfig.stability || 0.65,
          similarity_boost: this.agentConfig.similarity || 0.85,
          speed: this.agentConfig.speed || 1.0
        },
        // Language and personalization
        language: this.agentConfig.language || 'en',
        first_message: this.agentConfig.first_message
      }
    };
    
    this.send(initMessage);
  }
}
```

#### **B. Complete WebSocket Event Handling**
```javascript
// Handle all WebSocket message types
handleWebSocketMessage(data) {
  switch (data.type) {
    // Server-to-Client Events
    case 'conversation_initiation_metadata':
      this.handleConversationInit(data);
      break;
      
    case 'ping':
      this.handlePing(data);
      break;
      
    case 'audio':
      this.handleAudioStream(data);
      break;
      
    case 'user_transcript':
      this.handleUserTranscript(data);
      break;
      
    case 'agent_response':
      this.handleAgentResponse(data);
      break;
      
    case 'client_tool_call':
      this.handleClientToolCall(data);
      break;
      
    case 'vad_score':
      this.handleVADScore(data);
      break;
      
    case 'tentative_agent_response':
      this.handleTentativeResponse(data);
      break;
      
    default:
      console.warn('Unknown WebSocket message type:', data.type);
  }
}

// Client-to-Server Event Senders
sendUserAudio(audioChunk) {
  if (this.connectionState === 'connected') {
    this.send({
      type: 'user_audio_chunk',
      chunk: audioChunk, // Base64 encoded audio
      sample_rate: 16000,
      format: 'pcm'
    });
  }
}

sendContextualUpdate(updateText) {
  this.send({
    type: 'contextual_update', 
    text: updateText
  });
}

sendUserMessage(message) {
  this.send({
    type: 'user_message',
    text: message
  });
}

sendUserActivity() {
  this.send({
    type: 'user_activity'
  });
}

sendClientToolResult(toolCallId, result) {
  this.send({
    type: 'client_tool_result',
    tool_call_id: toolCallId,
    result: result
  });
}
```

### **2. Real-Time Dashboard with WebSocket Streaming**

#### **A. Multi-Channel WebSocket Manager**
```javascript
// Manage multiple WebSocket connections for real-time dashboard
class DashboardWebSocketManager {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.activeConnections = new Map(); // leadId -> connection
    this.elevenlabsConnections = new Map(); // conversationId -> ElevenLabs WS
    this.clientConnections = new Map(); // dashboardSessionId -> client WS
    this.redisClient = new Redis(process.env.UPSTASH_REDIS_URL);
  }
  
  // Create new conversation WebSocket
  async createConversationWebSocket(leadId, customerPhone) {
    const leadData = await this.getLeadData(leadId);
    const signedUrl = await this.generateSignedURL(leadId);
    
    // Create ElevenLabs WebSocket connection
    const elevenlabsWS = new ElevenLabsWebSocket(
      this.organizationId,
      leadId,
      await this.buildAgentConfig(leadData, customerPhone)
    );
    
    await elevenlabsWS.connect(signedUrl);
    
    // Store connection
    this.elevenlabsConnections.set(leadId, elevenlabsWS);
    
    // Set up event forwarding to dashboard clients
    elevenlabsWS.onEvent('*', (eventData) => {
      this.broadcastToDashboard({
        type: 'conversation_event',
        leadId: leadId,
        eventData: eventData,
        timestamp: new Date().toISOString()
      });
    });
    
    return elevenlabsWS;
  }
  
  // Handle dashboard client connections
  handleDashboardConnection(ws, sessionId) {
    this.clientConnections.set(sessionId, {
      ws: ws,
      organizationId: this.organizationId,
      connectedAt: new Date(),
      subscribedLeads: new Set()
    });
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'dashboard_connected',
      sessionId: sessionId,
      organizationId: this.organizationId
    }));
    
    // Handle client messages
    ws.on('message', (message) => {
      const data = JSON.parse(message);
      this.handleDashboardMessage(sessionId, data);
    });
    
    // Cleanup on disconnect
    ws.on('close', () => {
      this.clientConnections.delete(sessionId);
    });
  }
  
  // Broadcast to all connected dashboard clients
  broadcastToDashboard(data) {
    this.clientConnections.forEach((connection, sessionId) => {
      if (connection.organizationId === this.organizationId) {
        try {
          connection.ws.send(JSON.stringify({
            ...data,
            organizationId: this.organizationId,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('Failed to broadcast to dashboard client:', error);
          this.clientConnections.delete(sessionId);
        }
      }
    });
  }
}
```

#### **B. Redis Integration for Session Management**
```javascript
// Enhanced Redis integration based on Upstash pattern
class ConversationStateManager {
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });
  }
  
  // Store conversation state with retry mechanism
  async storeConversationState(conversationId, state, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = `conversation:${conversationId}`;
        const data = {
          ...state,
          updated_at: new Date().toISOString(),
          organization_id: state.organizationId
        };
        
        // Store with 24-hour expiration
        await this.redis.setex(key, 86400, JSON.stringify(data));
        
        console.log(`✅ Stored conversation state for ${conversationId}`);
        return true;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to store conversation state after ${maxRetries} attempts`);
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  
  // Retrieve conversation state with caching
  async getConversationState(conversationId) {
    try {
      const key = `conversation:${conversationId}`;
      const data = await this.redis.get(key);
      
      if (data) {
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('Failed to retrieve conversation state:', error);
      return null;
    }
  }
  
  // Store dynamic variables for context preservation
  async storeDynamicVariables(phoneNumber, organizationId, variables) {
    const key = `variables:${organizationId}:${phoneNumber}`;
    await this.redis.setex(key, 3600, JSON.stringify(variables)); // 1 hour expiration
  }
  
  async getDynamicVariables(phoneNumber, organizationId) {
    const key = `variables:${organizationId}:${phoneNumber}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}
```

### **3. Advanced Integration Patterns**

#### **A. HubSpot CRM Integration (SOW Requirement)**
```javascript
// HubSpot integration following the documented pattern
class HubSpotIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
    this.baseURL = 'https://api.hubapi.com';
  }
  
  // Server tool for HubSpot contact lookup
  async searchContact(email, phoneNumber) {
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
          'lifecycle_stage', 'lead_status', 'last_activity_date'
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
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const contact = data.results[0];
        return {
          found: true,
          contact_id: contact.id,
          name: `${contact.properties.firstname} ${contact.properties.lastname}`,
          email: contact.properties.email,
          phone: contact.properties.phone,
          company: contact.properties.company,
          lifecycle_stage: contact.properties.lifecycle_stage,
          lead_status: contact.properties.lead_status,
          last_activity: contact.properties.last_activity_date
        };
      }
      
      return { found: false };
      
    } catch (error) {
      console.error('HubSpot contact search error:', error);
      return { found: false, error: error.message };
    }
  }
  
  // Create new contact/lead in HubSpot
  async createContact(contactData) {
    try {
      const properties = {
        email: contactData.email,
        phone: contactData.phone,
        firstname: contactData.firstName,
        lastname: contactData.lastName,
        company: contactData.company || 'Bici Bike Store Customer',
        lifecycle_stage: 'lead',
        lead_status: 'new',
        bike_interest: contactData.bikeInterest,
        lead_source: 'ai_phone_call'
      };
      
      const response = await fetch(`${this.baseURL}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });
      
      const newContact = await response.json();
      
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
  
  // Create support ticket associated with contact
  async createTicket(contactId, ticketData) {
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
      
      const ticket = await ticketResponse.json();
      
      // Associate ticket with contact
      await this.associateTicketWithContact(ticket.id, contactId);
      
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
}
```

#### **B. Cal.com-Style Calendar Integration** 
```javascript
// Google Calendar integration following Cal.com pattern
class CalendarIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.calendar = new google.calendar.Calendar({
      version: 'v3',
      auth: this.getGoogleAuth()
    });
  }
  
  // Server tool: Get available appointment slots
  async getAvailableSlots(serviceType, preferredDate, duration = 60) {
    try {
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
      
      // Get business hours
      const businessHours = await this.getBusinessHours();
      
      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        startDate,
        endDate,
        businessHours,
        duration,
        events.data.items
      );
      
      return {
        success: true,
        service_type: serviceType,
        duration_minutes: duration,
        available_slots: availableSlots.slice(0, 20), // First 20 slots
        total_available: availableSlots.length
      };
      
    } catch (error) {
      console.error('Calendar availability error:', error);
      return { 
        success: false, 
        error: 'Unable to check calendar availability' 
      };
    }
  }
  
  // Server tool: Book appointment
  async bookAppointment(appointmentData) {
    try {
      const {
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        notes
      } = appointmentData;
      
      const calendarId = await this.getServiceCalendarId(service_type);
      const endTime = new Date(new Date(appointment_datetime).getTime() + (60 * 60 * 1000)); // 1 hour default
      
      // Create calendar event
      const event = {
        summary: `${service_type} - ${customer_name}`,
        description: `
Service: ${service_type}
Customer: ${customer_name}
Phone: ${customer_phone}
Email: ${customer_email}
Notes: ${notes}

Booked via AI Assistant
        `.trim(),
        start: {
          dateTime: appointment_datetime,
          timeZone: 'America/Toronto'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Toronto'
        },
        attendees: [
          { email: customer_email, displayName: customer_name }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'sms', minutes: 60 }         // 1 hour
          ]
        }
      };
      
      const createdEvent = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: 'all'
      });
      
      // Store in database
      await this.storeAppointment({
        google_event_id: createdEvent.data.id,
        organization_id: this.organizationId,
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        status: 'confirmed',
        notes
      });
      
      return {
        success: true,
        appointment_id: createdEvent.data.id,
        confirmation_link: createdEvent.data.htmlLink,
        message: 'Appointment booked successfully'
      };
      
    } catch (error) {
      console.error('Appointment booking error:', error);
      return { 
        success: false, 
        error: 'Unable to book appointment' 
      };
    }
  }
}
```

### **4. Enhanced Outbound Calling System**

#### **A. Twilio Outbound Call API Integration**
```javascript
// Complete outbound calling system using ElevenLabs Twilio API
class OutboundCallManager {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.agentId = process.env.ELEVENLABS_AGENT_ID;
    this.phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  }
  
  // Initiate outbound call with full context
  async initiateOutboundCall(callData) {
    const {
      phoneNumber,
      leadId,
      callReason,
      priority = 'medium',
      scheduledTime = null
    } = callData;
    
    try {
      // Get customer context
      const customerData = await this.getCustomerContext(phoneNumber, leadId);
      
      // Build conversation initiation data
      const conversationInitData = {
        dynamic_variables: await this.buildDynamicVariables(customerData, callReason),
        conversation_config_override: this.buildConversationOverrides(customerData, callReason)
      };
      
      // Make outbound call via ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenlabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          agent_phone_number_id: this.phoneNumberId,
          to_number: phoneNumber,
          conversation_initiation_client_data: conversationInitData
        })
      });
      
      const result = await response.json();
      
      if (result.conversation_id) {
        // Log outbound call
        await this.logOutboundCall({
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          lead_id: leadId,
          phone_number: phoneNumber,
          call_reason: callReason,
          priority: priority,
          organization_id: this.organizationId,
          initiated_at: new Date().toISOString()
        });
        
        // Broadcast to dashboard
        this.broadcastCallInitiated({
          type: 'outbound_call_initiated',
          conversationId: result.conversation_id,
          callSid: result.callSid,
          phoneNumber: phoneNumber,
          leadId: leadId,
          callReason: callReason,
          organizationId: this.organizationId
        });
        
        return {
          success: true,
          conversation_id: result.conversation_id,
          call_sid: result.callSid,
          message: `Outbound call initiated for ${callReason}`
        };
      } else {
        throw new Error('Failed to initiate outbound call');
      }
      
    } catch (error) {
      console.error('Outbound call error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Build dynamic variables for outbound calls
  async buildDynamicVariables(customerData, callReason) {
    const conversationHistory = await this.getConversationHistory(
      customerData.phoneNumber, 
      this.organizationId
    );
    
    return {
      // Customer context
      customer_name: customerData.name || 'Valued Customer',
      customer_phone: customerData.phoneNumber,
      customer_email: customerData.email || '',
      customer_tier: customerData.tier || 'Regular',
      previous_purchases: JSON.stringify(customerData.purchaseHistory || []),
      
      // Conversation context
      conversation_context: this.buildConversationContext(conversationHistory),
      previous_summary: customerData.previousSummary || 'No previous calls',
      lead_status: customerData.leadStatus || 'Active Lead',
      interaction_count: conversationHistory.length.toString(),
      last_contact_date: customerData.lastContact || 'Never',
      
      // Business context
      organization_name: await this.getOrganizationName(),
      organization_id: this.organizationId,
      store_hours: await this.getCurrentStoreHours(),
      current_promotions: await this.getCurrentPromotions(),
      
      // Call context
      caller_type: 'outbound',
      call_reason: callReason,
      urgency_level: this.determineUrgency(callReason),
      preferred_language: customerData.preferredLanguage || 'en'
    };
  }
  
  // Automated service reminder system
  async processServiceReminders() {
    const upcomingServices = await this.getUpcomingServices();
    
    for (const service of upcomingServices) {
      if (this.shouldSendReminder(service)) {
        await this.initiateOutboundCall({
          phoneNumber: service.customer_phone,
          leadId: service.lead_id,
          callReason: 'service_reminder',
          priority: 'high',
          serviceDetails: {
            service_type: service.service_type,
            appointment_date: service.appointment_date,
            location: service.location
          }
        });
        
        // Mark reminder as sent
        await this.markReminderSent(service.id);
      }
    }
  }
}
```

### **5. Advanced Client Tools for Dashboard Integration**

#### **A. Real-Time Dashboard Client Tools**
```javascript
// Client tools for real-time dashboard interactions
const dashboardClientTools = [
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
        description: "Display action: show, highlight, update",
        required: true
      }
    },
    implementation: async (customerData, action) => {
      // Update customer panel in real-time
      const updateEvent = {
        type: 'customer_display_update',
        customer_data: customerData,
        action: action,
        timestamp: new Date().toISOString()
      };
      
      // Broadcast to connected dashboard clients
      broadcastToDashboard(updateEvent);
      
      return {
        success: true,
        message: `Customer display ${action} completed`
      };
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
    },
    implementation: async (products, reason) => {
      const recommendationEvent = {
        type: 'product_recommendation',
        products: products,
        reason: reason,
        timestamp: new Date().toISOString()
      };
      
      broadcastToDashboard(recommendationEvent);
      
      return {
        success: true,
        products_shown: products.length,
        message: 'Product recommendations displayed'
      };
    }
  },
  
  {
    name: "trigger_follow_up_action",
    description: "Schedule automated follow-up actions",
    parameters: {
      action_type: {
        type: "string",
        description: "Type of follow-up: email, sms, call, appointment_reminder",
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
    },
    implementation: async (actionType, delayMinutes, messageTemplate) => {
      // Schedule follow-up action
      const followUpId = await scheduleFollowUpAction({
        action_type: actionType,
        delay_minutes: delayMinutes,
        message_template: messageTemplate,
        organization_id: this.organizationId,
        scheduled_for: new Date(Date.now() + (delayMinutes * 60 * 1000))
      });
      
      return {
        success: true,
        follow_up_id: followUpId,
        message: `${actionType} follow-up scheduled for ${delayMinutes} minutes`
      };
    }
  }
];
```

### **6. Comprehensive Server Tools Configuration**

#### **A. Shopify Integration Server Tools**
```javascript
// Complete Shopify server tools for SOW requirements
const shopifyServerTools = [
  {
    name: "check_order_status",
    description: "Look up customer order status and tracking information",
    method: "GET",
    url: "https://yourdomain.com/api/shopify/orders/lookup",
    authentication: {
      type: "bearer_token",
      token: process.env.SHOPIFY_ACCESS_TOKEN
    },
    parameters: {
      identifier: {
        type: "string",
        description: "Phone number, email, or order number",
        required: true
      },
      identifier_type: {
        type: "string", 
        description: "Type of identifier: phone, email, order_number",
        required: true
      }
    }
  },
  
  {
    name: "check_product_availability",
    description: "Check real-time inventory levels for specific bikes",
    method: "GET",
    url: "https://yourdomain.com/api/shopify/inventory/{product_handle}",
    authentication: {
      type: "bearer_token",
      token: process.env.SHOPIFY_ACCESS_TOKEN
    },
    parameters: {
      product_handle: {
        type: "string",
        description: "Shopify product handle or SKU",
        required: true
      },
      variant_options: {
        type: "object",
        description: "Size, color, or other variant options",
        required: false
      }
    }
  },
  
  {
    name: "get_product_recommendations",
    description: "Get personalized bike recommendations based on customer profile",
    method: "POST",
    url: "https://yourdomain.com/api/recommendations/bikes",
    authentication: {
      type: "bearer_token",
      token: process.env.API_SECRET_TOKEN
    },
    parameters: {
      customer_profile: {
        type: "object",
        description: "Customer preferences and requirements",
        required: true
      },
      budget_range: {
        type: "object",
        description: "Min and max budget",
        required: false
      }
    }
  }
];
```

### **7. Bilingual Support Implementation (SOW Requirement)**

#### **A. Advanced Language Detection Configuration**
```javascript
// Enhanced language detection for English/French support (SOW requirement)
const bilingualConfiguration = {
  supported_languages: ["en", "fr"],
  
  // Language-specific agent configurations
  language_configs: {
    "en": {
      system_prompt: `
        You are Bici's AI assistant, a friendly and knowledgeable bike store expert.
        
        ## BIKE EXPERTISE
        - Specializing in road bikes, mountain bikes, e-bikes, and hybrids
        - Expert in bike repairs, maintenance, and accessories
        - Knowledgeable about sizing, fitting, and bike selection
        
        ## YOUR ROLE
        - Help customers find the perfect bike for their needs
        - Provide accurate information about products and services
        - Book appointments and check order status
        - Transfer to human agents when needed
      `,
      
      first_message: "Hi! I'm Bici's AI assistant. How can I help you with your biking needs today?",
      
      vocabulary: {
        "mountain bike": "mountain bike",
        "road bike": "road bike", 
        "e-bike": "electric bike",
        "tune-up": "tune-up",
        "repair": "repair",
        "appointment": "appointment"
      }
    },
    
    "fr": {
      system_prompt: `
        Vous êtes l'assistant IA de Bici, un expert sympathique et compétent en magasin de vélos.
        
        ## EXPERTISE VÉLO
        - Spécialisé dans les vélos de route, vélos de montagne, vélos électriques et hybrides
        - Expert en réparations, entretien et accessoires de vélos
        - Connaisseur du dimensionnement, ajustement et sélection de vélos
        
        ## VOTRE RÔLE
        - Aider les clients à trouver le vélo parfait pour leurs besoins
        - Fournir des informations précises sur les produits et services
        - Réserver des rendez-vous et vérifier le statut des commandes
        - Transférer vers des agents humains si nécessaire
      `,
      
      first_message: "Bonjour! Je suis l'assistant IA de Bici. Comment puis-je vous aider avec vos besoins de vélo aujourd'hui?",
      
      vocabulary: {
        "mountain bike": "vélo de montagne",
        "road bike": "vélo de route",
        "e-bike": "vélo électrique", 
        "tune-up": "mise au point",
        "repair": "réparation",
        "appointment": "rendez-vous"
      }
    }
  },
  
  // Language detection triggers
  detection_triggers: [
    "User speaks in a different language than current output language",
    "User explicitly requests language change (e.g., 'Can we speak in French?')",
    "User mixes languages indicating preference change"
  ],
  
  // Automatic language switching rules
  auto_switch_rules: {
    confidence_threshold: 0.8,
    fallback_language: "en",
    preserve_context: true
  }
};
```

---

## **🎯 SOW MILESTONE IMPLEMENTATION PLAN**

### **MILESTONE 1: Foundation & Basic AI Agent (Weeks 1-2 | $4,500)**

#### **✅ Core Development Requirements:**

**1. ElevenLabs Setup with Bike Store Knowledge Base**
```javascript
// Knowledge base content for bike store (SOW requirement)
const knowledgeBaseFiles = [
  // Store policies and information
  "store-hours-locations-policies.md",
  "return-exchange-warranty-policies.pdf", 
  "contact-information-directions.txt",
  
  // Product catalogs and specifications
  "bike-catalog-2024-complete.pdf",
  "electric-bikes-specifications.pdf",
  "accessories-catalog.pdf",
  "sizing-guide-comprehensive.pdf",
  
  // Service information
  "repair-services-pricing.pdf",
  "tune-up-maintenance-packages.pdf",
  "appointment-types-duration.md",
  
  // FAQ and common questions
  "frequently-asked-questions.md",
  "bike-selection-guide.pdf",
  "maintenance-tips-seasonal.md"
];

// RAG configuration for optimal knowledge retrieval
const ragConfig = {
  enabled: true,
  embedding_model: "text-embedding-3-small",
  chunk_size: 800,
  overlap: 150,
  retrieval_count: 5,
  usage_mode: "auto",
  similarity_threshold: 0.7
};
```

**2. Twilio Inbound Call Routing with WebSocket Integration**
```javascript
// Native Twilio integration with ElevenLabs personalization
const twilioConfiguration = {
  // Twilio phone number setup
  phone_number: process.env.TWILIO_PHONE_NUMBER,
  account_sid: process.env.TWILIO_ACCOUNT_SID,
  auth_token: process.env.TWILIO_AUTH_TOKEN,
  
  // ElevenLabs native integration
  elevenlabs_integration: {
    agent_id: process.env.ELEVENLABS_AGENT_ID,
    phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
    
    // Webhook for personalization (SOW requirement)
    personalization_webhook: "https://yourdomain.com/api/webhooks/elevenlabs/twilio-personalization"
  }
};

// Personalization webhook implementation
app.post('/api/webhooks/elevenlabs/twilio-personalization', async (req, res) => {
  const { caller_id, called_number, agent_id, call_sid } = req.body;
  
  // Get organization from called number
  const organization = await getOrganizationByPhoneNumber(called_number);
  
  // Look up customer data for context
  const customerData = await lookupCustomer(caller_id, organization.id);
  
  // Build dynamic variables for personalization
  const dynamicVariables = {
    customer_name: customerData?.name || "Valued Customer",
    customer_phone: caller_id,
    organization_name: organization.name,
    store_hours: await getCurrentStoreHours(organization.id),
    current_promotions: await getCurrentPromotions(organization.id),
    preferred_language: customerData?.preferred_language || "en"
  };
  
  // Return personalization data
  res.json({
    dynamic_variables: dynamicVariables,
    conversation_config_override: {
      agent: {
        language: customerData?.preferred_language || "en"
      }
    }
  });
});
```

**3. Lead Creation from Caller ID with Conversation Logging**
```javascript
// Multi-tenant database schema (SOW requirement)
const supabaseSchema = `
-- Organizations for multi-tenant architecture
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  settings JSONB DEFAULT '{"timezone": "America/Toronto"}'::jsonb
);

-- Leads with bike-specific fields
CREATE TABLE leads (
  id VARCHAR(255) PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  customer_name VARCHAR(255),
  phone_number_normalized VARCHAR(20),
  email VARCHAR(255),
  
  -- Lead qualification (SOW requirement)
  lead_status VARCHAR(50) DEFAULT 'new',
  bike_interest JSONB DEFAULT '{
    "type": null,
    "budget": {"min": 0, "max": 0},
    "usage": null,
    "timeline": null
  }'::jsonb,
  
  contact_preferences JSONB DEFAULT '{"sms": true, "email": true, "call": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Conversation logging (SOW requirement)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  lead_id VARCHAR(255) REFERENCES leads(id),
  phone_number_normalized VARCHAR(20),
  content TEXT NOT NULL,
  sent_by VARCHAR(50) NOT NULL,
  type VARCHAR(20) DEFAULT 'voice',
  elevenlabs_conversation_id VARCHAR(255),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);
`;
```

**4. Basic Response System for Store Hours, Location, Policies**
```javascript
// System tools configuration for basic responses
const basicResponseTools = [
  {
    name: "get_store_information", 
    description: "Get current store hours, location, and basic policies",
    method: "GET",
    url: "https://yourdomain.com/api/store/info",
    parameters: {
      info_type: {
        type: "string",
        description: "Type of information: hours, location, policies, contact",
        required: true
      }
    }
  }
];

// Automated SMS follow-up (SOW requirement)
async function sendAutomatedSMS(phoneNumber, messageType, organizationId) {
  const messageTemplates = {
    store_hours: "Thanks for calling Bici! Our hours are Mon-Fri 9AM-7PM, Sat-Sun 10AM-6PM. Visit us at 123 Main St!",
    directions: "Bici Bike Store is located at 123 Main St, Downtown. Free parking available. Need directions? Maps: https://maps.app.goo.gl/bici",
    follow_up: "Thanks for your interest in our bikes! If you have any questions, don't hesitate to call us back or visit our store."
  };
  
  await sendSMS(phoneNumber, messageTemplates[messageType], organizationId);
}
```

**5. Human Escalation Pathway with Call Transfer**
```javascript
// Human escalation using ElevenLabs transfer-to-human tool
const humanEscalationConfig = {
  system_tool: {
    name: "transfer_to_human",
    enabled: true,
    description: "Transfer call to human agent when AI cannot adequately handle the request",
    
    // Transfer destinations
    transfer_destinations: [
      {
        name: "general_support",
        number: process.env.HUMAN_AGENT_PHONE_1,
        description: "General customer support and sales"
      },
      {
        name: "technical_support", 
        number: process.env.HUMAN_AGENT_PHONE_2,
        description: "Technical bike repair and maintenance questions"
      },
      {
        name: "manager",
        number: process.env.MANAGER_PHONE,
        description: "Manager for complaints and complex issues"
      }
    ]
  },
  
  // Escalation triggers in system prompt
  escalation_criteria: `
## WHEN TO TRANSFER TO HUMAN

Use the transfer_to_human tool when:
1. Customer requests to speak with a human agent
2. Complex technical bike repairs beyond basic troubleshooting  
3. Price negotiations or custom orders over $1,000
4. Complaints about service quality or staff
5. Warranty claims requiring manager approval
6. Any situation where you're uncertain about the correct response

Always provide context to the human agent about the customer's needs.
  `
};
```

**6. Data Capture and Call Classification**
```javascript
// Data collection configuration (SOW requirement)
const dataCollectionConfig = [
  {
    name: "call_classification",
    type: "string",
    description: "Primary reason for call: sales, support, service, complaint, information"
  },
  {
    name: "bike_interest_type", 
    type: "string",
    description: "Type of bike customer is interested in: road, mountain, e-bike, hybrid"
  },
  {
    name: "budget_range",
    type: "string", 
    description: "Customer's budget range in dollars"
  },
  {
    name: "timeline",
    type: "string",
    description: "When customer plans to purchase: immediate, weeks, months"
  },
  {
    name: "contact_preference",
    type: "string",
    description: "How customer prefers to be contacted: phone, email, sms"
  },
  {
    name: "lead_quality_score",
    type: "integer",
    description: "Lead qualification score from 1-100"
  }
];
```

### **MILESTONE 2: Live Data Integration & Customer Recognition (Weeks 3-4 | $5,500)**

#### **✅ Enhanced AI Capabilities:**

**1. Customer Identification via Phone Number Lookup**
```javascript
// Multi-source customer lookup system
async function identifyCustomer(phoneNumber, organizationId) {
  // Primary: Supabase leads table
  let customer = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('phone_number_normalized', normalizePhoneNumber(phoneNumber))
    .single();
    
  if (!customer.data) {
    // Secondary: HubSpot CRM lookup (SOW requirement)
    const hubspotCustomer = await hubspotIntegration.searchContact(null, phoneNumber);
    if (hubspotCustomer.found) {
      // Create lead from HubSpot data
      customer = await createLeadFromHubSpot(hubspotCustomer, organizationId);
    }
  }
  
  if (!customer.data) {
    // Tertiary: Shopify customer lookup
    const shopifyCustomer = await lookupShopifyCustomer(phoneNumber, organizationId);
    if (shopifyCustomer) {
      customer = await createLeadFromShopify(shopifyCustomer, organizationId);
    }
  }
  
  return customer.data;
}
```

**2. Real-Time Agent Dashboard (SOW Requirement)**
```javascript
// WebSocket-powered real-time dashboard
class RealTimeDashboard {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.activeConnections = new Map();
    this.setupWebSocketServer();
  }
  
  setupWebSocketServer() {
    const wss = new WebSocketServer({ port: 8080 });
    
    wss.on('connection', (ws, req) => {
      const sessionId = this.generateSessionId();
      
      // Authenticate connection
      const token = this.extractTokenFromRequest(req);
      const userOrg = this.validateToken(token);
      
      if (userOrg !== this.organizationId) {
        ws.close(4003, 'Unauthorized');
        return;
      }
      
      // Store connection
      this.activeConnections.set(sessionId, {
        ws: ws,
        organizationId: userOrg,
        connectedAt: new Date(),
        subscribedLeads: new Set()
      });
      
      // Send initial dashboard state
      this.sendDashboardState(sessionId);
      
      // Handle messages
      ws.on('message', (message) => {
        this.handleDashboardMessage(sessionId, JSON.parse(message));
      });
      
      // Cleanup on disconnect
      ws.on('close', () => {
        this.activeConnections.delete(sessionId);
      });
    });
  }
  
  // Broadcast real-time updates
  broadcastUpdate(updateData) {
    this.activeConnections.forEach((connection, sessionId) => {
      if (connection.organizationId === this.organizationId) {
        connection.ws.send(JSON.stringify({
          ...updateData,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
}
```

### **MILESTONE 3: Outbound Calling and Human in the Loop (Weeks 5-6 | $4,500)**

#### **✅ Service Appointment System:**

**1. Google Calendar Integration (SOW Requirement)**
```javascript
// Complete calendar integration for service appointments
class ServiceAppointmentSystem {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.calendar = this.initializeGoogleCalendar();
  }
  
  // Server tool: Real-time availability check
  async checkAvailability(serviceType, preferredDate) {
    const calendarId = this.getServiceCalendarId(serviceType);
    const slots = await this.calculateAvailableSlots(calendarId, preferredDate);
    
    return {
      success: true,
      service_type: serviceType,
      available_slots: slots.slice(0, 10),
      next_available: slots[0]?.datetime
    };
  }
  
  // Server tool: Book appointment with automated confirmations
  async bookAppointment(appointmentData) {
    const event = await this.calendar.events.insert({
      calendarId: this.getServiceCalendarId(appointmentData.service_type),
      resource: this.buildCalendarEvent(appointmentData)
    });
    
    // Send automated confirmations (SOW requirement)
    await this.sendAppointmentConfirmations(appointmentData, event.data.id);
    
    return {
      success: true,
      appointment_id: event.data.id,
      confirmation_sent: true
    };
  }
}
```

**2. Human-AI Collaboration (SOW Requirement)**
```javascript
// Seamless agent takeover with full conversation context
class HumanAICollaboration {
  // Human takeover with context preservation
  async initiateHumanTakeover(conversationId, agentName) {
    // Get full conversation context
    const context = await this.getConversationContext(conversationId);
    
    // Use ElevenLabs transfer-to-human tool
    const transferResult = await this.executeTransferToHuman({
      conversation_id: conversationId,
      agent_name: agentName,
      context: context,
      transfer_reason: "Human agent requested control"
    });
    
    // Enable chat interface for human agent
    await this.enableHumanChatInterface(conversationId, agentName);
    
    return transferResult;
  }
  
  // AI resume capability after human intervention
  async resumeAIControl(conversationId) {
    // Add transition message
    await this.addSystemMessage(conversationId, "AI assistant has resumed control");
    
    // Re-establish WebSocket connection with updated context
    const updatedContext = await this.getConversationContext(conversationId);
    await this.resumeElevenLabsConnection(conversationId, updatedContext);
    
    return { success: true, message: "AI control resumed" };
  }
}
```

### **MILESTONE 4: Advanced Features (SOW Scope)**

**1. Bilingual Support (English/French - SOW Requirement)**
- Automatic language detection and switching
- Culturally appropriate responses for Quebec market
- French vocabulary for bike terminology

**2. Product Compatibility Recommendations**
- AI-powered bike matching based on customer profile
- Accessory recommendations
- Size and fit suggestions

**3. Stock Availability via Shopify (SOW Requirement)**
- Real-time inventory checks
- Automated restock notifications
- Cross-sell opportunities

---

## **🚀 DEPLOYMENT & SUCCESS METRICS**

### **SOW Success Criteria:**
- **Handle 2,000+ monthly calls** ✅
- **Reduce human intervention to <50%** ✅ 
- **Capture every interaction as qualified lead** ✅
- **Multi-tenant architecture for future expansion** ✅
- **Real-time dashboard for monitoring** ✅
- **Bilingual support (English/French)** ✅

### **Technical Performance Targets:**
- **Call Response Time**: <2 seconds initial response
- **Context Accuracy**: >95% conversation continuity
- **System Uptime**: 99.9% availability
- **Lead Capture Rate**: 100% of calls logged
- **Human Transfer Success**: >98% successful handoffs

---

## **📋 IMPLEMENTATION CHECKLIST**

### **Week 1-2 (Milestone 1): Foundation**
- [ ] ElevenLabs agent creation with RAG knowledge base
- [ ] Twilio native integration with personalization webhooks  
- [ ] Multi-tenant Supabase database deployment
- [ ] Basic response system for store information
- [ ] Human escalation pathway configuration
- [ ] Call logging and lead creation system

### **Week 3-4 (Milestone 2): Integration**
- [ ] Customer identification system
- [ ] HubSpot CRM integration (SOW requirement)
- [ ] Real-time dashboard with WebSocket streaming
- [ ] Shopify order status integration
- [ ] SMS follow-up automation
- [ ] Context preservation across channels

### **Week 5-6 (Milestone 3): Advanced Features**
- [ ] Google Calendar integration
- [ ] Outbound calling system
- [ ] Service reminder automation
- [ ] Human-AI collaboration tools
- [ ] Performance analytics dashboard

### **Ongoing: Optimization**
- [ ] Bilingual support testing
- [ ] Performance monitoring and tuning
- [ ] Knowledge base updates
- [ ] Staff training and documentation

This comprehensive implementation plan ensures full SOW compliance while leveraging all advanced ElevenLabs features for a world-class bike store AI assistant system.