-- =============================================
-- BICI AI VOICE SYSTEM - SUPABASE DATABASE SCHEMA
-- Multi-tenant architecture for bike store system
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- ORGANIZATIONS TABLE (Multi-tenant Support)
-- =============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE,
  domain VARCHAR(100),
  
  -- Business Information
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(50),
  postal_code VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'America/Toronto',
  
  -- Configuration
  settings JSONB DEFAULT '{
    "timezone": "America/Toronto",
    "default_language": "en",
    "business_hours": {
      "weekdays": {"open": "09:00", "close": "19:00"},
      "weekends": {"open": "10:00", "close": "18:00"}
    },
    "features": {
      "sms_automation": true,
      "outbound_calling": true,
      "bilingual_support": true,
      "appointment_booking": true
    }
  }'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_phone_format CHECK (phone_number ~ '^\+[1-9]\d{1,14}$')
);

-- =============================================
-- LEADS TABLE (Customer Management)
-- =============================================

CREATE TABLE leads (
  id VARCHAR(255) PRIMARY KEY, -- Custom ID format: org_phone_timestamp
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Customer Information
  customer_name VARCHAR(255),
  phone_number_normalized VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  
  -- Lead Qualification (SOW Requirement)
  lead_status VARCHAR(50) DEFAULT 'new' CHECK (lead_status IN (
    'new', 'contacted', 'qualified', 'converted', 'lost', 'follow_up'
  )),
  lead_source VARCHAR(100) DEFAULT 'inbound_call',
  lead_quality_score INTEGER DEFAULT 0 CHECK (lead_quality_score >= 0 AND lead_quality_score <= 100),
  
  -- Bike Interest Information
  bike_interest JSONB DEFAULT '{
    "type": null,
    "budget": {"min": 0, "max": 0},
    "usage": null,
    "timeline": null,
    "size_preferences": null,
    "previous_bikes": []
  }'::jsonb,
  
  -- Purchase History
  purchase_history JSONB DEFAULT '[]'::jsonb,
  
  -- Communication Preferences
  contact_preferences JSONB DEFAULT '{
    "sms": true,
    "email": true,
    "call": true,
    "preferred_time": "business_hours",
    "language": "en"
  }'::jsonb,
  
  -- Conversation Context
  interaction_count INTEGER DEFAULT 0,
  last_contact_date TIMESTAMP WITH TIME ZONE,
  previous_summary TEXT,
  customer_tier VARCHAR(50) DEFAULT 'Regular',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes
  UNIQUE(organization_id, phone_number_normalized)
);

-- =============================================
-- CONVERSATIONS TABLE (Call Logging)
-- =============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Call Information
  elevenlabs_conversation_id VARCHAR(255),
  twilio_call_sid VARCHAR(255),
  phone_number_normalized VARCHAR(20) NOT NULL,
  
  -- Conversation Content
  content TEXT NOT NULL,
  sent_by VARCHAR(50) NOT NULL CHECK (sent_by IN ('user', 'agent', 'system')),
  type VARCHAR(20) DEFAULT 'voice' CHECK (type IN ('voice', 'sms', 'email', 'system')),
  
  -- Call Classification (SOW Requirement)
  call_classification VARCHAR(100),
  call_direction VARCHAR(20) DEFAULT 'inbound' CHECK (call_direction IN ('inbound', 'outbound')),
  call_duration INTEGER, -- in seconds
  call_status VARCHAR(50),
  
  -- Quality Metrics
  confidence_score FLOAT DEFAULT 1.0,
  sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  
  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
);

-- =============================================
-- CONVERSATION_TRANSCRIPTS TABLE (Detailed Logging)
-- =============================================

CREATE TABLE conversation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  elevenlabs_conversation_id VARCHAR(255),
  
  -- Transcript Content
  speaker VARCHAR(20) NOT NULL CHECK (speaker IN ('user', 'agent')),
  text TEXT NOT NULL,
  confidence_score FLOAT DEFAULT 1.0,
  
  -- Timing Information
  start_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  duration_ms INTEGER,
  
  -- Audio Information
  audio_url TEXT,
  sample_rate INTEGER DEFAULT 16000,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Indexes
  INDEX idx_transcripts_conversation (conversation_id),
  INDEX idx_transcripts_elevenlabs (elevenlabs_conversation_id)
);

-- =============================================
-- APPOINTMENTS TABLE (Calendar Integration)
-- =============================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Appointment Details
  google_event_id VARCHAR(255),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255),
  
  -- Service Information
  service_type VARCHAR(100) NOT NULL,
  appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location VARCHAR(255),
  notes TEXT,
  
  -- Status Management
  status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN (
    'confirmed', 'pending', 'completed', 'cancelled', 'no_show'
  )),
  reminder_sent BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes
  INDEX idx_appointments_org (organization_id),
  INDEX idx_appointments_datetime (appointment_datetime),
  INDEX idx_appointments_status (status)
);

-- =============================================
-- SMS_MESSAGES TABLE (SMS Automation)
-- =============================================

CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Message Information
  twilio_message_sid VARCHAR(255),
  phone_number_normalized VARCHAR(20) NOT NULL,
  message_body TEXT NOT NULL,
  
  -- Message Type and Status
  message_type VARCHAR(50) DEFAULT 'manual' CHECK (message_type IN (
    'manual', 'follow_up', 'appointment_reminder', 'missed_call', 'promotional'
  )),
  status VARCHAR(50) DEFAULT 'queued' CHECK (status IN (
    'queued', 'sent', 'delivered', 'failed', 'undelivered'
  )),
  direction VARCHAR(20) DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  
  -- Automation Information
  template_id VARCHAR(100),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Cost Tracking
  cost_units INTEGER DEFAULT 1,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Indexes
  INDEX idx_sms_org_phone (organization_id, phone_number_normalized),
  INDEX idx_sms_status (status),
  INDEX idx_sms_scheduled (scheduled_for)
);

-- =============================================
-- OUTBOUND_CALLS TABLE (Call Management)
-- =============================================

CREATE TABLE outbound_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Call Information
  elevenlabs_conversation_id VARCHAR(255),
  twilio_call_sid VARCHAR(255),
  phone_number VARCHAR(20) NOT NULL,
  
  -- Call Purpose
  call_reason VARCHAR(100) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE,
  initiated_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Status and Results
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'initiated', 'in_progress', 'completed', 'failed', 'cancelled'
  )),
  call_duration INTEGER, -- in seconds
  result VARCHAR(100),
  
  -- Retry Management
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- Context
  call_context JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes
  INDEX idx_outbound_org (organization_id),
  INDEX idx_outbound_status (status),
  INDEX idx_outbound_scheduled (scheduled_for)
);

-- =============================================
-- PHONE_NUMBERS TABLE (Number Management)
-- =============================================

CREATE TABLE phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Number Information
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  twilio_phone_number_sid VARCHAR(255),
  elevenlabs_phone_number_id VARCHAR(255),
  
  -- Configuration
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{
    "voice": true,
    "sms": true,
    "mms": false
  }'::jsonb,
  
  -- Usage Tracking
  monthly_call_count INTEGER DEFAULT 0,
  monthly_sms_count INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  
  -- Webhook URLs
  voice_webhook_url TEXT,
  sms_webhook_url TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure only one primary number per organization
  UNIQUE(organization_id, is_primary) WHERE is_primary = true
);

-- =============================================
-- ANALYTICS_EVENTS TABLE (Performance Tracking)
-- =============================================

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Event Information
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Context
  conversation_id UUID,
  lead_id VARCHAR(255),
  phone_number VARCHAR(20),
  
  -- Metrics
  duration_ms INTEGER,
  success BOOLEAN,
  error_message TEXT,
  
  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_agent TEXT,
  ip_address INET,
  
  -- Indexes for analytics queries
  INDEX idx_analytics_org_type (organization_id, event_type),
  INDEX idx_analytics_timestamp (timestamp DESC),
  INDEX idx_analytics_category (event_category)
);

-- =============================================
-- WEBHOOK_LOGS TABLE (Debugging and Monitoring)
-- =============================================

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Webhook Information
  webhook_type VARCHAR(50) NOT NULL,
  webhook_source VARCHAR(50) NOT NULL, -- 'twilio', 'elevenlabs', 'shopify', etc.
  
  -- Request Information
  method VARCHAR(10) NOT NULL,
  url TEXT NOT NULL,
  headers JSONB,
  body JSONB,
  
  -- Response Information
  response_status INTEGER,
  response_body JSONB,
  processing_time_ms INTEGER,
  
  -- Error Handling
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes
  INDEX idx_webhook_logs_org (organization_id),
  INDEX idx_webhook_logs_timestamp (timestamp DESC),
  INDEX idx_webhook_logs_source (webhook_source)
);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for multi-tenant access
-- Organizations: Users can only access their own organization
CREATE POLICY "Users can access their own organization" ON organizations
  FOR ALL USING (auth.uid()::text = id::text OR auth.jwt() ->> 'organization_id' = id::text);

-- All other tables: Filter by organization_id
CREATE POLICY "Tenant isolation" ON leads
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON conversations
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON conversation_transcripts
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE organization_id::text = auth.jwt() ->> 'organization_id'
    )
  );

CREATE POLICY "Tenant isolation" ON appointments
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON sms_messages
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON outbound_calls
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON phone_numbers
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON analytics_events
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

CREATE POLICY "Tenant isolation" ON webhook_logs
  FOR ALL USING (organization_id::text = auth.jwt() ->> 'organization_id');

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outbound_calls_updated_at BEFORE UPDATE ON outbound_calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate lead ID
CREATE OR REPLACE FUNCTION generate_lead_id(org_id UUID, phone VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN CONCAT(
    SUBSTRING(org_id::text, 1, 8), '_',
    REPLACE(phone, '+', ''), '_',
    EXTRACT(epoch FROM now())::bigint
  );
END;
$$ LANGUAGE plpgsql;

-- Function to normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone_number(phone VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  -- Remove all non-digit characters except +
  phone := regexp_replace(phone, '[^\d+]', '', 'g');
  
  -- Add + if missing and starts with 1 (North American numbers)
  IF phone ~ '^\d' AND LENGTH(phone) = 11 AND LEFT(phone, 1) = '1' THEN
    phone := '+' || phone;
  ELSIF phone ~ '^\d' AND LENGTH(phone) = 10 THEN
    phone := '+1' || phone;
  END IF;
  
  RETURN phone;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- INITIAL DATA SETUP
-- =============================================

-- Insert default organization (BICI Bike Store)
INSERT INTO organizations (
  id,
  name,
  phone_number,
  address,
  city,
  province,
  postal_code,
  settings
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'BICI Bike Store',
  '+14165551234',
  '123 Main Street, Downtown',
  'Toronto',
  'ON',
  'M5V 3A8',
  '{
    "timezone": "America/Toronto",
    "default_language": "en",
    "business_hours": {
      "weekdays": {"open": "09:00", "close": "19:00"},
      "weekends": {"open": "10:00", "close": "18:00"}
    },
    "features": {
      "sms_automation": true,
      "outbound_calling": true,
      "bilingual_support": true,
      "appointment_booking": true
    }
  }'
) ON CONFLICT (id) DO NOTHING;

-- Insert default admin user
-- Note: Password is 'BiciAI2024!' - should be changed in production
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'admin@bici.com',
  crypt('BiciAI2024!', gen_salt('bf')),
  now(),
  now(),
  now(),
  jsonb_build_object(
    'organizationId', '00000000-0000-0000-0000-000000000001',
    'role', 'admin',
    'permissions', '["*"]'
  )
) ON CONFLICT (email) DO NOTHING;

-- Create indexes for optimal query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_phone_org ON leads(phone_number_normalized, organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_recent ON conversations(organization_id, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_phone ON conversations(organization_id, phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_classification ON conversations(call_classification);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_pending ON sms_messages(status, scheduled_for) WHERE status = 'queued';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbound_pending ON outbound_calls(status, scheduled_for) WHERE status = 'pending';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;