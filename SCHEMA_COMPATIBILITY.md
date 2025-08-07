# Schema Compatibility Guide

## Current vs Expected Schema

Your existing schema has most of the needed tables but with different column names and structures. Here's what needs to be updated:

### Key Differences:

1. **Leads Table**:
   - ✅ You have: `phone_number_normalized` 
   - ❌ App expects: `phone_number` (adding this)
   - ✅ You have: `lead_status`
   - ❌ App expects: `status` (mapping values)

2. **Missing Tables**:
   - ❌ `call_sessions` - tracks individual calls
   - ❌ `conversation_summaries` - stores AI-generated call summaries  
   - ❌ `human_control_sessions` - manages human takeover
   - ❌ `sms_automation_log` - logs automated SMS

3. **Organization Phone**:
   - ❌ Your org might not have the correct phone number (+17786528784)

## Migration Steps:

### Step 1: Run the Migration SQL
Copy and paste the contents of `MIGRATION_FROM_EXISTING.sql` into your Supabase SQL Editor and run it.

### Step 2: Verify the Migration
After running the migration, check:

```sql
-- Verify default organization exists with correct phone
SELECT * FROM organizations WHERE phone_number = '+17786528784';

-- Check leads table has required columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'leads' AND table_schema = 'public';

-- Verify new tables were created
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('call_sessions', 'conversation_summaries', 'human_control_sessions', 'sms_automation_log');
```

### Step 3: Test Database Connection
Visit: https://bici-voice-agent.onrender.com/health/db

Should show your organization with phone +17786528784.

### Step 4: Update Environment Variables in Render
Make sure these match:
```
TWILIO_PHONE_NUMBER=+17786528784
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_service_role_key (not anon key!)
```

## Data Mapping:

The migration handles these automatically:

| Your Schema | App Expected | Mapping |
|-------------|--------------|---------|
| `lead_status` | `status` | new→new, contacted→contacted, qualified→qualified, converted→customer, lost→closed |
| `phone_number_normalized` | `phone_number` | Copied over |
| `last_contact_date` | `last_contact_at` | Copied over |

## Post-Migration Test:

1. **Database Health**: `curl https://bici-voice-agent.onrender.com/health/db`
2. **Webhook Test**: `curl -X POST https://bici-voice-agent.onrender.com/webhooks/elevenlabs/conversation-initiation -H "Content-Type: application/json" -d '{"caller_id": "+15551234567", "called_number": "+17786528784", "conversation_id": "test-123"}'`

The migration preserves all your existing data while adding the missing pieces the BICI app needs.