-- SCHEMA VERIFICATION SCRIPT
-- Run this to verify your database schema matches the application requirements

-- ============================================
-- CHECK REQUIRED TABLES EXIST
-- ============================================
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('leads', 'conversations', 'conversation_summaries', 'call_sessions', 'organizations', 'human_control_sessions')
        THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('leads', 'conversations', 'conversation_summaries', 'call_sessions', 'organizations', 'human_control_sessions')
ORDER BY table_name;

-- ============================================
-- VERIFY CONVERSATIONS TABLE SCHEMA
-- ============================================
-- Expected fields based on TypeScript interface
WITH expected_fields AS (
    SELECT unnest(ARRAY[
        'id', 'organization_id', 'lead_id', 'phone_number', 
        'phone_number_normalized', 'content', 'sent_by', 'type',
        'classification', 'call_classification', 'timestamp', 'metadata'
    ]) as field_name
),
actual_fields AS (
    SELECT column_name as field_name
    FROM information_schema.columns
    WHERE table_name = 'conversations'
)
SELECT 
    e.field_name,
    CASE 
        WHEN a.field_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM expected_fields e
LEFT JOIN actual_fields a ON e.field_name = a.field_name
ORDER BY e.field_name;

-- ============================================
-- VERIFY TYPE CONSTRAINTS
-- ============================================
-- Check conversation type values
SELECT 
    'conversations.type' as constraint_check,
    pg_get_constraintdef(oid) as constraint_definition,
    CASE 
        WHEN pg_get_constraintdef(oid) LIKE '%voice%' 
         AND pg_get_constraintdef(oid) LIKE '%sms%'
         AND pg_get_constraintdef(oid) NOT LIKE '%text%'
        THEN '✅ CORRECT (voice, sms only)'
        ELSE '❌ INCORRECT - should be (voice, sms) only'
    END as status
FROM pg_constraint 
WHERE conname = 'conversations_type_check';

-- Check sent_by values
SELECT DISTINCT sent_by, COUNT(*) as count
FROM conversations
GROUP BY sent_by
ORDER BY sent_by;

-- ============================================
-- VERIFY CONVERSATION_SUMMARIES TABLE
-- ============================================
WITH expected_summary_fields AS (
    SELECT unnest(ARRAY[
        'id', 'organization_id', 'lead_id', 'phone_number',
        'summary', 'key_points', 'next_steps', 'sentiment_score',
        'call_classification', 'conversation_type', 'created_at'
    ]) as field_name
),
actual_summary_fields AS (
    SELECT column_name as field_name
    FROM information_schema.columns
    WHERE table_name = 'conversation_summaries'
)
SELECT 
    e.field_name,
    CASE 
        WHEN a.field_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM expected_summary_fields e
LEFT JOIN actual_summary_fields a ON e.field_name = a.field_name
ORDER BY e.field_name;

-- ============================================
-- VERIFY LEADS TABLE
-- ============================================
WITH expected_lead_fields AS (
    SELECT unnest(ARRAY[
        'id', 'organization_id', 'customer_name', 'phone_number',
        'phone_number_normalized', 'email', 'status', 'sentiment',
        'bike_interest', 'qualification_data', 'last_contact_at'
    ]) as field_name
),
actual_lead_fields AS (
    SELECT column_name as field_name
    FROM information_schema.columns
    WHERE table_name = 'leads'
)
SELECT 
    e.field_name,
    CASE 
        WHEN a.field_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM expected_lead_fields e
LEFT JOIN actual_lead_fields a ON e.field_name = a.field_name
ORDER BY e.field_name;

-- ============================================
-- CHECK FOREIGN KEY RELATIONSHIPS
-- ============================================
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('conversations', 'conversation_summaries', 'call_sessions')
ORDER BY tc.table_name;

-- ============================================
-- DATA INTEGRITY CHECKS
-- ============================================
-- Check for invalid conversation types
SELECT 
    'Invalid conversation types' as issue,
    COUNT(*) as count
FROM conversations
WHERE type NOT IN ('voice', 'sms');

-- Check for orphaned records
SELECT 
    'Orphaned conversations (no lead)' as issue,
    COUNT(*) as count
FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c.lead_id)
UNION ALL
SELECT 
    'Orphaned summaries (no lead)' as issue,
    COUNT(*)
FROM conversation_summaries cs
WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = cs.lead_id)
UNION ALL
SELECT 
    'Conversations with null lead_id' as issue,
    COUNT(*)
FROM conversations
WHERE lead_id IS NULL;