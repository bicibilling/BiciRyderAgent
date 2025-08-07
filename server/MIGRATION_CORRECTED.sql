-- CORRECTED DATABASE MIGRATION SCRIPT
-- Based on actual Supabase schema
-- Date: 2024-08-07

-- ============================================
-- 1. FIX CONVERSATIONS SENT_BY TO ALLOW HUMAN_AGENT
-- ============================================
-- The code uses 'human_agent' but database doesn't allow it
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS conversations_sent_by_check;

ALTER TABLE conversations 
ADD CONSTRAINT conversations_sent_by_check 
CHECK (sent_by IN ('user', 'agent', 'system', 'human_agent'));

-- ============================================
-- 2. CONVERSATION_TYPE ALREADY EXISTS - Just verify
-- ============================================
-- The conversation_summaries table already has conversation_type
-- Current constraint allows 'voice', 'sms', 'text'
-- Our code now uses only 'voice' and 'sms', but 'text' is harmless to keep

-- No action needed - field exists and works

-- ============================================
-- 3. CLEAN UP INCORRECT CUSTOMER NAMES
-- ============================================
-- Remove agent name "Mark" that was incorrectly saved as customer name
UPDATE leads 
SET customer_name = NULL,
    updated_at = NOW()
WHERE customer_name = 'Mark'
  AND phone_number_normalized = '16049085474';

-- Optionally clean up any "Mark" names that look suspicious
-- (only if there are recent calls with agent saying "I'm Mark")
UPDATE leads 
SET customer_name = NULL,
    updated_at = NOW()  
WHERE customer_name = 'Mark'
  AND id IN (
    SELECT DISTINCT lead_id 
    FROM conversations 
    WHERE content LIKE '%I''m Mark from BICI%'
       OR content LIKE '%Mark here from BICI%'
  );

-- ============================================
-- 4. CLEAN UP ORPHANED RECORDS (if any exist)
-- ============================================
-- Check for orphaned conversations first
SELECT COUNT(*) as orphaned_count
FROM conversations 
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads);

-- Only delete if orphans exist
DELETE FROM conversations 
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads);

-- Same for summaries
DELETE FROM conversation_summaries 
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads);

-- Same for call sessions
DELETE FROM call_sessions 
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads);

-- ============================================
-- 5. VERIFY DATA INTEGRITY
-- ============================================
-- Check current data state
SELECT 
    'Total Leads' as metric,
    COUNT(*) as count
FROM leads
UNION ALL
SELECT 
    'Total Conversations',
    COUNT(*)
FROM conversations
UNION ALL
SELECT 
    'Conversations with type=text',
    COUNT(*)
FROM conversations
WHERE type = 'text'
UNION ALL
SELECT 
    'Conversations with type=system', 
    COUNT(*)
FROM conversations
WHERE type = 'system'
UNION ALL
SELECT 
    'Conversations with sent_by=human_agent',
    COUNT(*)
FROM conversations
WHERE sent_by = 'human_agent'
UNION ALL
SELECT 
    'Orphaned Conversations',
    COUNT(*)
FROM conversations
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads)
UNION ALL
SELECT 
    'Leads named Mark',
    COUNT(*)
FROM leads
WHERE customer_name = 'Mark';

-- ============================================
-- 6. NO NEED TO CHANGE TYPE CONSTRAINTS
-- ============================================
-- The database allows more types than our code uses, which is fine:
-- - conversations.type allows: voice, sms, email, system (we only use voice/sms)
-- - conversation_summaries.conversation_type allows: voice, sms, text (we only use voice/sms)
-- This is not a problem - the database is more permissive than needed