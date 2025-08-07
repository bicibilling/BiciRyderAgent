# Webhook Debugging Guide

## Current Issues Identified

### 1. Organization Phone Number Mismatch
- Database has default org with phone: `+15145551234`
- This must match your actual Twilio phone number
- If they don't match, `getOrganizationByPhone()` fails

### 2. Webhook Signature Verification
- May be failing if `ELEVENLABS_WEBHOOK_SECRET` is not set correctly
- Check logs for "Invalid webhook signature" errors

### 3. Database Connection Issues
- Supabase credentials might be incorrect
- Check if database tables exist and are accessible

## Debugging Steps

### Step 1: Check Database Setup
1. Log into Supabase dashboard
2. Go to Table Editor
3. Verify `organizations` table exists with data:
   ```sql
   SELECT * FROM organizations;
   ```
4. Update the phone number to match your Twilio number:
   ```sql
   UPDATE organizations 
   SET phone_number = 'YOUR_ACTUAL_TWILIO_NUMBER' 
   WHERE id = 'b0c1b1c1-0000-0000-0000-000000000001';
   ```

### Step 2: Check Environment Variables
Verify these are set in Render:
- `ELEVENLABS_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `TWILIO_PHONE_NUMBER`

### Step 3: Monitor Logs
Check Render logs for these error patterns:
- "No organization found for phone:"
- "Invalid webhook signature"
- "Database connection error"
- "Failed to process call data"

### Step 4: Test Webhook Endpoints
Use curl to test webhooks:

```bash
# Test conversation initiation
curl -X POST https://bici-voice-agent.onrender.com/webhooks/elevenlabs/conversation-initiation \
  -H "Content-Type: application/json" \
  -d '{
    "caller_id": "+15551234567",
    "called_number": "YOUR_TWILIO_NUMBER",
    "conversation_id": "test-123"
  }'

# Test post-call
curl -X POST https://bici-voice-agent.onrender.com/webhooks/elevenlabs/post-call \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-123",
    "phone_number": "+15551234567",
    "transcript": "Test call",
    "analysis": {}
  }'
```

## Common Error Solutions

### Error: "No organization found for phone"
**Cause**: Phone number mismatch between database and Twilio
**Solution**: Update organization phone number in database

### Error: "Invalid webhook signature"
**Cause**: Wrong webhook secret
**Solution**: Check `ELEVENLABS_WEBHOOK_SECRET` in Render dashboard

### Error: "Database connection error"
**Cause**: Wrong Supabase credentials
**Solution**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### Error: "Failed to create lead"
**Cause**: Missing organization or database permissions
**Solution**: Check RLS policies are disabled or configured correctly

## Required Webhook URLs in ElevenLabs

Make sure these URLs are configured in ElevenLabs dashboard:
- Conversation Initiation: `https://bici-voice-agent.onrender.com/webhooks/elevenlabs/conversation-initiation`
- Post-Call: `https://bici-voice-agent.onrender.com/webhooks/elevenlabs/post-call`

## Required Twilio Configuration

Voice webhook should be: `https://api.us.elevenlabs.io/twilio/inbound_call`
SMS webhooks should point to your Render app.