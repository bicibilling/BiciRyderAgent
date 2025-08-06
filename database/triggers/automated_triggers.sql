-- Automated Triggers and Functions for BICI Bike Store
-- Handles automated processes for 2,000+ monthly calls

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_sessions_updated_at BEFORE UPDATE ON call_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone_number(phone_input TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove all non-digit characters
    phone_input := regexp_replace(phone_input, '[^0-9]', '', 'g');
    
    -- Handle North American numbers
    IF length(phone_input) = 10 THEN
        RETURN '+1' || phone_input;
    ELSIF length(phone_input) = 11 AND substring(phone_input, 1, 1) = '1' THEN
        RETURN '+' || phone_input;
    ELSIF length(phone_input) > 10 THEN
        RETURN '+' || phone_input;
    ELSE
        -- Return as-is for shorter numbers (might be extensions)
        RETURN phone_input;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'leads' THEN
        NEW.phone_number_normalized = normalize_phone_number(NEW.phone_number);
    ELSIF TG_TABLE_NAME = 'conversations' THEN
        NEW.phone_number_normalized = normalize_phone_number(NEW.phone_number);
    ELSIF TG_TABLE_NAME = 'call_sessions' THEN
        NEW.phone_number_normalized = normalize_phone_number(NEW.phone_number);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply phone normalization triggers
CREATE TRIGGER normalize_leads_phone BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION normalize_phone_trigger();

CREATE TRIGGER normalize_conversations_phone BEFORE INSERT OR UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION normalize_phone_trigger();

CREATE TRIGGER normalize_call_sessions_phone BEFORE INSERT OR UPDATE ON call_sessions
    FOR EACH ROW EXECUTE FUNCTION normalize_phone_trigger();

-- Function to update lead interaction statistics
CREATE OR REPLACE FUNCTION update_lead_interactions()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.lead_id IS NOT NULL THEN
        UPDATE leads 
        SET 
            total_interactions = total_interactions + 1,
            last_interaction_at = NEW.timestamp
        WHERE id = NEW.lead_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update lead stats when conversations are added
CREATE TRIGGER update_lead_interactions_trigger AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_lead_interactions();

-- Function to calculate lead quality score
CREATE OR REPLACE FUNCTION calculate_lead_quality_score(lead_record RECORD)
RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 0;
    bike_interest JSONB;
    contact_prefs JSONB;
BEGIN
    bike_interest := lead_record.bike_interest;
    contact_prefs := lead_record.contact_preferences;
    
    -- Base score for having contact information
    IF lead_record.customer_name IS NOT NULL THEN score := score + 10; END IF;
    IF lead_record.email IS NOT NULL THEN score := score + 15; END IF;
    IF lead_record.phone_number IS NOT NULL THEN score := score + 20; END IF;
    
    -- Score for bike interest details
    IF bike_interest->>'type' IS NOT NULL THEN score := score + 15; END IF;
    IF (bike_interest->'budget'->>'max')::numeric > 0 THEN score := score + 10; END IF;
    IF bike_interest->>'timeline' IS NOT NULL THEN score := score + 10; END IF;
    IF bike_interest->>'usage' IS NOT NULL THEN score := score + 5; END IF;
    
    -- Score for engagement level
    IF lead_record.total_interactions > 1 THEN score := score + 10; END IF;
    IF lead_record.total_interactions > 3 THEN score := score + 5; END IF;
    
    -- Score for contact preferences
    IF contact_prefs->>'sms' = 'true' OR contact_prefs->>'email' = 'true' THEN 
        score := score + 5; 
    END IF;
    
    -- Cap at 100
    IF score > 100 THEN score := 100; END IF;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update lead quality score
CREATE OR REPLACE FUNCTION update_lead_quality_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.lead_quality_score = calculate_lead_quality_score(NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update lead quality score on changes
CREATE TRIGGER update_lead_quality_score_trigger BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_lead_quality_score();

-- Function to create analytics events for important actions
CREATE OR REPLACE FUNCTION create_analytics_event(
    org_id UUID,
    event_type TEXT,
    event_name TEXT,
    event_data JSONB DEFAULT '{}',
    lead_id UUID DEFAULT NULL,
    phone_number TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO analytics_events (
        organization_id,
        event_type,
        event_name,
        event_data,
        lead_id,
        phone_number
    ) VALUES (
        org_id,
        event_type,
        event_name,
        event_data,
        lead_id,
        phone_number
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log lead creation events
CREATE OR REPLACE FUNCTION log_lead_creation()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_analytics_event(
        NEW.organization_id,
        'lead_management',
        'lead_created',
        jsonb_build_object(
            'lead_source', NEW.lead_source,
            'phone_number', NEW.phone_number,
            'customer_name', NEW.customer_name
        ),
        NEW.id,
        NEW.phone_number
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for lead creation analytics
CREATE TRIGGER log_lead_creation_trigger AFTER INSERT ON leads
    FOR EACH ROW EXECUTE FUNCTION log_lead_creation();

-- Function to log conversation events
CREATE OR REPLACE FUNCTION log_conversation_event()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_analytics_event(
        NEW.organization_id,
        'conversation',
        'message_logged',
        jsonb_build_object(
            'sent_by', NEW.sent_by,
            'message_type', NEW.message_type,
            'call_direction', NEW.call_direction,
            'intent_detected', NEW.intent_detected,
            'sentiment', NEW.sentiment
        ),
        NEW.lead_id,
        NEW.phone_number
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for conversation analytics
CREATE TRIGGER log_conversation_event_trigger AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION log_conversation_event();

-- Function to log appointment events
CREATE OR REPLACE FUNCTION log_appointment_event()
RETURNS TRIGGER AS $$
DECLARE
    event_name TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event_name := 'appointment_scheduled';
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        event_name := 'appointment_status_changed';
    ELSE
        RETURN NEW;
    END IF;
    
    PERFORM create_analytics_event(
        NEW.organization_id,
        'appointment',
        event_name,
        jsonb_build_object(
            'service_type', NEW.service_type,
            'appointment_datetime', NEW.appointment_datetime,
            'status', NEW.status,
            'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
        ),
        NEW.lead_id,
        NEW.customer_phone
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment analytics
CREATE TRIGGER log_appointment_event_trigger AFTER INSERT OR UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION log_appointment_event();

-- Function to auto-create leads from conversations
CREATE OR REPLACE FUNCTION auto_create_lead_from_conversation()
RETURNS TRIGGER AS $$
DECLARE
    existing_lead UUID;
    new_lead_id UUID;
BEGIN
    -- Check if lead already exists
    SELECT id INTO existing_lead
    FROM leads 
    WHERE organization_id = NEW.organization_id 
    AND phone_number_normalized = NEW.phone_number_normalized;
    
    -- If no lead exists, create one
    IF existing_lead IS NULL THEN
        INSERT INTO leads (
            organization_id,
            phone_number,
            phone_number_normalized,
            lead_source,
            lead_status
        ) VALUES (
            NEW.organization_id,
            NEW.phone_number,
            NEW.phone_number_normalized,
            'ai_phone_call',
            'new'
        ) RETURNING id INTO new_lead_id;
        
        -- Update the conversation with the new lead_id
        NEW.lead_id = new_lead_id;
    ELSE
        -- Update the conversation with existing lead_id
        NEW.lead_id = existing_lead;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create leads from conversations
CREATE TRIGGER auto_create_lead_trigger BEFORE INSERT ON conversations
    FOR EACH ROW 
    WHEN (NEW.lead_id IS NULL)
    EXECUTE FUNCTION auto_create_lead_from_conversation();

-- Function to update product popularity scores
CREATE OR REPLACE FUNCTION update_product_popularity()
RETURNS TRIGGER AS $$
BEGIN
    -- Increase popularity score for ordered products
    IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
        UPDATE products 
        SET popularity_score = popularity_score + NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update product popularity
CREATE TRIGGER update_product_popularity_trigger AFTER INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_product_popularity();

-- Function to validate business rules
CREATE OR REPLACE FUNCTION validate_business_rules()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate appointment times during business hours
    IF TG_TABLE_NAME = 'appointments' THEN
        -- Add business hour validation logic here
        IF EXTRACT(HOUR FROM NEW.appointment_datetime) < 9 OR 
           EXTRACT(HOUR FROM NEW.appointment_datetime) > 18 THEN
            RAISE EXCEPTION 'Appointments must be scheduled during business hours (9 AM - 6 PM)';
        END IF;
    END IF;
    
    -- Validate lead status transitions
    IF TG_TABLE_NAME = 'leads' AND TG_OP = 'UPDATE' THEN
        -- Prevent invalid status transitions
        IF OLD.lead_status = 'customer' AND NEW.lead_status IN ('new', 'contacted') THEN
            RAISE EXCEPTION 'Cannot downgrade customer status to %', NEW.lead_status;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply business rule validation
CREATE TRIGGER validate_appointment_rules BEFORE INSERT OR UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION validate_business_rules();

CREATE TRIGGER validate_lead_rules BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION validate_business_rules();

-- Function for cleanup of old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS VOID AS $$
BEGIN
    -- Clean up old analytics events (older than 2 years)
    DELETE FROM analytics_events 
    WHERE timestamp < CURRENT_DATE - INTERVAL '2 years';
    
    -- Clean up old conversations (older than 1 year) but keep important ones
    DELETE FROM conversations 
    WHERE timestamp < CURRENT_DATE - INTERVAL '1 year'
    AND escalated_to_human = false
    AND needs_followup = false;
    
    -- Archive completed call sessions older than 6 months
    UPDATE call_sessions 
    SET session_status = 'archived'
    WHERE ended_at < CURRENT_DATE - INTERVAL '6 months'
    AND session_status = 'completed';
    
    RAISE NOTICE 'Data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Create function to generate ID with prefix
CREATE OR REPLACE FUNCTION generate_prefixed_id(prefix TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN prefix || '_' || substring(gen_random_uuid()::text, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to send notification events (for integration with external systems)
CREATE OR REPLACE FUNCTION send_notification(
    notification_type TEXT,
    recipient TEXT,
    subject TEXT,
    message TEXT,
    metadata JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Insert into a notifications queue table (would need to be created)
    -- This is a placeholder for external notification system integration
    
    -- For now, just log to analytics events
    PERFORM create_analytics_event(
        (metadata->>'organization_id')::UUID,
        'notification',
        notification_type,
        jsonb_build_object(
            'recipient', recipient,
            'subject', subject,
            'message', message,
            'metadata', metadata
        )
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;