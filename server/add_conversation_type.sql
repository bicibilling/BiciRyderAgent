-- Add conversation_type column to conversation_summaries table
ALTER TABLE conversation_summaries 
ADD COLUMN IF NOT EXISTS conversation_type TEXT DEFAULT 'voice';

-- Update existing records based on their context
UPDATE conversation_summaries 
SET conversation_type = 'voice' 
WHERE conversation_type IS NULL;

-- Add a check constraint to ensure valid values
ALTER TABLE conversation_summaries 
ADD CONSTRAINT conversation_type_check 
CHECK (conversation_type IN ('voice', 'sms', 'text'));