-- COMPREHENSIVE DATABASE MIGRATION SCRIPT
-- Run these migrations in your Supabase SQL editor in order
-- Date: 2024-08-07

-- ============================================
-- 1. FIX CONVERSATION TYPE CONSTRAINT
-- ============================================
-- The conversations table should only allow 'voice' or 'sms', not 'text'
-- First check current constraint:
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'conversations_type_check';

-- If it includes 'text', drop and recreate:
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS conversations_type_check;

ALTER TABLE conversations 
ADD CONSTRAINT conversations_type_check 
CHECK (type IN ('voice', 'sms'));

-- ============================================
-- 2. ADD CONVERSATION_TYPE TO SUMMARIES
-- ============================================
-- Add conversation_type column to track if summary is for voice or SMS
ALTER TABLE conversation_summaries 
ADD COLUMN IF NOT EXISTS conversation_type TEXT DEFAULT 'voice';

-- Update existing records based on context
UPDATE conversation_summaries 
SET conversation_type = 'voice' 
WHERE conversation_type IS NULL;

-- Add constraint for valid values
ALTER TABLE conversation_summaries 
DROP CONSTRAINT IF EXISTS conversation_type_check;

ALTER TABLE conversation_summaries 
ADD CONSTRAINT conversation_type_check 
CHECK (conversation_type IN ('voice', 'sms'));

-- ============================================
-- 3. CLEAN UP INCORRECT CUSTOMER NAMES
-- ============================================
-- Remove agent name "Mark" that was incorrectly saved as customer name
UPDATE leads 
SET customer_name = NULL,
    updated_at = NOW()
WHERE customer_name = 'Mark'
  AND phone_number_normalized = '16049085474';

-- ============================================
-- 4. CLEAN UP ORPHANED CONVERSATIONS
-- ============================================
-- Delete conversations that don't have a valid lead
DELETE FROM conversations 
WHERE lead_id NOT IN (SELECT id FROM leads)
   OR lead_id IS NULL;

-- Add foreign key constraint if not exists to prevent future orphans
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_lead_id_fkey;

ALTER TABLE conversations
ADD CONSTRAINT conversations_lead_id_fkey
FOREIGN KEY (lead_id) 
REFERENCES leads(id) 
ON DELETE CASCADE;

-- ============================================
-- 5. CLEAN UP ORPHANED SUMMARIES
-- ============================================
DELETE FROM conversation_summaries 
WHERE lead_id NOT IN (SELECT id FROM leads);

-- Add foreign key constraint if not exists
ALTER TABLE conversation_summaries
DROP CONSTRAINT IF EXISTS conversation_summaries_lead_id_fkey;

ALTER TABLE conversation_summaries
ADD CONSTRAINT conversation_summaries_lead_id_fkey
FOREIGN KEY (lead_id) 
REFERENCES leads(id) 
ON DELETE CASCADE;

-- ============================================
-- 6. CLEAN UP ORPHANED CALL SESSIONS
-- ============================================
DELETE FROM call_sessions 
WHERE lead_id NOT IN (SELECT id FROM leads);

-- Add foreign key constraint if not exists
ALTER TABLE call_sessions
DROP CONSTRAINT IF EXISTS call_sessions_lead_id_fkey;

ALTER TABLE call_sessions
ADD CONSTRAINT call_sessions_lead_id_fkey
FOREIGN KEY (lead_id) 
REFERENCES leads(id) 
ON DELETE CASCADE;

-- ============================================
-- 7. VERIFY SCHEMA
-- ============================================
-- Check conversations table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversations'
ORDER BY ordinal_position;

-- Check conversation_summaries table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversation_summaries'
ORDER BY ordinal_position;

-- Check all constraints
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN ('conversations', 'conversation_summaries', 'leads', 'call_sessions')
ORDER BY tc.table_name, tc.constraint_type;

-- ============================================
-- 8. FINAL CLEANUP - VERIFY NO ORPHANS
-- ============================================
SELECT 
    'Orphaned Conversations' as check_type,
    COUNT(*) as count
FROM conversations 
WHERE lead_id NOT IN (SELECT id FROM leads)
UNION ALL
SELECT 
    'Orphaned Summaries',
    COUNT(*)
FROM conversation_summaries 
WHERE lead_id NOT IN (SELECT id FROM leads)
UNION ALL
SELECT 
    'Orphaned Sessions',
    COUNT(*)
FROM call_sessions 
WHERE lead_id NOT IN (SELECT id FROM leads)
UNION ALL
SELECT 
    'Total Leads',
    COUNT(*)
FROM leads
UNION ALL
SELECT 
    'Total Conversations',
    COUNT(*)
FROM conversations;