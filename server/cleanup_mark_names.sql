-- Clean up the specific lead that has Mark incorrectly saved as customer name
-- Only for the phone number +16049085474 where ElevenLabs couldn't extract a real name

-- Update the specific lead - clear the incorrect customer_name
UPDATE leads 
SET customer_name = NULL,
    updated_at = NOW()
WHERE phone_number_normalized = '16049085474'
  AND customer_name = 'Mark';

-- You can also run this more broadly if needed:
-- UPDATE leads 
-- SET customer_name = NULL,
--     updated_at = NOW()
-- WHERE customer_name = 'Mark'
--   AND id IN (
--     SELECT DISTINCT lead_id 
--     FROM conversation_summaries 
--     WHERE summary LIKE '%agent%Mark%BICI%'
--   );

-- Show current state of the lead that was having issues
SELECT id, customer_name, phone_number, status, created_at, updated_at
FROM leads
WHERE phone_number_normalized = '16049085474';