# BICI Voice Agent - Deployment Guide

## Required Environment Variables

Create a `.env` file in the server directory with these variables:

### ElevenLabs Configuration
```env
# Get from ElevenLabs Dashboard > API Keys
ELEVENLABS_API_KEY=sk_your_api_key_here

# Get from ElevenLabs Dashboard > Conversational AI > Your Agent
ELEVENLABS_AGENT_ID=agent_your_agent_id_here

# Get from ElevenLabs Dashboard > Phone Numbers
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_number_id_here

# Generate in ElevenLabs Dashboard > Webhooks
ELEVENLABS_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Twilio Configuration
```env
# Get from Twilio Console > Account Info
TWILIO_ACCOUNT_SID=ACyour_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here

# Your Twilio phone number
TWILIO_PHONE_NUMBER=+15145551234

# Your deployment URL for webhooks
TWILIO_WEBHOOK_URL=https://your-app.onrender.com/webhooks/twilio
```

### Supabase Configuration
```env
# Get from Supabase Dashboard > Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here
```

### Application Configuration
```env
# Production settings
NODE_ENV=production
PORT=3001

# Generate a secure random string (use: openssl rand -base64 32)
JWT_SECRET=your_secure_jwt_secret_here

# Your deployment URL
WEBHOOK_BASE_URL=https://your-app.onrender.com

# Human agent phone number for escalation
HUMAN_AGENT_NUMBER=+15145551234

# Organization settings
DEFAULT_ORG_ID=bici-main
DEFAULT_ORG_NAME=BICI Bike Store
```

## Webhook Configurations

### ElevenLabs Webhooks

In your ElevenLabs Dashboard:

1. **Conversation Initiation Webhook**
   - URL: `https://your-app.onrender.com/webhooks/elevenlabs/conversation-initiation`
   - Method: POST
   - Events: Conversation Started

2. **Post-Call Webhook**
   - URL: `https://your-app.onrender.com/webhooks/elevenlabs/post-call`
   - Method: POST
   - Events: Conversation Ended

### Twilio Webhooks

In your Twilio Console, configure your phone number:

1. **Voice Configuration (IMPORTANT)**
   - **When a call comes in:**
     - Webhook: `https://api.us.elevenlabs.io/twilio/inbound_call`
     - Method: POST
   - **NOTE:** This is ElevenLabs' endpoint, NOT your app's URL
   - The ElevenLabs service handles the voice call directly
   - Your app receives callbacks via ElevenLabs webhooks configured above

2. **SMS Webhook** 
   - **When a message comes in:**
     - URL: `https://your-app.onrender.com/webhooks/twilio/sms`
     - Method: POST
     - Type: Webhook

3. **SMS Status Callback**
   - URL: `https://your-app.onrender.com/webhooks/twilio/sms/status`
   - Method: POST

## Deployment Steps

### 1. Database Setup (Supabase)

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the migration from `database/001_initial_schema.sql`
4. Copy your API keys to the .env file

### 2. ElevenLabs Agent Setup

1. Create a new Conversational AI agent
2. Upload the knowledge base file: `knowledge-base/bici-store-info.md`
3. Configure the agent with these dynamic variables:
   - conversation_context
   - previous_summary
   - customer_name
   - customer_phone
   - lead_status
   - bike_interest
   - organization_name
   - organization_id
   - location_address
   - business_hours

4. Set the agent's system prompt:
```
You are a helpful AI assistant for BICI Bike Store. You have access to information about our store hours, services, bike inventory, and pricing.

Store Information:
- Location: {location_address}
- Hours: {business_hours}
- Customer: {customer_name} ({customer_phone})

Previous interactions: {previous_summary}
Current context: {conversation_context}

Your role is to:
1. Answer questions about our bikes, services, and store policies
2. Help customers book appointments for services or test rides
3. Provide pricing information and availability
4. Collect customer information when they express interest in a purchase
5. Transfer to a human agent if the customer requests it or for complex issues

Be friendly, professional, and helpful. If you don't know something, offer to have someone call them back.
```

### 3. Twilio Setup

1. Purchase a phone number in Twilio
2. Configure the phone number for ElevenLabs integration:
   - Follow: https://elevenlabs.io/docs/conversational-ai/integrations/twilio
3. Set up SMS webhooks as described above

### 4. Local Testing

```bash
# Install dependencies
cd bici
npm install
cd server && npm install
cd ../client && npm install

# Set up environment
cp server/.env.example server/.env
# Edit .env with your actual values

# Run development server
npm run dev
```

### 5. Production Deployment

Use the provided Render configuration files or deploy manually:

```bash
# Build the application
npm run build

# The server will serve both API and dashboard
npm start
```

## Verification Checklist

- [ ] Database tables created successfully
- [ ] ElevenLabs agent responds to test calls
- [ ] Twilio phone number receives calls
- [ ] SMS messages are received and processed
- [ ] Dashboard loads at root URL
- [ ] Real-time updates work (SSE connection)
- [ ] Lead creation from calls works
- [ ] Human escalation functions properly
- [ ] SMS automation triggers correctly

## Troubleshooting

### Calls not connecting
- Verify ElevenLabs agent is active
- Check Twilio-ElevenLabs integration
- Ensure webhook URLs are accessible

### SMS not working
- Check Twilio webhook configuration
- Verify phone number has SMS capability
- Review webhook signatures in logs

### Database errors
- Verify Supabase credentials
- Check RLS policies are disabled or configured
- Ensure migrations ran successfully

### Dashboard not loading
- Check build output includes client files
- Verify static file serving in server
- Check browser console for errors

## Support Resources

- ElevenLabs Docs: https://elevenlabs.io/docs
- Twilio Docs: https://www.twilio.com/docs
- Supabase Docs: https://supabase.com/docs
- GitHub Issues: https://github.com/divhit/bici/issues