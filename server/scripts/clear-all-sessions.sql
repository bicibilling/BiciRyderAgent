-- Clear ALL active sessions from the database
-- Run this in Supabase SQL Editor to fix stuck sessions

-- 1. End all human control sessions
UPDATE human_control_sessions 
SET ended_at = NOW() 
WHERE ended_at IS NULL;

-- 2. Complete all active call sessions
UPDATE call_sessions 
SET 
  status = 'completed',
  ended_at = NOW()
WHERE status IN ('initiated', 'active');

-- 3. Show results
SELECT 
  'Human Control Sessions Cleared' as action,
  COUNT(*) as count
FROM human_control_sessions 
WHERE ended_at = NOW()::date
UNION ALL
SELECT 
  'Call Sessions Completed',
  COUNT(*)
FROM call_sessions
WHERE status = 'completed' 
  AND ended_at::date = NOW()::date;

-- 4. Verify no active sessions remain
SELECT 
  'Remaining Active Sessions' as check,
  COUNT(*) as count
FROM call_sessions
WHERE status IN ('initiated', 'active');