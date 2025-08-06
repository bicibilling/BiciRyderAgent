-- Business Functions for BICI Bike Store Operations
-- Optimized for 2,000+ monthly calls and multi-tenant architecture

-- Function to search for customers across multiple fields
CREATE OR REPLACE FUNCTION search_customers(
    org_id UUID,
    search_term TEXT,
    limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    customer_name VARCHAR,
    phone_number VARCHAR,
    email VARCHAR,
    lead_status VARCHAR,
    last_interaction_at TIMESTAMPTZ,
    total_interactions INTEGER,
    lead_quality_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.customer_name,
        l.phone_number,
        l.email,
        l.lead_status,
        l.last_interaction_at,
        l.total_interactions,
        l.lead_quality_score
    FROM leads l
    WHERE l.organization_id = org_id
    AND l.is_active = true
    AND (
        l.customer_name ILIKE '%' || search_term || '%' OR
        l.phone_number ILIKE '%' || search_term || '%' OR
        l.email ILIKE '%' || search_term || '%' OR
        l.phone_number_normalized ILIKE '%' || normalize_phone_number(search_term) || '%'
    )
    ORDER BY l.lead_quality_score DESC, l.last_interaction_at DESC NULLS LAST
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get customer conversation history
CREATE OR REPLACE FUNCTION get_customer_conversation_history(
    org_id UUID,
    customer_phone TEXT,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    sent_by VARCHAR,
    message_type VARCHAR,
    call_direction VARCHAR,
    sentiment VARCHAR,
    intent_detected VARCHAR,
    timestamp TIMESTAMPTZ,
    elevenlabs_conversation_id VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.content,
        c.sent_by,
        c.message_type,
        c.call_direction,
        c.sentiment,
        c.intent_detected,
        c.timestamp,
        c.elevenlabs_conversation_id
    FROM conversations c
    WHERE c.organization_id = org_id
    AND c.phone_number_normalized = normalize_phone_number(customer_phone)
    ORDER BY c.timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find or create lead by phone number
CREATE OR REPLACE FUNCTION find_or_create_lead(
    org_id UUID,
    phone TEXT,
    customer_name TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL,
    lead_source TEXT DEFAULT 'ai_phone_call'
)
RETURNS UUID AS $$
DECLARE
    lead_id UUID;
    normalized_phone TEXT;
BEGIN
    normalized_phone := normalize_phone_number(phone);
    
    -- Try to find existing lead
    SELECT id INTO lead_id
    FROM leads
    WHERE organization_id = org_id 
    AND phone_number_normalized = normalized_phone;
    
    -- If not found, create new lead
    IF lead_id IS NULL THEN
        INSERT INTO leads (
            organization_id,
            phone_number,
            phone_number_normalized,
            customer_name,
            email,
            lead_source,
            lead_status
        ) VALUES (
            org_id,
            phone,
            normalized_phone,
            customer_name,
            email,
            lead_source,
            'new'
        ) RETURNING id INTO lead_id;
    ELSE
        -- Update existing lead with new information if provided
        UPDATE leads 
        SET 
            customer_name = COALESCE(find_or_create_lead.customer_name, leads.customer_name),
            email = COALESCE(find_or_create_lead.email, leads.email),
            updated_at = now()
        WHERE id = lead_id;
    END IF;
    
    RETURN lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log conversation with automatic lead association
CREATE OR REPLACE FUNCTION log_conversation(
    org_id UUID,
    phone TEXT,
    content TEXT,
    sent_by TEXT,
    message_type TEXT DEFAULT 'voice',
    call_direction TEXT DEFAULT 'inbound',
    elevenlabs_conversation_id TEXT DEFAULT NULL,
    twilio_call_sid TEXT DEFAULT NULL,
    sentiment TEXT DEFAULT 'neutral',
    intent_detected TEXT DEFAULT NULL,
    customer_name TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    conversation_id UUID;
    lead_id UUID;
BEGIN
    -- Find or create lead
    lead_id := find_or_create_lead(org_id, phone, customer_name, email);
    
    -- Insert conversation
    INSERT INTO conversations (
        organization_id,
        lead_id,
        phone_number,
        phone_number_normalized,
        content,
        sent_by,
        message_type,
        call_direction,
        elevenlabs_conversation_id,
        twilio_call_sid,
        sentiment,
        intent_detected
    ) VALUES (
        org_id,
        lead_id,
        phone,
        normalize_phone_number(phone),
        content,
        sent_by,
        message_type,
        call_direction,
        elevenlabs_conversation_id,
        twilio_call_sid,
        sentiment,
        intent_detected
    ) RETURNING id INTO conversation_id;
    
    RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check product availability
CREATE OR REPLACE FUNCTION check_product_availability(
    org_id UUID,
    product_sku TEXT
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    brand VARCHAR,
    price DECIMAL,
    stock_quantity INTEGER,
    is_available BOOLEAN,
    reorder_needed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.brand,
        p.price,
        p.stock_quantity,
        (p.stock_quantity > p.reserved_quantity) as is_available,
        (p.stock_quantity <= p.reorder_level) as reorder_needed
    FROM products p
    WHERE p.organization_id = org_id
    AND p.sku = product_sku
    AND p.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get bike recommendations based on customer profile
CREATE OR REPLACE FUNCTION get_bike_recommendations(
    org_id UUID,
    customer_budget_min DECIMAL DEFAULT 0,
    customer_budget_max DECIMAL DEFAULT 999999,
    bike_type TEXT DEFAULT NULL,
    experience_level TEXT DEFAULT NULL,
    usage_type TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    brand VARCHAR,
    bike_type VARCHAR,
    price DECIMAL,
    popularity_score INTEGER,
    stock_quantity INTEGER,
    features TEXT[],
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.brand,
        p.bike_type,
        p.price,
        p.popularity_score,
        p.stock_quantity,
        p.features,
        -- Calculate match score based on criteria
        (
            CASE WHEN p.price BETWEEN customer_budget_min AND customer_budget_max THEN 30 ELSE 0 END +
            CASE WHEN p.bike_type = get_bike_recommendations.bike_type OR get_bike_recommendations.bike_type IS NULL THEN 25 ELSE 0 END +
            CASE WHEN p.experience_level = get_bike_recommendations.experience_level OR get_bike_recommendations.experience_level IS NULL THEN 20 ELSE 0 END +
            CASE WHEN p.stock_quantity > 0 THEN 15 ELSE 0 END +
            CASE WHEN p.is_featured THEN 10 ELSE 0 END
        )::INTEGER as match_score
    FROM products p
    WHERE p.organization_id = org_id
    AND p.is_active = true
    AND p.category = 'bikes'
    AND (get_bike_recommendations.bike_type IS NULL OR p.bike_type = get_bike_recommendations.bike_type)
    AND p.price BETWEEN customer_budget_min AND customer_budget_max
    ORDER BY match_score DESC, p.popularity_score DESC, p.price ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check appointment availability
CREATE OR REPLACE FUNCTION check_appointment_availability(
    org_id UUID,
    service_type TEXT,
    requested_date DATE,
    duration_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
    available_datetime TIMESTAMPTZ,
    slot_available BOOLEAN
) AS $$
DECLARE
    business_hours JSONB;
    day_name TEXT;
    start_hour INTEGER;
    end_hour INTEGER;
    current_time TIMESTAMPTZ;
    slot_time TIMESTAMPTZ;
BEGIN
    -- Get business hours for the organization
    SELECT settings->'business_hours' INTO business_hours
    FROM organizations 
    WHERE id = org_id;
    
    -- Get day name
    day_name := LOWER(to_char(requested_date, 'Day'));
    day_name := TRIM(day_name);
    
    -- Check if day is open
    IF (business_hours->day_name->>'closed')::boolean = true THEN
        RETURN;
    END IF;
    
    -- Get business hours for the day
    start_hour := EXTRACT(HOUR FROM (business_hours->day_name->>'open')::time);
    end_hour := EXTRACT(HOUR FROM (business_hours->day_name->>'close')::time);
    
    -- Generate available slots
    FOR hour_slot IN start_hour..end_hour-1 LOOP
        FOR minute_slot IN 0..1 LOOP
            slot_time := requested_date + (hour_slot || ' hours')::interval + (minute_slot * 30 || ' minutes')::interval;
            
            -- Check if slot is available (no existing appointments)
            IF NOT EXISTS (
                SELECT 1 FROM appointments 
                WHERE organization_id = org_id
                AND service_type = check_appointment_availability.service_type
                AND appointment_datetime <= slot_time
                AND appointment_datetime + (duration_minutes || ' minutes')::interval > slot_time
                AND status NOT IN ('cancelled', 'no_show')
            ) THEN
                RETURN QUERY SELECT slot_time, true;
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to book appointment
CREATE OR REPLACE FUNCTION book_appointment(
    org_id UUID,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    service_type TEXT,
    appointment_datetime TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    notes TEXT DEFAULT NULL,
    lead_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    appointment_id UUID;
    associated_lead_id UUID;
BEGIN
    -- Find or create lead if not provided
    IF lead_id IS NULL THEN
        associated_lead_id := find_or_create_lead(org_id, customer_phone, customer_name, customer_email);
    ELSE
        associated_lead_id := lead_id;
    END IF;
    
    -- Check availability first
    IF EXISTS (
        SELECT 1 FROM appointments 
        WHERE organization_id = org_id
        AND appointment_datetime <= book_appointment.appointment_datetime
        AND appointment_datetime + (duration_minutes || ' minutes')::interval > book_appointment.appointment_datetime
        AND status NOT IN ('cancelled', 'no_show')
    ) THEN
        RAISE EXCEPTION 'Time slot is not available';
    END IF;
    
    -- Insert appointment
    INSERT INTO appointments (
        organization_id,
        lead_id,
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        duration_minutes,
        notes,
        status
    ) VALUES (
        org_id,
        associated_lead_id,
        customer_name,
        customer_phone,
        customer_email,
        service_type,
        appointment_datetime,
        duration_minutes,
        notes,
        'scheduled'
    ) RETURNING id INTO appointment_id;
    
    RETURN appointment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get customer order history
CREATE OR REPLACE FUNCTION get_customer_order_history(
    org_id UUID,
    customer_phone TEXT,
    limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
    order_id UUID,
    order_number VARCHAR,
    order_date TIMESTAMPTZ,
    total_amount DECIMAL,
    order_status VARCHAR,
    payment_status VARCHAR,
    tracking_number VARCHAR,
    items_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.order_number,
        o.order_date,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.tracking_number,
        COUNT(oi.id) as items_count
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.organization_id = org_id
    AND o.customer_phone = normalize_phone_number(customer_phone)
    GROUP BY o.id, o.order_number, o.order_date, o.total_amount, o.order_status, o.payment_status, o.tracking_number
    ORDER BY o.order_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get analytics summary
CREATE OR REPLACE FUNCTION get_analytics_summary(
    org_id UUID,
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_calls INTEGER,
    total_leads INTEGER,
    qualified_leads INTEGER,
    appointments_booked INTEGER,
    conversion_rate DECIMAL,
    avg_response_time DECIMAL,
    top_call_reasons TEXT[]
) AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT 
        COUNT(DISTINCT cs.id)::INTEGER as call_count,
        COUNT(DISTINCT l.id)::INTEGER as lead_count,
        COUNT(DISTINCT CASE WHEN l.lead_quality_score >= 70 THEN l.id END)::INTEGER as qualified_count,
        COUNT(DISTINCT a.id)::INTEGER as appointment_count,
        CASE 
            WHEN COUNT(DISTINCT cs.id) > 0 
            THEN ROUND((COUNT(DISTINCT CASE WHEN l.lead_quality_score >= 70 THEN l.id END)::DECIMAL / COUNT(DISTINCT cs.id)) * 100, 2)
            ELSE 0 
        END as conv_rate,
        ROUND(AVG(cs.response_time_ms)::DECIMAL / 1000, 2) as avg_response
    INTO result
    FROM call_sessions cs
    LEFT JOIN leads l ON cs.lead_id = l.id
    LEFT JOIN appointments a ON l.id = a.lead_id AND a.created_at BETWEEN start_date AND end_date + INTERVAL '1 day'
    WHERE cs.organization_id = org_id
    AND cs.started_at BETWEEN start_date AND end_date + INTERVAL '1 day';
    
    -- Get top call reasons
    DECLARE
        reasons TEXT[];
    BEGIN
        SELECT ARRAY_AGG(initial_intent ORDER BY reason_count DESC)
        INTO reasons
        FROM (
            SELECT initial_intent, COUNT(*) as reason_count
            FROM call_sessions
            WHERE organization_id = org_id
            AND started_at BETWEEN start_date AND end_date + INTERVAL '1 day'
            AND initial_intent IS NOT NULL
            GROUP BY initial_intent
            ORDER BY reason_count DESC
            LIMIT 5
        ) t;
        
        RETURN QUERY SELECT 
            result.call_count,
            result.lead_count,
            result.qualified_count,
            result.appointment_count,
            result.conv_rate,
            result.avg_response,
            COALESCE(reasons, '{}');
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update lead status and track progression
CREATE OR REPLACE FUNCTION update_lead_status(
    lead_id UUID,
    new_status TEXT,
    notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    old_status TEXT;
    org_id UUID;
BEGIN
    -- Get current status and org_id
    SELECT lead_status, organization_id INTO old_status, org_id
    FROM leads WHERE id = lead_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;
    
    -- Update lead status
    UPDATE leads 
    SET 
        lead_status = new_status,
        updated_at = now()
    WHERE id = lead_id;
    
    -- Log the status change
    PERFORM create_analytics_event(
        org_id,
        'lead_management',
        'status_changed',
        jsonb_build_object(
            'lead_id', lead_id,
            'old_status', old_status,
            'new_status', new_status,
            'notes', notes
        ),
        lead_id
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;