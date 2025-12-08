export interface Lead {
  id: string;
  organization_id: string;
  phone_number: string;
  phone_normalized: string;
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
  created_at: string;
  updated_at: string;
  last_contact_at?: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  lead_id: string;
  phone_number: string;
  content: string;
  sent_by: 'user' | 'agent' | 'human_agent' | 'system';
  type: 'text' | 'voice' | 'sms';
  classification?: 'sales' | 'support' | 'service' | 'general';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface CallSession {
  id: string;
  organization_id: string;
  lead_id: string;
  elevenlabs_conversation_id?: string;
  status: 'initiated' | 'active' | 'completed' | 'failed' | 'transferred';
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  transcript?: string;
  summary?: string;
  classification?: string;
  escalated_to_human: boolean;
}

export interface DashboardStats {
  total_leads: number;
  total_calls: number;
  total_conversations: number;
  active_sessions: number;
}