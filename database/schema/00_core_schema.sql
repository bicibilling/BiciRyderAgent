-- BICI Bike Store Multi-Tenant Database Schema
-- This schema supports 2,000+ monthly calls with proper multi-tenant security

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
    address TEXT,
    timezone VARCHAR(50) DEFAULT 'America/Toronto',
    business_hours JSONB DEFAULT '{
        "monday": {"open": "09:00", "close": "19:00", "closed": false},
        "tuesday": {"open": "09:00", "close": "19:00", "closed": false},
        "wednesday": {"open": "09:00", "close": "19:00", "closed": false},
        "thursday": {"open": "09:00", "close": "19:00", "closed": false},
        "friday": {"open": "09:00", "close": "19:00", "closed": false},
        "saturday": {"open": "10:00", "close": "18:00", "closed": false},
        "sunday": {"open": "10:00", "close": "18:00", "closed": false}
    }'::jsonb,
    settings JSONB DEFAULT '{
        "language": "en",
        "currency": "CAD",
        "auto_followup": true,
        "sms_enabled": true,
        "hubspot_integration": false,
        "shopify_integration": false
    }'::jsonb,
    ai_agent_config JSONB DEFAULT '{
        "agent_id": null,
        "voice_id": null,
        "personality": "friendly",
        "escalation_threshold": 3,
        "languages": ["en"]
    }'::jsonb,
    subscription_tier VARCHAR(50) DEFAULT 'starter',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Leads table with bike-specific fields and lead qualification
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Customer identification
    customer_name VARCHAR(255),
    phone_number VARCHAR(20) NOT NULL,
    phone_number_normalized VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    
    -- Lead classification and qualification
    lead_status VARCHAR(50) DEFAULT 'new' CHECK (lead_status IN (
        'new', 'contacted', 'qualified', 'opportunity', 'customer', 'lost', 'inactive'
    )),
    lead_source VARCHAR(100) DEFAULT 'ai_phone_call',
    lead_quality_score INTEGER DEFAULT 0 CHECK (lead_quality_score >= 0 AND lead_quality_score <= 100),
    
    -- Bike-specific interest tracking
    bike_interest JSONB DEFAULT '{
        "type": null,
        "budget": {"min": 0, "max": 0, "currency": "CAD"},
        "usage": null,
        "experience_level": null,
        "timeline": null,
        "size_requirements": null,
        "preferred_brands": [],
        "specific_models": []
    }'::jsonb,
    
    -- Contact preferences and communication history
    contact_preferences JSONB DEFAULT '{
        "sms": true,
        "email": true,
        "call": true,
        "preferred_time": "business_hours",
        "language": "en"
    }'::jsonb,
    
    -- Customer profile and context
    customer_profile JSONB DEFAULT '{
        "demographics": {},
        "preferences": {},
        "purchase_history": [],
        "service_history": [],
        "notes": []
    }'::jsonb,
    
    -- Tracking and analytics
    total_interactions INTEGER DEFAULT 0,
    last_interaction_at TIMESTAMP WITH TIME ZONE,
    conversion_probability DECIMAL(5,2) DEFAULT 0.00,
    lifetime_value DECIMAL(10,2) DEFAULT 0.00,
    
    -- Integration IDs
    hubspot_contact_id VARCHAR(100),
    shopify_customer_id VARCHAR(100),
    twilio_customer_id VARCHAR(100),
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Conversations table for comprehensive call logging
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Call identification
    phone_number VARCHAR(20) NOT NULL,
    phone_number_normalized VARCHAR(20) NOT NULL,
    elevenlabs_conversation_id VARCHAR(255),
    twilio_call_sid VARCHAR(255),
    
    -- Message details
    content TEXT NOT NULL,
    sent_by VARCHAR(50) NOT NULL CHECK (sent_by IN ('customer', 'ai_agent', 'human_agent', 'system')),
    message_type VARCHAR(50) DEFAULT 'voice' CHECK (message_type IN ('voice', 'sms', 'email', 'system', 'webhook')),
    
    -- Call classification
    call_direction VARCHAR(20) DEFAULT 'inbound' CHECK (call_direction IN ('inbound', 'outbound')),
    call_purpose VARCHAR(100),
    call_outcome VARCHAR(100),
    
    -- AI processing
    sentiment VARCHAR(20) DEFAULT 'neutral',
    confidence_score DECIMAL(5,2),
    intent_detected VARCHAR(100),
    entities_extracted JSONB DEFAULT '{}',
    
    -- Quality and monitoring
    quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 10),
    needs_followup BOOLEAN DEFAULT false,
    escalated_to_human BOOLEAN DEFAULT false,
    
    -- Metadata
    duration_seconds INTEGER,
    recording_url TEXT,
    transcript_url TEXT,
    language VARCHAR(10) DEFAULT 'en',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Call sessions for detailed call tracking
CREATE TABLE call_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Session identification
    phone_number VARCHAR(20) NOT NULL,
    phone_number_normalized VARCHAR(20) NOT NULL,
    elevenlabs_conversation_id VARCHAR(255) UNIQUE,
    twilio_call_sid VARCHAR(255) UNIQUE,
    
    -- Session details
    call_direction VARCHAR(20) DEFAULT 'inbound' CHECK (call_direction IN ('inbound', 'outbound')),
    session_status VARCHAR(50) DEFAULT 'active' CHECK (session_status IN (
        'active', 'completed', 'transferred', 'failed', 'abandoned'
    )),
    
    -- Call flow and routing
    initial_intent VARCHAR(100),
    final_resolution VARCHAR(100),
    escalation_reason VARCHAR(255),
    transferred_to VARCHAR(100),
    
    -- Performance metrics
    total_duration_seconds INTEGER,
    ai_handling_duration INTEGER,
    human_handling_duration INTEGER,
    response_time_ms INTEGER,
    
    -- Quality metrics
    customer_satisfaction INTEGER CHECK (customer_satisfaction >= 1 AND customer_satisfaction <= 5),
    resolution_achieved BOOLEAN DEFAULT false,
    followup_required BOOLEAN DEFAULT false,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Appointments table for service scheduling
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Customer information
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    
    -- Appointment details
    service_type VARCHAR(100) NOT NULL,
    appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    location VARCHAR(255) DEFAULT 'Main Store',
    
    -- Service details
    bike_details JSONB DEFAULT '{}',
    service_requested TEXT,
    estimated_cost DECIMAL(10,2),
    notes TEXT,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
    )),
    
    -- Reminders and notifications
    reminder_sent BOOLEAN DEFAULT false,
    confirmation_sent BOOLEAN DEFAULT false,
    
    -- Integration IDs
    google_calendar_event_id VARCHAR(255),
    cal_com_booking_id VARCHAR(255),
    
    -- Metadata
    created_by VARCHAR(100) DEFAULT 'ai_agent',
    cancelled_reason TEXT,
    rescheduled_from UUID REFERENCES appointments(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Products table for bike inventory and recommendations
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Product identification
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    
    -- Product details
    description TEXT,
    specifications JSONB DEFAULT '{}',
    features TEXT[] DEFAULT '{}',
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    msrp DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 5,
    
    -- Bike-specific attributes
    bike_type VARCHAR(50),
    frame_sizes VARCHAR[] DEFAULT '{}',
    colors VARCHAR[] DEFAULT '{}',
    year_model INTEGER,
    gender_target VARCHAR(20),
    age_range VARCHAR(50),
    experience_level VARCHAR(50),
    
    -- Recommendations engine
    popularity_score INTEGER DEFAULT 0,
    seasonal_demand JSONB DEFAULT '{}',
    complementary_products UUID[] DEFAULT '{}',
    
    -- Integration IDs
    shopify_product_id VARCHAR(100),
    supplier_sku VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    
    -- Metadata
    images TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    UNIQUE(organization_id, sku)
);

-- Orders table for purchase tracking
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Order identification
    order_number VARCHAR(100) NOT NULL,
    
    -- Customer information
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    
    -- Order details
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Status and fulfillment
    order_status VARCHAR(50) DEFAULT 'pending' CHECK (order_status IN (
        'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
    )),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN (
        'pending', 'paid', 'partially_paid', 'refunded', 'failed'
    )),
    fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled',
    
    -- Shipping information
    shipping_address JSONB,
    billing_address JSONB,
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(255),
    
    -- Dates
    order_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ship_date TIMESTAMP WITH TIME ZONE,
    delivery_date TIMESTAMP WITH TIME ZONE,
    
    -- Integration IDs
    shopify_order_id VARCHAR(100),
    payment_processor_id VARCHAR(100),
    
    -- Metadata
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    UNIQUE(organization_id, order_number)
);

-- Order items for detailed purchase tracking
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- Item details
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    variant_details JSONB DEFAULT '{}',
    
    -- Pricing and quantity
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Fulfillment
    quantity_shipped INTEGER DEFAULT 0,
    quantity_cancelled INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analytics and reporting table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    
    -- Context
    session_id VARCHAR(255),
    user_agent TEXT,
    ip_address INET,
    source VARCHAR(100),
    
    -- Dimensions
    phone_number VARCHAR(20),
    customer_segment VARCHAR(50),
    channel VARCHAR(50),
    
    -- Metrics
    value DECIMAL(10,2),
    quantity INTEGER,
    
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User management for dashboard access
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- User identification
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Authentication
    password_hash TEXT,
    email_verified BOOLEAN DEFAULT false,
    
    -- Role and permissions
    role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
    permissions JSONB DEFAULT '{}',
    
    -- Profile
    phone VARCHAR(20),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    UNIQUE(email)
);