-- Clean up database and fix issues
-- Run this script in Supabase SQL editor

-- 1. Update all initiated/active call sessions to completed (they're stale)
UPDATE call_sessions 
SET status = 'completed', 
    ended_at = NOW(),
    updated_at = NOW()
WHERE status IN ('initiated', 'active');

-- 2. Fix the customer name (Mark is the agent, not the customer)
UPDATE leads 
SET customer_name = NULL
WHERE customer_name = 'Mark';

-- 3. Optional: Clear all test data to start fresh
-- Uncomment the lines below if you want to clear everything

-- DELETE FROM conversations;
-- DELETE FROM conversation_summaries;
-- DELETE FROM call_sessions;
-- DELETE FROM human_control_sessions;
-- DELETE FROM sms_automation_log;
-- DELETE FROM leads;

-- 4. View current state
SELECT 'Active Sessions' as metric, COUNT(*) as count 
FROM call_sessions 
WHERE status IN ('initiated', 'active')
UNION ALL
SELECT 'Total Sessions', COUNT(*) 
FROM call_sessions
UNION ALL
SELECT 'Total Leads', COUNT(*) 
FROM leads
UNION ALL
SELECT 'Total Conversations', COUNT(*) 
FROM conversations;