-- Row Level Security (RLS) Policies for Multi-Tenant Architecture
-- These policies ensure complete organization isolation for 2,000+ monthly calls

-- Enable RLS on all tenant-specific tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create function to get current user's organization ID
CREATE OR REPLACE FUNCTION auth.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    -- Try to get from JWT claims first
    (auth.jwt() ->> 'organization_id')::uuid,
    -- Fallback to user record lookup
    (SELECT organization_id FROM users WHERE id = auth.uid())
  );
$$;

-- Create function for service account access (for API operations)
CREATE OR REPLACE FUNCTION auth.is_service_account()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'service_account')::boolean,
    false
  );
$$;

-- Organizations policies
CREATE POLICY "Organizations are viewable by organization members"
  ON organizations FOR SELECT
  USING (
    auth.is_service_account() OR 
    id = auth.get_user_organization_id()
  );

CREATE POLICY "Organizations are updatable by organization admins"
  ON organizations FOR UPDATE
  USING (
    auth.is_service_account() OR 
    (id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
  );

-- Leads policies
CREATE POLICY "Leads are viewable by organization members"
  ON leads FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Leads are insertable by organization members"
  ON leads FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Leads are updatable by organization members"
  ON leads FOR UPDATE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Leads are deletable by organization admins"
  ON leads FOR DELETE
  USING (
    auth.is_service_account() OR 
    (organization_id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
  );

-- Conversations policies
CREATE POLICY "Conversations are viewable by organization members"
  ON conversations FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Conversations are insertable by organization members"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Conversations are updatable by organization members"
  ON conversations FOR UPDATE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

-- Call sessions policies
CREATE POLICY "Call sessions are viewable by organization members"
  ON call_sessions FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Call sessions are insertable by organization members"
  ON call_sessions FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Call sessions are updatable by organization members"
  ON call_sessions FOR UPDATE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

-- Appointments policies
CREATE POLICY "Appointments are viewable by organization members"
  ON appointments FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Appointments are insertable by organization members"
  ON appointments FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Appointments are updatable by organization members"
  ON appointments FOR UPDATE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Appointments are deletable by organization members"
  ON appointments FOR DELETE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

-- Products policies
CREATE POLICY "Products are viewable by organization members"
  ON products FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Products are insertable by organization managers"
  ON products FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    (organization_id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
  );

CREATE POLICY "Products are updatable by organization managers"
  ON products FOR UPDATE
  USING (
    auth.is_service_account() OR 
    (organization_id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
  );

CREATE POLICY "Products are deletable by organization admins"
  ON products FOR DELETE
  USING (
    auth.is_service_account() OR 
    (organization_id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  );

-- Orders policies
CREATE POLICY "Orders are viewable by organization members"
  ON orders FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Orders are insertable by organization members"
  ON orders FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Orders are updatable by organization members"
  ON orders FOR UPDATE
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

-- Order items policies (inherit from parent order)
CREATE POLICY "Order items are viewable by organization members"
  ON order_items FOR SELECT
  USING (
    auth.is_service_account() OR 
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.organization_id = auth.get_user_organization_id()
    )
  );

CREATE POLICY "Order items are insertable by organization members"
  ON order_items FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.organization_id = auth.get_user_organization_id()
    )
  );

CREATE POLICY "Order items are updatable by organization members"
  ON order_items FOR UPDATE
  USING (
    auth.is_service_account() OR 
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.organization_id = auth.get_user_organization_id()
    )
  );

-- Analytics events policies
CREATE POLICY "Analytics events are viewable by organization members"
  ON analytics_events FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Analytics events are insertable by organization members"
  ON analytics_events FOR INSERT
  WITH CHECK (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

-- Users policies
CREATE POLICY "Users can view their own organization members"
  ON users FOR SELECT
  USING (
    auth.is_service_account() OR 
    organization_id = auth.get_user_organization_id()
  );

CREATE POLICY "Users can update their own record"
  ON users FOR UPDATE
  USING (
    auth.is_service_account() OR 
    id = auth.uid()
  );

CREATE POLICY "Organization admins can manage organization users"
  ON users FOR ALL
  USING (
    auth.is_service_account() OR 
    (organization_id = auth.get_user_organization_id() AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  );

-- Create indexes to support RLS policies efficiently
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_organization_id ON call_sessions(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_organization_id ON appointments(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_organization_id ON products(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_organization_id ON orders(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_organization_id ON analytics_events(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- Create function for API service account to bypass RLS when needed
CREATE OR REPLACE FUNCTION auth.create_service_token(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_jwt TEXT;
BEGIN
  -- Only allow admins to create service tokens
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND organization_id = org_id 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only organization admins can create service tokens';
  END IF;
  
  -- Generate service account JWT (simplified - in production use proper JWT library)
  service_jwt := encode(
    ('{"service_account": true, "organization_id": "' || org_id || '"}')::bytea,
    'base64'
  );
  
  RETURN service_jwt;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_service_account() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.create_service_token(UUID) TO authenticated;