-- Database cleanup script for BICI AI Voice Agent
-- Run this to clean up incorrect data and conversation history

-- 1. First, let's see what we have for the problematic lead
SELECT 
  id,
  customer_name,
  phone_number,
  status,
  bike_interest,
  qualification_data,
  created_at,
  last_contact_at
FROM leads 
WHERE id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23';

-- 2. Check conversations for this lead
SELECT 
  id,
  content,
  sent_by,
  type,
  call_classification,
  timestamp
FROM conversations 
WHERE lead_id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23'
ORDER BY timestamp DESC;

-- 3. Check call sessions for this lead
SELECT 
  id,
  elevenlabs_conversation_id,
  status,
  started_at,
  ended_at,
  duration_seconds,
  metadata
FROM call_sessions 
WHERE lead_id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23'
ORDER BY started_at DESC;

-- 4. Fix the incorrect customer name (remove "looking for")
UPDATE leads 
SET customer_name = NULL 
WHERE id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23' 
AND customer_name = 'looking for';

-- Also fix any other leads with this bad name
UPDATE leads 
SET customer_name = NULL 
WHERE customer_name IN ('looking for', 'Mark', 'mark', 'Looking for', 'LOOKING FOR');

-- 5. Delete all conversation history for the specific lead
DELETE FROM conversations 
WHERE lead_id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23';

-- 6. Delete all conversation summaries for the specific lead
DELETE FROM conversation_summaries 
WHERE lead_id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23';

-- 7. Close any active call sessions for this lead
UPDATE call_sessions 
SET status = 'completed', 
    ended_at = NOW(),
    metadata = COALESCE(metadata, '{}')::jsonb || '{"manual_cleanup": true}'::jsonb
WHERE lead_id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23' 
AND status IN ('initiated', 'active');

-- 8. Check for any other problematic customer names
SELECT DISTINCT customer_name, COUNT(*) as count
FROM leads 
WHERE customer_name IS NOT NULL
GROUP BY customer_name
ORDER BY count DESC;

-- 9. Clean up any other bad customer names found in the system
UPDATE leads 
SET customer_name = NULL 
WHERE customer_name IN (
  'agent', 'Agent', 'AGENT',
  'system', 'System', 'SYSTEM',
  'looking', 'Looking', 'LOOKING',
  'for', 'For', 'FOR',
  'bike', 'Bike', 'BIKE',
  'store', 'Store', 'STORE'
);

-- 10. Cleanup any stale call sessions older than 1 hour
UPDATE call_sessions 
SET status = 'completed',
    ended_at = NOW(),
    metadata = COALESCE(metadata, '{}')::jsonb || '{"cleanup_reason": "stale_session"}'::jsonb
WHERE status IN ('initiated', 'active')
AND started_at < NOW() - INTERVAL '1 hour';

-- 11. Final verification - show the cleaned lead
SELECT 
  id,
  customer_name,
  phone_number,
  status,
  bike_interest,
  qualification_data,
  created_at,
  last_contact_at
FROM leads 
WHERE id = 'c17edfb8-48d9-4a4e-b24f-556934e37e23';