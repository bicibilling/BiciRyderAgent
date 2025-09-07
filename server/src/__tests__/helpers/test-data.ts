/**
 * Test Data Factory
 * Provides consistent test data for all test suites
 */

export const TEST_ORGANIZATIONS = {
  DEFAULT: {
    id: 'b0c1b1c1-0000-0000-0000-000000000001',
    name: 'Test Bike Store',
    phone_number: '+17786528784',
    settings: {
      business_hours: {
        timezone: 'America/Los_Angeles',
        monday: { open: '09:00', close: '18:00', closed: false },
        tuesday: { open: '09:00', close: '18:00', closed: false },
        wednesday: { open: '09:00', close: '18:00', closed: false },
        thursday: { open: '09:00', close: '18:00', closed: false },
        friday: { open: '09:00', close: '18:00', closed: false },
        saturday: { open: '10:00', close: '17:00', closed: false },
        sunday: { closed: true }
      }
    }
  }
};

export const TEST_LEADS = {
  NEW_CUSTOMER: {
    id: 'lead-new-001',
    phone_number: '+17781234567',
    organization_id: TEST_ORGANIZATIONS.DEFAULT.id,
    customer_name: null,
    bike_interest: null,
    previous_summary: '',
    sentiment: 'neutral' as const,
    lead_temperature: 'cold' as const,
    conversation_count: 0,
    last_contact_at: new Date().toISOString()
  },
  
  RETURNING_CUSTOMER: {
    id: 'lead-returning-001',
    phone_number: '+17789876543',
    organization_id: TEST_ORGANIZATIONS.DEFAULT.id,
    customer_name: 'John Smith',
    bike_interest: { type: 'mountain', budget: '1500-3000', experience: 'intermediate' },
    previous_summary: 'Interested in mountain bikes, budget around $2000',
    sentiment: 'positive' as const,
    lead_temperature: 'warm' as const,
    conversation_count: 3,
    last_contact_at: new Date().toISOString()
  },
  
  VIP_CUSTOMER: {
    id: 'lead-vip-001',
    phone_number: '+17785551234',
    organization_id: TEST_ORGANIZATIONS.DEFAULT.id,
    customer_name: 'Sarah Johnson',
    bike_interest: { type: 'road', budget: '3000+', experience: 'expert' },
    previous_summary: 'VIP customer, owns multiple bikes, interested in latest carbon road bikes',
    sentiment: 'positive' as const,
    lead_temperature: 'hot' as const,
    conversation_count: 12,
    last_contact_at: new Date().toISOString()
  }
};

export const TEST_CONVERSATIONS = {
  VOICE_CALL: {
    id: 'conv-voice-001',
    lead_id: TEST_LEADS.RETURNING_CUSTOMER.id,
    session_id: 'sess-001',
    type: 'voice' as const,
    content: 'Customer called asking about mountain bike recommendations',
    sender: 'customer' as const,
    created_at: new Date().toISOString()
  },
  
  SMS_MESSAGE: {
    id: 'conv-sms-001',
    lead_id: TEST_LEADS.RETURNING_CUSTOMER.id,
    session_id: 'sess-002',
    type: 'sms' as const,
    content: 'Hi, do you have any mountain bikes in stock?',
    sender: 'customer' as const,
    created_at: new Date().toISOString()
  },
  
  AGENT_RESPONSE: {
    id: 'conv-agent-001',
    lead_id: TEST_LEADS.RETURNING_CUSTOMER.id,
    session_id: 'sess-001',
    type: 'voice' as const,
    content: 'Yes, we have several great mountain bikes in your price range. Would you like to schedule a visit?',
    sender: 'agent' as const,
    created_at: new Date().toISOString()
  }
};

export const TEST_CALL_SESSIONS = {
  ACTIVE_VOICE: {
    id: 'sess-voice-active',
    lead_id: TEST_LEADS.RETURNING_CUSTOMER.id,
    conversation_id: 'conv-elevenlabs-001',
    type: 'voice' as const,
    status: 'active' as const,
    started_at: new Date().toISOString(),
    metadata: {
      phone_number: TEST_LEADS.RETURNING_CUSTOMER.phone_number,
      agent_id: 'agent_2001k4e6157ce3rv5scqjb1a80q2'
    }
  },
  
  COMPLETED_SMS: {
    id: 'sess-sms-completed',
    lead_id: TEST_LEADS.RETURNING_CUSTOMER.id,
    conversation_id: 'conv-elevenlabs-002',
    type: 'sms' as const,
    status: 'completed' as const,
    started_at: new Date(Date.now() - 600000).toISOString(), // 10 mins ago
    ended_at: new Date().toISOString(),
    metadata: {
      phone_number: TEST_LEADS.RETURNING_CUSTOMER.phone_number,
      agent_id: 'agent_2001k4e6157ce3rv5scqjb1a80q2',
      message_count: 5
    }
  }
};

export const TEST_CONTEXT_DATA = {
  CONVERSATION_CONTEXT: {
    customer_context: {
      name: TEST_LEADS.RETURNING_CUSTOMER.customer_name,
      phone: TEST_LEADS.RETURNING_CUSTOMER.phone_number,
      conversation_count: TEST_LEADS.RETURNING_CUSTOMER.conversation_count,
      sentiment: TEST_LEADS.RETURNING_CUSTOMER.sentiment,
      bike_interest: TEST_LEADS.RETURNING_CUSTOMER.bike_interest,
      previous_summary: TEST_LEADS.RETURNING_CUSTOMER.previous_summary
    },
    business_context: {
      store_name: TEST_ORGANIZATIONS.DEFAULT.name,
      current_time: new Date().toISOString(),
      day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      business_hours: TEST_ORGANIZATIONS.DEFAULT.settings.business_hours
    },
    conversation_history: [
      {
        type: 'voice',
        summary: 'Customer inquired about mountain bikes, budget $2000',
        sentiment: 'positive',
        created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
      }
    ]
  },
  
  DYNAMIC_GREETING: {
    dynamic_greeting: "Thanks for calling back, John! I remember you were interested in mountain bikes around $2000. How can I help you today?",
    customer_name: TEST_LEADS.RETURNING_CUSTOMER.customer_name,
    customer_tier: 'returning',
    bike_interest: 'mountain',
    conversation_count: '3'
  }
};

// Helper functions for generating test data
export function createTestLead(overrides: Partial<typeof TEST_LEADS.NEW_CUSTOMER> = {}) {
  return {
    ...TEST_LEADS.NEW_CUSTOMER,
    ...overrides,
    id: `test-lead-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function createTestConversation(leadId: string, overrides: Partial<typeof TEST_CONVERSATIONS.VOICE_CALL> = {}) {
  return {
    ...TEST_CONVERSATIONS.VOICE_CALL,
    ...overrides,
    id: `test-conv-${Date.now()}`,
    lead_id: leadId,
    created_at: new Date().toISOString()
  };
}

export function createTestCallSession(leadId: string, overrides: Partial<typeof TEST_CALL_SESSIONS.ACTIVE_VOICE> = {}) {
  return {
    ...TEST_CALL_SESSIONS.ACTIVE_VOICE,
    ...overrides,
    id: `test-session-${Date.now()}`,
    lead_id: leadId,
    started_at: new Date().toISOString()
  };
}