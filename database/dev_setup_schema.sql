-- BICI Development Database Schema
-- Complete schema for development environment setup
-- Run this in your development Supabase project

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
  message_sid VARCHAR(255),
  is_leaving_message BOOLEAN DEFAULT false,
  customer_message_text TEXT
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead ON call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);

-- Enable Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_control_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_automation_log ENABLE ROW LEVEL SECURITY;

-- Insert default development organization
INSERT INTO organizations (id, name, phone_number)
VALUES (
  'b0c1b1c1-0000-0000-0000-000000000001',
  'BICI Bike Store (Development)',
  '+17786528784'
) ON CONFLICT (id) DO UPDATE SET
  phone_number = EXCLUDED.phone_number,
  name = EXCLUDED.name;

-- Create basic RLS policies for development (adjust as needed)
-- Note: In production, you'll want more restrictive policies

-- Organizations policies
DROP POLICY IF EXISTS "Allow full access to organizations" ON organizations;
CREATE POLICY "Allow full access to organizations" ON organizations
  FOR ALL USING (true);

-- Leads policies
DROP POLICY IF EXISTS "Allow full access to leads" ON leads;
CREATE POLICY "Allow full access to leads" ON leads
  FOR ALL USING (true);

-- Conversations policies
DROP POLICY IF EXISTS "Allow full access to conversations" ON conversations;
CREATE POLICY "Allow full access to conversations" ON conversations
  FOR ALL USING (true);

-- Call sessions policies
DROP POLICY IF EXISTS "Allow full access to call_sessions" ON call_sessions;
CREATE POLICY "Allow full access to call_sessions" ON call_sessions
  FOR ALL USING (true);

-- Conversation summaries policies
DROP POLICY IF EXISTS "Allow full access to conversation_summaries" ON conversation_summaries;
CREATE POLICY "Allow full access to conversation_summaries" ON conversation_summaries
  FOR ALL USING (true);

-- Human control sessions policies
DROP POLICY IF EXISTS "Allow full access to human_control_sessions" ON human_control_sessions;
CREATE POLICY "Allow full access to human_control_sessions" ON human_control_sessions
  FOR ALL USING (true);

-- SMS automation log policies
DROP POLICY IF EXISTS "Allow full access to sms_automation_log" ON sms_automation_log;
CREATE POLICY "Allow full access to sms_automation_log" ON sms_automation_log
  FOR ALL USING (true);

-- Verification query to confirm setup
DO $$
BEGIN
  RAISE NOTICE 'Development database schema setup completed successfully!';
  RAISE NOTICE 'Tables created: organizations, leads, conversations, call_sessions, conversation_summaries, human_control_sessions, sms_automation_log';
  RAISE NOTICE 'Default organization created with ID: b0c1b1c1-0000-0000-0000-000000000001';
  RAISE NOTICE 'RLS enabled on all tables with permissive development policies';
END $$;