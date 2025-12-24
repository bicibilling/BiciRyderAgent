-- Setup database schema for BICI Voice Agent

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    settings JSONB DEFAULT '{
        "business_hours": {
            "monday": {"open": "09:00", "close": "18:00"},
            "tuesday": {"open": "09:00", "close": "18:00"},
            "wednesday": {"open": "09:00", "close": "18:00"},
            "thursday": {"open": "09:00", "close": "18:00"},
            "friday": {"open": "09:00", "close": "18:00"},
            "saturday": {"open": "09:00", "close": "17:00"},
            "sunday": {"open": "10:00", "close": "16:00"}
        },
        "location": {
            "address": "123 Bike Street, Vancouver, BC",
            "coordinates": {"lat": 49.2827, "lng": -123.1207}
        },
        "services": ["bike sales", "repairs", "rentals", "accessories"]
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    phone_number TEXT NOT NULL,
    phone_number_normalized TEXT NOT NULL,
    customer_name TEXT,
    email TEXT,
    status TEXT CHECK (status IN ('new', 'contacted', 'qualified', 'hot', 'customer', 'closed')) DEFAULT 'new',
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')) DEFAULT 'neutral',
    bike_interest JSONB DEFAULT '{}',
    qualification_data JSONB DEFAULT '{"ready_to_buy": false, "contact_preference": "phone", "purchase_intent": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    lead_id TEXT REFERENCES leads(id),
    phone_number TEXT,
    phone_number_normalized TEXT,
    content TEXT NOT NULL,
    sent_by TEXT CHECK (sent_by IN ('user', 'agent', 'human_agent', 'system')) NOT NULL,
    type TEXT CHECK (type IN ('voice', 'sms', 'email', 'system')) NOT NULL,
    classification TEXT CHECK (classification IN ('sales', 'support', 'service', 'general')),
    call_classification TEXT CHECK (call_classification IN ('sales', 'support', 'service', 'general', 'live')),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Create call_sessions table
CREATE TABLE IF NOT EXISTS call_sessions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    lead_id TEXT NOT NULL REFERENCES leads(id),
    elevenlabs_conversation_id TEXT,
    status TEXT CHECK (status IN ('initiated', 'active', 'completed', 'failed', 'transferred')) DEFAULT 'initiated',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    call_type TEXT CHECK (call_type IN ('inbound', 'outbound')),
    is_special_order BOOLEAN,
    is_current_order_request BOOLEAN,
    is_bike_purchase BOOLEAN,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_organization_phone ON leads(organization_id, phone_number_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON leads(phone_number_normalized);
CREATE INDEX IF NOT EXISTS idx_organizations_phone ON organizations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_organization_lead ON conversations(organization_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX IF NOT EXISTS idx_call_sessions_organization_lead ON call_sessions(organization_id, lead_id);

-- Insert default organization
INSERT INTO organizations (id, name, phone_number, settings) 
VALUES (
    'b0c1b1c1-0000-0000-0000-000000000001',
    'BICI Bike Store',
    '+17786528784',
    '{
        "business_hours": {
            "monday": {"open": "09:00", "close": "18:00"},
            "tuesday": {"open": "09:00", "close": "18:00"},
            "wednesday": {"open": "09:00", "close": "18:00"},
            "thursday": {"open": "09:00", "close": "18:00"},
            "friday": {"open": "09:00", "close": "18:00"},
            "saturday": {"open": "09:00", "close": "17:00"},
            "sunday": {"open": "10:00", "close": "16:00"}
        },
        "location": {
            "address": "123 Bike Street, Vancouver, BC",
            "coordinates": {"lat": 49.2827, "lng": -123.1207}
        },
        "services": ["bike sales", "repairs", "rentals", "accessories"]
    }'
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    phone_number = EXCLUDED.phone_number,
    settings = EXCLUDED.settings,
    updated_at = NOW();
