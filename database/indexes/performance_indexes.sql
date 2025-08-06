-- Performance Optimization Indexes for BICI Bike Store
-- Optimized for 2,000+ monthly calls with fast query performance

-- Organizations indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_phone ON organizations(phone_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_active ON organizations(is_active) WHERE is_active = true;

-- Leads indexes - Critical for fast customer lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_phone_normalized ON leads(phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_phone ON leads(organization_id, phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status ON leads(lead_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_quality_score ON leads(lead_quality_score DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_last_interaction ON leads(last_interaction_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_date ON leads(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_active ON leads(organization_id, is_active) WHERE is_active = true;

-- GIN index for bike interest JSONB searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_bike_interest_gin ON leads USING GIN(bike_interest);

-- Text search index for customer names
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_customer_name_gin ON leads USING GIN(customer_name gin_trgm_ops);

-- Integration IDs for external system lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_hubspot_id ON leads(hubspot_contact_id) WHERE hubspot_contact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_shopify_id ON leads(shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;

-- Conversations indexes - Critical for call logging and retrieval
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_phone_normalized ON conversations(phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_phone ON conversations(organization_id, phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_elevenlabs_id ON conversations(elevenlabs_conversation_id) WHERE elevenlabs_conversation_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_twilio_sid ON conversations(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_sent_by ON conversations(sent_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_message_type ON conversations(message_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_direction ON conversations(call_direction);

-- Full-text search index for conversation content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_content_fts ON conversations USING GIN(to_tsvector('english', content));

-- Composite index for recent conversations by lead
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lead_recent ON conversations(lead_id, timestamp DESC);

-- Call sessions indexes - For session tracking and analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_phone_normalized ON call_sessions(phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_org_phone ON call_sessions(organization_id, phone_number_normalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_elevenlabs_id ON call_sessions(elevenlabs_conversation_id) WHERE elevenlabs_conversation_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_twilio_sid ON call_sessions(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_status ON call_sessions(session_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_started ON call_sessions(started_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_lead_id ON call_sessions(lead_id);

-- Appointments indexes - For scheduling and availability queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_datetime ON appointments(appointment_datetime);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_org_datetime ON appointments(organization_id, appointment_datetime);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_phone ON appointments(customer_phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_service_type ON appointments(service_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_google_event ON appointments(google_calendar_event_id) WHERE google_calendar_event_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);

-- Composite index for availability checking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_availability ON appointments(organization_id, service_type, appointment_datetime, status);

-- Products indexes - For inventory and recommendation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_sku ON products(organization_id, sku);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_bike_type ON products(bike_type) WHERE bike_type IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active ON products(organization_id, is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_stock ON products(stock_quantity) WHERE stock_quantity > 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_popularity ON products(popularity_score DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_featured ON products(organization_id, is_featured) WHERE is_featured = true;

-- GIN indexes for product attributes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_specifications_gin ON products USING GIN(specifications);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_features_gin ON products USING GIN(features);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_frame_sizes_gin ON products USING GIN(frame_sizes);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_colors_gin ON products USING GIN(colors);

-- Full-text search for product names and descriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_search ON products USING GIN((name || ' ' || COALESCE(description, '')) gin_trgm_ops);

-- Integration IDs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shopify_id ON products(shopify_product_id) WHERE shopify_product_id IS NOT NULL;

-- Orders indexes - For order tracking and customer history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_number ON orders(organization_id, order_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_email ON orders(customer_email) WHERE customer_email IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_lead_id ON orders(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tracking ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

-- Integration IDs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;

-- Composite index for customer order history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_history ON orders(organization_id, customer_phone, order_date DESC);

-- Order items indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_sku ON order_items(product_sku);

-- Analytics events indexes - For reporting and insights
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_phone ON analytics_events(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_lead_id ON analytics_events(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id) WHERE session_id IS NOT NULL;

-- Composite indexes for analytics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_org_type_time ON analytics_events(organization_id, event_type, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_customer_segment ON analytics_events(organization_id, customer_segment, timestamp DESC) WHERE customer_segment IS NOT NULL;

-- GIN index for event data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_data_gin ON analytics_events USING GIN(event_data);

-- Users indexes - For authentication and user management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_role ON users(organization_id, role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active ON users(organization_id, is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC);

-- Partial indexes for performance on common filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_new_status ON leads(organization_id, created_at DESC) WHERE lead_status = 'new';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_qualified ON leads(organization_id, lead_quality_score DESC) WHERE lead_quality_score >= 70;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_needs_followup ON conversations(organization_id, timestamp DESC) WHERE needs_followup = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_today ON appointments(organization_id) WHERE DATE(appointment_datetime) = CURRENT_DATE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_active ON call_sessions(organization_id, started_at DESC) WHERE session_status = 'active';

-- Covering indexes for common queries (include frequently accessed columns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_lookup_covering ON leads(organization_id, phone_number_normalized) 
  INCLUDE (id, customer_name, email, lead_status, last_interaction_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_recent_covering ON conversations(lead_id, timestamp DESC) 
  INCLUDE (content, sent_by, message_type, call_direction);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_search_covering ON products(organization_id, is_active) 
  INCLUDE (name, brand, category, price, stock_quantity) WHERE is_active = true;

-- Functional indexes for computed values
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_full_name ON leads((customer_name)) WHERE customer_name IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_date_only ON appointments((DATE(appointment_datetime)), organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_year_month ON orders((EXTRACT(YEAR FROM order_date)), (EXTRACT(MONTH FROM order_date)), organization_id);

-- Statistics and maintenance
-- Update table statistics for better query planning
ANALYZE organizations;
ANALYZE leads;
ANALYZE conversations;
ANALYZE call_sessions;
ANALYZE appointments;
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
ANALYZE analytics_events;
ANALYZE users;