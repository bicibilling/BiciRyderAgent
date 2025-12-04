-- ============================================
-- CLIENT SUPABASE SCHEMA FOR RYDER AGENT
-- Execute this in Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/acrhhjpqnbwsptbmvubr/sql/new
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE,
  domain VARCHAR(255),
  address TEXT,
  city VARCHAR(255),
  province VARCHAR(255),
  postal_code VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'America/Vancouver',
  settings JSONB DEFAULT '{"business_hours": {"weekdays": {"open": "08:00", "close": "18:00"}, "weekends": {"open": "09:00", "close": "16:30"}}, "features": {"sms_automation": true, "outbound_calling": true, "bilingual_support": true, "appointment_booking": true}, "default_language": "en"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number VARCHAR(20),
  phone_number_normalized VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  email VARCHAR(255),
  lead_status VARCHAR(50) DEFAULT 'new',
  lead_source VARCHAR(50) DEFAULT 'inbound_call',
  lead_quality_score INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'new',
  sentiment VARCHAR(50) DEFAULT 'neutral',
  bike_interest JSONB DEFAULT '{"type": null, "budget": {"min": 0, "max": 0}, "usage": null, "timeline": null, "previous_bikes": [], "size_preferences": null}'::jsonb,
  purchase_history JSONB DEFAULT '[]'::jsonb,
  contact_preferences JSONB DEFAULT '{"sms": true, "call": true, "email": true, "language": "en", "preferred_time": "business_hours"}'::jsonb,
  qualification_data JSONB DEFAULT '{"timeline": null, "ready_to_buy": false, "purchase_intent": 0, "contact_preference": "phone"}'::jsonb,
  interaction_count INTEGER DEFAULT 0,
  last_contact_date TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  previous_summary TEXT,
  customer_tier VARCHAR(50) DEFAULT 'Regular',
  assigned_to VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  elevenlabs_conversation_id VARCHAR(255),
  twilio_call_sid VARCHAR(255),
  phone_number_normalized VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  sent_by VARCHAR(50) NOT NULL,
  type VARCHAR(20) DEFAULT 'voice',
  call_classification VARCHAR(50),
  call_direction VARCHAR(20) DEFAULT 'inbound',
  call_duration INTEGER,
  call_status VARCHAR(50),
  confidence_score DOUBLE PRECISION DEFAULT 1.0,
  sentiment VARCHAR(50) DEFAULT 'neutral',
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
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  elevenlabs_conversation_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'initiated',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  call_type VARCHAR(20) DEFAULT 'inbound',
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
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  summary TEXT NOT NULL,
  key_points TEXT[],
  next_steps TEXT[],
  sentiment_score DECIMAL(3,2) DEFAULT 0.5,
  call_classification VARCHAR(50),
  conversation_type TEXT DEFAULT 'voice',
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Human Control Sessions table
CREATE TABLE IF NOT EXISTS human_control_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active',
  queued_messages JSONB DEFAULT '[]'::jsonb,
  messages_handled INTEGER DEFAULT 0,
  reason VARCHAR(255),
  notes TEXT
);

-- SMS Automation Log table
CREATE TABLE IF NOT EXISTS sms_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  trigger_event VARCHAR(50) NOT NULL,
  message_template VARCHAR(255),
  message_content TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'sent',
  twilio_message_sid VARCHAR(255),
  error_message TEXT
);

-- Phone Numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  twilio_phone_number_sid VARCHAR(255),
  elevenlabs_phone_number_id VARCHAR(255),
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{"mms": false, "sms": true, "voice": true}'::jsonb,
  monthly_call_count INTEGER DEFAULT 0,
  monthly_sms_count INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  voice_webhook_url TEXT,
  sms_webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead ON call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_elevenlabs ON call_sessions(elevenlabs_conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_lead ON conversation_summaries(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_phone ON conversation_summaries(phone_number);

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_control_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_automation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for service role access (allows all operations with service role key)
CREATE POLICY "Service role full access organizations" ON organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access leads" ON leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access call_sessions" ON call_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access conversation_summaries" ON conversation_summaries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access human_control_sessions" ON human_control_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sms_automation_log" ON sms_automation_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access phone_numbers" ON phone_numbers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert default organization
INSERT INTO organizations (id, name, phone_number, timezone, settings)
VALUES (
  'b0c1b1c1-0000-0000-0000-000000000001',
  'Beechee Bike Store',
  '+17786509966',
  'America/Vancouver',
  '{"business_hours": {"weekdays": {"open": "08:00", "close": "18:00"}, "weekends": {"open": "09:00", "close": "16:30"}}, "features": {"sms_automation": true, "outbound_calling": true}, "default_language": "en"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  phone_number = EXCLUDED.phone_number,
  name = EXCLUDED.name;

-- Insert phone number record
INSERT INTO phone_numbers (organization_id, phone_number, elevenlabs_phone_number_id, is_primary, is_active)
VALUES (
  'b0c1b1c1-0000-0000-0000-000000000001',
  '+17786509966',
  'phnum_0301kavys8hde3m969326wpcsaqx',
  true,
  true
) ON CONFLICT (phone_number) DO UPDATE SET
  elevenlabs_phone_number_id = EXCLUDED.elevenlabs_phone_number_id;
