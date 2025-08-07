# Deployment Checklist for BICI Voice Agent

## 1. Database Migrations Required

Run the migrations in this order:
1. Execute `MIGRATION_REQUIRED.sql` in Supabase SQL editor
2. Execute `VERIFY_SCHEMA.sql` to confirm everything is correct

## 2. Environment Variables to Set on Render

### Required Variables
```bash
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=your_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id
ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+17786528784
TWILIO_WEBHOOK_URL=https://bici-voice-agent.onrender.com/webhooks/twilio

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Application Configuration
NODE_ENV=production
PORT=10000
JWT_SECRET=your_jwt_secret
WEBHOOK_BASE_URL=https://bici-voice-agent.onrender.com

# Store Information (NEW - Add these!)
STORE_NAME=BICI Bike Store
STORE_ADDRESS=1497 Adanac Street, Vancouver, BC
STORE_EMAIL=info@bici.cc
STORE_WEBSITE=https://www.bici.cc
```

## 3. ElevenLabs Dashboard Configuration

### Update First Message with Dynamic Variables
In your ElevenLabs agent settings, update the first message to:
```
{{time_greeting}} I'm Mark from BICI. {{customer_greeting}}! {{greeting_variation}} today?
```

Or for a simpler version:
```
Hey {{customer_greeting}}! Mark from BICI here - what can I help you with today?
```

### Available Dynamic Variables
- `{{time_greeting}}` - Good morning/afternoon/evening
- `{{customer_greeting}}` - Customer name or "there"
- `{{day_context}}` - Weekend/Friday specific messages
- `{{greeting_variation}}` - Alternates between different endings
- `{{weather_context}}` - Season-appropriate greetings

## 4. Database Schema Changes Summary

### Changed Fields
- **conversations.type**: Now only allows 'voice' or 'sms' (removed 'text')
- **conversation_summaries.conversation_type**: New field to track voice vs SMS

### Added Constraints
- Foreign key constraints with CASCADE delete on:
  - conversations.lead_id → leads.id
  - conversation_summaries.lead_id → leads.id
  - call_sessions.lead_id → leads.id

## 5. Code Changes Summary

### Configuration Updates
- Store address: `1497 Adanac Street, Vancouver, BC`
- Store hours: Mon-Fri 8am-6pm, Sat-Sun 9am-4:30pm
- All store info now configurable via environment variables

### New Features
- Dynamic greeting generation based on time/day/customer
- Customer name clearing when ElevenLabs can't extract it
- Better cross-channel context sharing (voice + SMS)

### Bug Fixes
- Fixed conversation type constraint violations
- Fixed incorrect customer name extraction (agent name as customer)
- Fixed orphaned conversations in database

## 6. Testing Checklist

After deployment, test:
- [ ] Voice call - verify greeting uses correct time of day
- [ ] SMS conversation - verify context carries over from voice
- [ ] Customer name extraction - should not save "Mark"
- [ ] Store hours in responses - should be Mon-Fri 8-6
- [ ] Store address in responses - should be 1497 Adanac Street

## 7. Monitoring

Check logs for:
- Database constraint violations (should be none)
- ElevenLabs webhook errors
- Orphaned conversations (run VERIFY_SCHEMA.sql periodically)

## 8. Rollback Plan

If issues occur:
1. Previous code is in git history
2. Database changes are additive (can keep them)
3. Environment variables can be reverted