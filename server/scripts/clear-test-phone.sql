-- Clear all conversation data for test phone number 6049085474
-- Run this in Supabase SQL Editor

-- First, get the lead ID for this phone number
WITH lead_info AS (
  SELECT id, customer_name, phone_number 
  FROM leads 
  WHERE phone_number_normalized = '16049085474'
)

-- Delete all related data
DELETE FROM conversations 
WHERE lead_id IN (SELECT id FROM lead_info);

DELETE FROM conversation_summaries 
WHERE lead_id IN (SELECT id FROM lead_info);

DELETE FROM call_sessions 
WHERE lead_id IN (SELECT id FROM lead_info);

-- Optional: Reset the lead to fresh state (uncomment if needed)
-- UPDATE leads 
-- SET 
--   customer_name = NULL,
--   status = 'new',
--   sentiment = 'neutral',
--   bike_interest = '{}',
--   qualification_data = '{"ready_to_buy": false, "contact_preference": "phone"}',
--   last_contact_at = NULL,
--   updated_at = NOW()
-- WHERE phone_number_normalized = '16049085474';

-- Show what was deleted
SELECT 
  'Cleared data for phone: +16049085474' as message;