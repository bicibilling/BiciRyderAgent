// Type definitions for the BICI Voice Agent system

export interface Organization {
  id: string;
  name: string;
  phone_number: string;
  settings: {
    business_hours: Record<string, { open: string; close: string }>;
    location: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    services: string[];
  };
}

export interface Lead {
  id: string;
  organization_id: string;
  phone_number: string;
  phone_number_normalized: string;
  customer_name?: string;
  email?: string;
  status: 'new' | 'contacted' | 'qualified' | 'hot' | 'customer' | 'closed';
  sentiment: 'positive' | 'neutral' | 'negative';
  bike_interest: {
    type?: 'road' | 'mountain' | 'hybrid' | 'e-bike';
    budget?: { min: number; max: number };
    usage?: string;
    size?: string;
    brand_preference?: string;
  };
  qualification_data: {
    ready_to_buy: boolean;
    timeline?: string;
    contact_preference: 'phone' | 'sms' | 'email';
    purchase_intent: number;
  };
  created_at: Date;
  updated_at: Date;
  last_contact_at?: Date;
}

export interface Conversation {
  id: string;
  organization_id: string;
  lead_id?: string; // Make optional since some voice calls might not have lead_id
  phone_number?: string; // Make optional to match actual usage
  phone_number_normalized?: string;
  content: string;
  sent_by: 'user' | 'agent' | 'human_agent' | 'system';
  type: 'voice' | 'sms';  // Database only allows 'voice' or 'sms', not 'text'
  classification?: 'sales' | 'support' | 'service' | 'general';
  call_classification?: 'sales' | 'support' | 'service' | 'general' | 'live';
  timestamp?: Date; // Make optional since it's auto-generated
  metadata?: Record<string, any>;
}

export interface CallSession {
  id: string;
  organization_id: string;
  lead_id: string;
  elevenlabs_conversation_id?: string;
  status: 'initiated' | 'active' | 'completed' | 'failed' | 'transferred';
  started_at: Date;
  ended_at?: Date;
  duration_seconds?: number;
  call_type?: 'inbound' | 'outbound';
  metadata?: Record<string, any>;
}

export interface ElevenLabsDynamicVariables {
  conversation_context: string;
  previous_summary: string;
  customer_name: string;
  customer_phone: string;
  lead_status: string;
  bike_interest: string;
  organization_name: string;
  organization_id: string;
  location_address: string;
  business_hours: string;
  has_customer_name?: string;
  call_reason?: string;
  last_interaction_date?: string;
  last_interaction_summary?: string;
}

export interface ConversationInsights {
  classification: 'sales' | 'support' | 'service' | 'general';
  triggers: string[];
  bikePreferences?: any;
  qualification?: any;
  leadStatus: string;
  keyPoints: string[];
  nextSteps: string[];
  appointmentScheduled?: boolean;
  appointmentDetails?: any;
  purchaseIntent?: number;
  sentiment?: number;
  customerName?: string;
  clearCustomerName?: boolean;  // Flag to clear incorrect customer name
  ridingExperience?: string;
  purchaseTimeline?: string;
  budgetRange?: string;
}