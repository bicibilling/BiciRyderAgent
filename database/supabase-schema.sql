-- BICI Bike Store AI System - Supabase Database Schema
-- Multi-tenant architecture for handling 2,000+ monthly calls

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Organizations table for multi-tenant architecture
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  
  -- Store information
  address JSONB DEFAULT '{}'::jsonb,
  store_hours JSONB DEFAULT '{"monday": "9:00-19:00", "tuesday": "9:00-19:00", "wednesday": "9:00-19:00", "thursday": "9:00-19:00", "friday": "9:00-19:00", "saturday": "10:00-18:00", "sunday": "10:00-18:00"}'::jsonb,
  timezone VARCHAR(50) DEFAULT 'America/Toronto',
  
  -- Configuration
  settings JSONB DEFAULT '{"language": "en", "currency": "CAD", "features": []}'::jsonb,
  ai_config JSONB DEFAULT '{}'::jsonb,
  
  -- Status and metadata
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create RLS policy for organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Leads table with bike-specific fields
CREATE TABLE leads (
  id VARCHAR(255) PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Contact information
  customer_name VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone_number_normalized VARCHAR(20) NOT NULL,
  phone_number_original VARCHAR(30),
  email VARCHAR(255),
  
  -- Lead qualification
  lead_status VARCHAR(50) DEFAULT 'new',
  lead_source VARCHAR(100) DEFAULT 'phone_call',
  lead_quality_score INTEGER DEFAULT 0 CHECK (lead_quality_score >= 0 AND lead_quality_score <= 100),
  
  -- Bike-specific interests
  bike_interest JSONB DEFAULT '{
    "type": null,
    "budget": {"min": 0, "max": 0, "currency": "CAD"},
    "usage": null,
    "experience_level": null,
    "timeline": null,
    "size_preference": null,
    "color_preference": null,
    "features": []
  }'::jsonb,
  
  -- Customer profile
  customer_tier VARCHAR(20) DEFAULT 'new',
  preferred_language VARCHAR(5) DEFAULT 'en',
  contact_preferences JSONB DEFAULT '{"sms": true, "email": true, "call": true, "preferred_time": "business_hours"}'::jsonb,
  
  -- Purchase history
  purchase_history JSONB DEFAULT '[]'::jsonb,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  
  -- Additional context
  notes TEXT,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_contact_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for leads
CREATE INDEX idx_leads_organization_id ON leads(organization_id);
CREATE INDEX idx_leads_phone_normalized ON leads(phone_number_normalized);
CREATE INDEX idx_leads_email ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_status ON leads(lead_status);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_bike_interest_gin ON leads USING gin(bike_interest);

-- Enable RLS for leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Conversations table for logging all interactions
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Call identification
  call_sid VARCHAR(100),
  elevenlabs_conversation_id VARCHAR(255),
  phone_number_normalized VARCHAR(20) NOT NULL,
  
  -- Message content
  content TEXT NOT NULL,
  sent_by VARCHAR(50) NOT NULL, -- 'user', 'agent', 'system'
  message_type VARCHAR(20) DEFAULT 'text', -- 'text', 'audio', 'system', 'tool_call'
  
  -- Conversation metadata
  conversation_type VARCHAR(20) DEFAULT 'voice', -- 'voice', 'sms', 'email', 'chat'
  direction VARCHAR(10) DEFAULT 'inbound', -- 'inbound', 'outbound'
  
  -- AI analysis
  sentiment VARCHAR(20), -- 'positive', 'neutral', 'negative'
  intent VARCHAR(100),
  confidence_score DECIMAL(3,2),
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for conversations
CREATE INDEX idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_call_sid ON conversations(call_sid) WHERE call_sid IS NOT NULL;
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX idx_conversations_sent_by ON conversations(sent_by);
CREATE INDEX idx_conversations_content_gin ON conversations USING gin(to_tsvector('english', content));

-- Enable RLS for conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Calls table for call tracking and analytics
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Twilio call data
  call_sid VARCHAR(100) UNIQUE NOT NULL,
  parent_call_sid VARCHAR(100),
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  
  -- Call details
  direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
  status VARCHAR(20) NOT NULL, -- 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'canceled', 'failed'
  call_reason VARCHAR(100),
  priority VARCHAR(10) DEFAULT 'medium',
  
  -- Call metrics
  duration INTEGER DEFAULT 0, -- seconds
  recording_url VARCHAR(500),
  transcription TEXT,
  
  -- Business outcomes
  call_classification VARCHAR(50), -- 'sales', 'support', 'service', 'complaint', 'information'
  resolution_status VARCHAR(50), -- 'resolved', 'escalated', 'follow_up_needed', 'no_resolution_needed'
  human_intervention BOOLEAN DEFAULT false,
  transfer_reason VARCHAR(200),
  
  -- Appointment/follow-up tracking
  appointment_booked BOOLEAN DEFAULT false,
  appointment_id VARCHAR(100),
  follow_up_scheduled BOOLEAN DEFAULT false,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  
  -- Quality metrics
  customer_satisfaction INTEGER CHECK (customer_satisfaction >= 1 AND customer_satisfaction <= 5),
  ai_performance_score INTEGER CHECK (ai_performance_score >= 1 AND ai_performance_score <= 100),
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for calls
CREATE INDEX idx_calls_organization_id ON calls(organization_id);
CREATE INDEX idx_calls_lead_id ON calls(lead_id);
CREATE INDEX idx_calls_call_sid ON calls(call_sid);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_direction ON calls(direction);
CREATE INDEX idx_calls_started_at ON calls(started_at);
CREATE INDEX idx_calls_classification ON calls(call_classification);

-- Enable RLS for calls
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Appointments table for service booking
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  -- Google Calendar integration
  google_event_id VARCHAR(255),
  calendar_id VARCHAR(255),
  
  -- Appointment details
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255),
  
  -- Service information
  service_type VARCHAR(100) NOT NULL, -- 'tune_up', 'repair', 'bike_fitting', 'consultation'
  service_category VARCHAR(50),
  estimated_duration INTEGER DEFAULT 60, -- minutes
  
  -- Appointment timing
  appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Toronto',
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'confirmed', -- 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'
  confirmation_sent BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,
  
  -- Service details
  bike_details JSONB DEFAULT '{}'::jsonb,
  service_notes TEXT,
  special_requests TEXT,
  
  -- Pricing
  estimated_cost DECIMAL(8,2),
  actual_cost DECIMAL(8,2),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for appointments
CREATE INDEX idx_appointments_organization_id ON appointments(organization_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX idx_appointments_datetime ON appointments(appointment_datetime);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_service_type ON appointments(service_type);

-- Enable RLS for appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Follow-up actions table for automated marketing
CREATE TABLE follow_up_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  -- Action details
  action_type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'call', 'appointment_reminder'
  action_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'cancelled'
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  
  -- Content
  message_template VARCHAR(200),
  message_content TEXT,
  subject_line VARCHAR(200),
  
  -- Tracking
  delivery_status VARCHAR(50),
  response_received BOOLEAN DEFAULT false,
  response_content TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for follow-up actions
CREATE INDEX idx_follow_up_organization_id ON follow_up_actions(organization_id);
CREATE INDEX idx_follow_up_lead_id ON follow_up_actions(lead_id);
CREATE INDEX idx_follow_up_scheduled_for ON follow_up_actions(scheduled_for);
CREATE INDEX idx_follow_up_status ON follow_up_actions(action_status);

-- Enable RLS for follow-up actions
ALTER TABLE follow_up_actions ENABLE ROW LEVEL SECURITY;

-- Analytics and reporting table
CREATE TABLE call_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Time period
  date_period DATE NOT NULL,
  period_type VARCHAR(10) NOT NULL, -- 'daily', 'weekly', 'monthly'
  
  -- Call volume metrics
  total_calls INTEGER DEFAULT 0,
  inbound_calls INTEGER DEFAULT 0,
  outbound_calls INTEGER DEFAULT 0,
  
  -- Call outcome metrics
  completed_calls INTEGER DEFAULT 0,
  missed_calls INTEGER DEFAULT 0,
  answered_calls INTEGER DEFAULT 0,
  
  -- AI performance metrics
  ai_handled_calls INTEGER DEFAULT 0,
  human_escalated_calls INTEGER DEFAULT 0,
  ai_success_rate DECIMAL(5,2) DEFAULT 0.00,
  
  -- Business outcomes
  leads_generated INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  sales_qualified_leads INTEGER DEFAULT 0,
  
  -- Quality metrics
  average_call_duration DECIMAL(8,2) DEFAULT 0.00,
  average_satisfaction_score DECIMAL(3,2) DEFAULT 0.00,
  average_ai_performance DECIMAL(5,2) DEFAULT 0.00,
  
  -- Revenue impact
  potential_revenue DECIMAL(10,2) DEFAULT 0.00,
  actual_revenue DECIMAL(10,2) DEFAULT 0.00,
  
  -- Additional metrics
  metrics JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(organization_id, date_period, period_type)
);

-- Create indexes for analytics
CREATE INDEX idx_analytics_organization_id ON call_analytics(organization_id);
CREATE INDEX idx_analytics_date_period ON call_analytics(date_period);
CREATE INDEX idx_analytics_period_type ON call_analytics(period_type);

-- Enable RLS for analytics
ALTER TABLE call_analytics ENABLE ROW LEVEL SECURITY;

-- Knowledge base articles for RAG
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Article details
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  category VARCHAR(100),
  tags TEXT[],
  
  -- Content metadata
  content_type VARCHAR(50) DEFAULT 'markdown', -- 'markdown', 'html', 'plain_text'
  language VARCHAR(5) DEFAULT 'en',
  
  -- Search and retrieval
  search_vector tsvector,
  embedding vector(1536), -- For OpenAI embeddings
  
  -- Status and versioning
  status VARCHAR(20) DEFAULT 'published', -- 'draft', 'published', 'archived'
  version INTEGER DEFAULT 1,
  
  -- Usage tracking
  view_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for knowledge articles
CREATE INDEX idx_knowledge_organization_id ON knowledge_articles(organization_id);
CREATE INDEX idx_knowledge_search_vector ON knowledge_articles USING gin(search_vector);
CREATE INDEX idx_knowledge_category ON knowledge_articles(category);
CREATE INDEX idx_knowledge_tags ON knowledge_articles USING gin(tags);
CREATE INDEX idx_knowledge_status ON knowledge_articles(status);

-- Enable RLS for knowledge articles
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_follow_up_actions_updated_at BEFORE UPDATE ON follow_up_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_analytics_updated_at BEFORE UPDATE ON call_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_articles_updated_at BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create search vector trigger for knowledge articles
CREATE OR REPLACE FUNCTION update_knowledge_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.summary, ''));
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_knowledge_search_vector_trigger
  BEFORE INSERT OR UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_search_vector();

-- Row Level Security Policies

-- Organizations: Users can only access their own organization
CREATE POLICY "Users can view their own organization" ON organizations
  FOR ALL USING (auth.jwt() ->> 'organization_id' = id::text);

-- Leads: Users can only access leads for their organization
CREATE POLICY "Users can view leads for their organization" ON leads
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Conversations: Users can only access conversations for their organization
CREATE POLICY "Users can view conversations for their organization" ON conversations
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Calls: Users can only access calls for their organization
CREATE POLICY "Users can view calls for their organization" ON calls
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Appointments: Users can only access appointments for their organization
CREATE POLICY "Users can view appointments for their organization" ON appointments
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Follow-up actions: Users can only access follow-ups for their organization
CREATE POLICY "Users can view follow-ups for their organization" ON follow_up_actions
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Analytics: Users can only access analytics for their organization
CREATE POLICY "Users can view analytics for their organization" ON call_analytics
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Knowledge articles: Users can only access articles for their organization
CREATE POLICY "Users can view knowledge articles for their organization" ON knowledge_articles
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Create views for common queries

-- Active calls view
CREATE VIEW active_calls AS
SELECT 
  c.*,
  l.customer_name,
  l.phone_number_normalized,
  l.lead_status,
  o.name as organization_name
FROM calls c
JOIN leads l ON c.lead_id = l.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.status IN ('ringing', 'in-progress');

-- Daily analytics view
CREATE VIEW daily_call_analytics AS
SELECT 
  organization_id,
  DATE(started_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_calls,
  COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_calls,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
  COUNT(*) FILTER (WHERE human_intervention = true) as escalated_calls,
  AVG(duration) as avg_duration,
  COUNT(*) FILTER (WHERE appointment_booked = true) as appointments_booked,
  AVG(ai_performance_score) as avg_ai_performance
FROM calls
WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY organization_id, DATE(started_at)
ORDER BY call_date DESC;

-- Lead summary view
CREATE VIEW lead_summary AS
SELECT 
  l.*,
  COUNT(c.id) as total_calls,
  MAX(c.started_at) as last_call_date,
  COUNT(a.id) as total_appointments,
  COALESCE(SUM(a.actual_cost), 0) as total_revenue
FROM leads l
LEFT JOIN calls c ON l.id = c.lead_id
LEFT JOIN appointments a ON l.id = a.lead_id
GROUP BY l.id;

-- Insert default organization for BICI Bike Store
INSERT INTO organizations (
  id,
  name,
  slug,
  phone_number,
  email,
  website,
  address,
  settings,
  ai_config
) VALUES (
  gen_random_uuid(),
  'Bici Bike Store',
  'bici-bike-store',
  '+14165552453',
  'info@bicibikes.com',
  'https://bicibikes.com',
  '{
    "street": "123 Main Street",
    "city": "Toronto",
    "province": "Ontario",
    "postal_code": "M5V 3A8",
    "country": "Canada"
  }'::jsonb,
  '{
    "language": "en",
    "currency": "CAD",
    "timezone": "America/Toronto",
    "features": ["ai_calls", "appointments", "crm", "analytics"],
    "business_hours": {
      "monday": {"open": "09:00", "close": "19:00"},
      "tuesday": {"open": "09:00", "close": "19:00"},
      "wednesday": {"open": "09:00", "close": "19:00"},
      "thursday": {"open": "09:00", "close": "19:00"},
      "friday": {"open": "09:00", "close": "19:00"},
      "saturday": {"open": "10:00", "close": "18:00"},
      "sunday": {"open": "10:00", "close": "18:00"}
    }
  }'::jsonb,
  '{
    "elevenlabs_agent_id": "",
    "elevenlabs_voice_id": "",
    "model_temperature": 0.3,
    "max_conversation_duration": 1800,
    "default_language": "en",
    "supported_languages": ["en", "fr"]
  }'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Create sample knowledge articles
INSERT INTO knowledge_articles (organization_id, title, content, category, tags) 
SELECT 
  o.id,
  'Store Hours and Location',
  'Our store is open Monday-Friday 9AM-7PM, Saturday-Sunday 10AM-6PM. We are located at 123 Main Street, Downtown Toronto.',
  'store_info',
  ARRAY['hours', 'location', 'contact']
FROM organizations o WHERE o.slug = 'bici-bike-store';

INSERT INTO knowledge_articles (organization_id, title, content, category, tags)
SELECT 
  o.id,
  'Bike Types We Sell',
  'We specialize in road bikes, mountain bikes, e-bikes, and hybrid bikes. Our selection includes entry-level to high-end models from top brands.',
  'products',
  ARRAY['bikes', 'products', 'inventory']
FROM organizations o WHERE o.slug = 'bici-bike-store';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant organization data';
COMMENT ON TABLE leads IS 'Customer leads with bike-specific qualification data';
COMMENT ON TABLE conversations IS 'All conversation messages and interactions';
COMMENT ON TABLE calls IS 'Call tracking and analytics data';
COMMENT ON TABLE appointments IS 'Service appointments and bookings';
COMMENT ON TABLE follow_up_actions IS 'Automated follow-up marketing actions';
COMMENT ON TABLE call_analytics IS 'Aggregated analytics and reporting data';
COMMENT ON TABLE knowledge_articles IS 'Knowledge base for RAG system';