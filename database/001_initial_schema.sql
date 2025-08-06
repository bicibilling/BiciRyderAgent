-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (Multi-tenant support)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{
    "business_hours": {
      "monday": "9:00-18:00",
      "tuesday": "9:00-18:00",
      "wednesday": "9:00-18:00",
      "thursday": "9:00-20:00",
      "friday": "9:00-20:00",
      "saturday": "10:00-17:00",
      "sunday": "closed"
    },
    "location": {
      "address": "123 Bike Street, Montreal, QC H2X 1Y7",
      "coordinates": {"lat": 45.5017, "lng": -73.5673}
    },
    "services": ["sales", "repairs", "rentals", "fitting", "custom_builds"]
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Leads table with bike-specific fields
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'new', -- new, contacted, qualified, hot, customer, closed
  sentiment VARCHAR(50) DEFAULT 'neutral', -- positive, neutral, negative
  bike_interest JSONB DEFAULT '{
    "type": null,
    "budget": {"min": 0, "max": 0},
    "usage": null,
    "size": null,
    "brand_preference": null
  }'::jsonb,
  qualification_data JSONB DEFAULT '{
    "ready_to_buy": false,
    "timeline": null,
    "contact_preference": "phone",
    "purchase_intent": 0
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_contact_at TIMESTAMPTZ,
  assigned_to VARCHAR(255),
  notes TEXT,
  UNIQUE(organization_id, phone_normalized)
);

-- Conversations table with classification
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  elevenlabs_conversation_id VARCHAR(255),
  phone_number VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  sent_by VARCHAR(50) NOT NULL, -- 'user', 'agent', 'human_agent', 'system'
  type VARCHAR(20) DEFAULT 'text', -- 'text', 'voice', 'sms'
  classification VARCHAR(50), -- 'sales', 'support', 'service', 'general'
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  message_sid VARCHAR(255)
);

-- Call Sessions table
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  elevenlabs_conversation_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'initiated', -- 'initiated', 'active', 'completed', 'failed', 'transferred'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript TEXT,
  summary TEXT,
  classification VARCHAR(50),
  escalated_to_human BOOLEAN DEFAULT false,
  escalation_reason VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Conversation Summaries table
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  phone_number VARCHAR(20) NOT NULL,
  summary TEXT NOT NULL,
  key_points TEXT[],
  next_steps TEXT[],
  sentiment_score DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Human Control Sessions table
CREATE TABLE IF NOT EXISTS human_control_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  agent_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  messages_handled INTEGER DEFAULT 0,
  reason VARCHAR(255),
  notes TEXT
);

-- SMS Automation Log table
CREATE TABLE IF NOT EXISTS sms_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  phone_number VARCHAR(20) NOT NULL,
  template_type VARCHAR(50) NOT NULL, -- 'store_hours', 'appointment_confirmation', 'directions', 'follow_up'
  message_content TEXT NOT NULL,
  trigger_reason VARCHAR(255),
  sent_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
  message_sid VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX idx_leads_phone ON leads(phone_normalized);
CREATE INDEX idx_leads_org ON leads(organization_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX idx_call_sessions_lead ON call_sessions(lead_id);
CREATE INDEX idx_call_sessions_status ON call_sessions(status);

-- Row Level Security (RLS) - Enable after creating auth
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_control_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_automation_log ENABLE ROW LEVEL SECURITY;

-- Insert default organization for BICI
INSERT INTO organizations (id, name, phone_number) 
VALUES (
  'b0c1b1c1-0000-0000-0000-000000000001',
  'BICI Bike Store',
  '+15145551234'
) ON CONFLICT DO NOTHING;