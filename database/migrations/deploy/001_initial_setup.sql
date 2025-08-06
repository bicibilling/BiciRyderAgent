-- BICI AI Voice Agent - Initial Database Setup
-- Deployment Migration Script for Production

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create custom types
CREATE TYPE conversation_status AS ENUM ('active', 'completed', 'failed', 'timeout');
CREATE TYPE conversation_channel AS ENUM ('phone', 'web', 'api');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE lead_source AS ENUM ('phone_call', 'web_chat', 'referral', 'marketing', 'other');

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Insert default organization
INSERT INTO organizations (id, name, slug, settings) 
VALUES (
    'bici-bike-store'::UUID, 
    'BICI Bike Store', 
    'bici-bike-store',
    '{
        "timezone": "America/Toronto",
        "business_hours": {
            "monday": {"open": "09:00", "close": "19:00"},
            "tuesday": {"open": "09:00", "close": "19:00"},
            "wednesday": {"open": "09:00", "close": "19:00"},
            "thursday": {"open": "09:00", "close": "19:00"},
            "friday": {"open": "09:00", "close": "19:00"},
            "saturday": {"open": "10:00", "close": "18:00"},
            "sunday": {"open": "10:00", "close": "18:00"}
        },
        "contact": {
            "phone": "+14165552453",
            "email": "info@bicibikes.com",
            "address": "123 Main Street, Toronto, ON M5V 3A8"
        }
    }'::JSONB
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    settings = EXCLUDED.settings,
    updated_at = NOW();

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- CRM ID (HubSpot, Salesforce, etc.)
    phone_number VARCHAR(20),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on customers
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone_number ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_external_id ON customers(external_id);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    source lead_source NOT NULL DEFAULT 'other',
    phone_number VARCHAR(20),
    email VARCHAR(255),
    name VARCHAR(255),
    interest_category VARCHAR(100),
    budget_range VARCHAR(50),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on leads
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone_number ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    external_call_id VARCHAR(255), -- Twilio Call SID
    channel conversation_channel NOT NULL DEFAULT 'phone',
    status conversation_status NOT NULL DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    summary TEXT,
    sentiment_score DECIMAL(3,2), -- -1.00 to 1.00
    satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on conversations
CREATE INDEX IF NOT EXISTS idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_external_call_id ON conversations(external_call_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp_ms ON messages(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    external_calendar_id VARCHAR(255), -- Google Calendar Event ID
    service_type VARCHAR(100) NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status appointment_status NOT NULL DEFAULT 'scheduled',
    customer_notes TEXT,
    internal_notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on appointments
CREATE INDEX IF NOT EXISTS idx_appointments_organization_id ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id ON appointments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Analytics table for conversation metrics
CREATE TABLE IF NOT EXISTS conversation_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    metrics JSONB NOT NULL DEFAULT '{}',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on conversation_analytics
CREATE INDEX IF NOT EXISTS idx_conversation_analytics_organization_id ON conversation_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analytics_conversation_id ON conversation_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analytics_computed_at ON conversation_analytics(computed_at);

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    level VARCHAR(20) NOT NULL,
    component VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_organization_id ON system_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_component ON system_logs(component);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- API keys table for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- Session storage table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token VARCHAR(255) NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_data JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on sessions
CREATE INDEX IF NOT EXISTS idx_sessions_session_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_organization_id ON sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for multi-tenant access
-- Organizations: Users can only access their own organization
CREATE POLICY org_isolation ON organizations FOR ALL USING (id = current_setting('app.current_organization_id')::UUID);

-- Customers: Scoped to organization
CREATE POLICY customer_org_isolation ON customers FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Leads: Scoped to organization
CREATE POLICY lead_org_isolation ON leads FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Conversations: Scoped to organization
CREATE POLICY conversation_org_isolation ON conversations FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Messages: Scoped to organization through conversation
CREATE POLICY message_org_isolation ON messages FOR ALL USING (
    conversation_id IN (
        SELECT id FROM conversations WHERE organization_id = current_setting('app.current_organization_id')::UUID
    )
);

-- Appointments: Scoped to organization
CREATE POLICY appointment_org_isolation ON appointments FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Analytics: Scoped to organization
CREATE POLICY analytics_org_isolation ON conversation_analytics FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- System logs: Scoped to organization
CREATE POLICY logs_org_isolation ON system_logs FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- API keys: Scoped to organization
CREATE POLICY api_keys_org_isolation ON api_keys FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Sessions: Scoped to organization
CREATE POLICY sessions_org_isolation ON sessions FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to service role for admin operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Create function to get conversation metrics
CREATE OR REPLACE FUNCTION get_conversation_metrics()
RETURNS TABLE (
    total_conversations BIGINT,
    active_conversations BIGINT,
    completed_conversations BIGINT,
    avg_duration_seconds NUMERIC,
    avg_sentiment_score NUMERIC,
    conversations_today BIGINT,
    conversations_this_week BIGINT,
    conversations_this_month BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE status = 'active') as active_conversations,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_conversations,
        AVG(duration_seconds) as avg_duration_seconds,
        AVG(sentiment_score) as avg_sentiment_score,
        COUNT(*) FILTER (WHERE DATE(started_at) = CURRENT_DATE) as conversations_today,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('week', CURRENT_DATE)) as conversations_this_week,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('month', CURRENT_DATE)) as conversations_this_month
    FROM conversations 
    WHERE organization_id = current_setting('app.current_organization_id')::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to cleanup old sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to cleanup old logs
CREATE OR REPLACE FUNCTION cleanup_old_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification function for real-time updates
CREATE OR REPLACE FUNCTION notify_conversation_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'conversation_updates',
        json_build_object(
            'operation', TG_OP,
            'record', row_to_json(NEW),
            'organization_id', NEW.organization_id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for real-time notifications
CREATE TRIGGER conversation_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON conversations
    FOR EACH ROW EXECUTE FUNCTION notify_conversation_update();

-- Final step: Log the successful migration
INSERT INTO system_logs (level, component, message, metadata) 
VALUES (
    'info', 
    'migration', 
    'Initial database setup completed successfully',
    json_build_object(
        'migration_version', '001',
        'timestamp', NOW(),
        'tables_created', 11,
        'indexes_created', 25,
        'functions_created', 4
    )::JSONB
);

COMMIT;