-- Clean up incorrectly saved agent names from customer_name field
-- Mark is the AI agent's name, not the customer's name

-- Update leads table - set customer_name to NULL where it's incorrectly set to Mark
UPDATE leads 
SET customer_name = NULL,
    updated_at = NOW()
WHERE customer_name IN ('Mark', 'mark', 'MARK', 'Agent', 'agent', 'Hey', 'hey')
  AND customer_name IS NOT NULL;

-- Log how many records were updated
SELECT COUNT(*) as records_cleaned 
FROM leads 
WHERE customer_name IN ('Mark', 'mark', 'MARK', 'Agent', 'agent', 'Hey', 'hey');

-- Show current state of the lead that was having issues
SELECT id, customer_name, phone_number, status, created_at, updated_at
FROM leads
WHERE phone_number_normalized = '16049085474';