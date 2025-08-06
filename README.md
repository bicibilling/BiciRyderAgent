# BICI AI Voice Agent System - Milestone 1

## Overview
AI Voice Agent system for BICI Bike Store that handles customer calls and SMS using ElevenLabs Conversational AI and Twilio telephony integration.

## ✅ Milestone 1 Features Implemented

### Core Development
- ✅ ElevenLabs setup with bike store knowledge base
- ✅ Twilio inbound call routing and webhook configuration  
- ✅ Lead creation from caller ID with conversation logging
- ✅ Basic response system for store hours, location, policies
- ✅ Human escalation pathway with call transfer capability
- ✅ SMS automation based on conversation outcomes

### Data Capture
- ✅ Call classification (sales, support, service, etc.)
- ✅ Lead qualification data (bike interest, contact preferences)
- ✅ Conversation summaries and interaction history

### Dashboard
- ✅ Real-time call monitoring interface
- ✅ Lead management with conversation history
- ✅ Human takeover controls with context preservation
- ✅ BICI brand-consistent design (black/white/blue theme)

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x or higher
- npm or yarn
- Supabase account
- ElevenLabs account with Conversational AI access
- Twilio account with phone number

### 1. Clone and Install

```bash
cd bici
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies  
cd ../client
npm install
```

### 2. Environment Configuration

Copy the example environment file and update with your credentials:

```bash
cp server/.env.example server/.env
```

Update the following in `server/.env`:

```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=your_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id
ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Application
JWT_SECRET=generate_a_secure_secret
WEBHOOK_BASE_URL=https://your-domain.com
```

### 3. Database Setup

Run the database migration in Supabase:

```sql
-- Execute the SQL from database/001_initial_schema.sql in Supabase SQL editor
```

### 4. ElevenLabs Agent Configuration

1. Go to ElevenLabs Dashboard → Conversational AI
2. Create a new agent with these settings:
   - Name: "BICI Bike Store Assistant"
   - Voice: Choose a professional voice
   - First Message: "Hi! Thanks for calling BICI Bike Store. I'm here to help with any questions about our bikes, services, or to schedule an appointment. How can I assist you today?"

3. Configure Dynamic Variables:
   - conversation_context (String)
   - previous_summary (String)
   - customer_name (String)
   - customer_phone (String)
   - lead_status (String)
   - bike_interest (String)
   - organization_name (String)
   - organization_id (String)
   - location_address (String)
   - business_hours (String)

4. Set the System Prompt (use the template from the agent configuration section)

### 5. Webhook Configuration

#### ElevenLabs Webhooks
In ElevenLabs Dashboard, configure:
- Conversation Initiation: `https://your-domain.com/webhooks/elevenlabs/conversation-initiation`
- Post-Call: `https://your-domain.com/webhooks/elevenlabs/post-call`

#### Twilio Webhooks
In Twilio Console, configure your phone number:
- Voice: Use ElevenLabs native integration
- SMS Webhook: `https://your-domain.com/webhooks/twilio/sms`
- SMS Status Callback: `https://your-domain.com/webhooks/twilio/sms/status`

### 6. Start the Application

Development mode:
```bash
# Start both server and client
npm run dev
```

Production mode:
```bash
# Build the application
npm run build

# Start the server
npm start
```

The application will be available at:
- Dashboard: http://localhost:3000
- API Server: http://localhost:3001

## 📱 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     BICI AI Voice System                      │
├───────────────────────────┬─────────────────────────────────┤
│      Voice Channel        │        Digital Channel          │
├───────────────────────────┼─────────────────────────────────┤
│   Twilio Phone Number     │     SMS Webhook Handler        │
│           ↓               │              ↓                  │
│   ElevenLabs Native       │     Context Processor          │
│   Integration             │              ↓                  │
│           ↓               │     Response Generator         │
│   Conversational AI       │              ↓                  │
│   Agent                   │     SMS Automation            │
├───────────────────────────┴─────────────────────────────────┤
│                    Backend Services                          │
├───────────────────────────────────────────────────────────────┤
│  • Lead Management        • Conversation Logging            │
│  • Human Escalation       • Real-time Updates (SSE)         │
│  • Context Building       • Data Classification             │
├───────────────────────────────────────────────────────────────┤
│                    Supabase Database                         │
├───────────────────────────────────────────────────────────────┤
│                    React Dashboard                           │
└───────────────────────────────────────────────────────────────┘
```

## 🎯 Usage

### Making Test Calls
1. Call your Twilio phone number
2. The AI agent will answer and handle the conversation
3. Monitor the call in real-time on the dashboard

### Sending Test SMS
1. Send an SMS to your Twilio phone number
2. The system will process and respond automatically
3. View the conversation in the dashboard

### Human Takeover
1. Select a lead in the dashboard
2. Click "Join Chat" to take control
3. Send messages directly to the customer
4. Click "AI Resume" to hand back to AI

## 📊 API Endpoints

### Webhooks
- `POST /webhooks/elevenlabs/conversation-initiation` - Handle inbound calls
- `POST /webhooks/elevenlabs/post-call` - Process call results
- `POST /webhooks/twilio/sms` - Handle incoming SMS
- `POST /webhooks/twilio/sms/status` - SMS delivery status

### API Routes
- `GET /api/leads` - Get all leads
- `GET /api/leads/:id` - Get lead details
- `GET /api/conversations/:leadId` - Get conversations
- `POST /api/human-control/join` - Join human control
- `POST /api/human-control/leave` - Leave human control
- `POST /api/human-control/send-message` - Send human message
- `POST /api/elevenlabs/outbound-call` - Initiate outbound call
- `POST /api/sms/send` - Send SMS
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/stream/:clientId` - SSE connection for real-time updates

## 🔧 Troubleshooting

### Common Issues

1. **Calls not connecting**
   - Verify ElevenLabs agent is active
   - Check Twilio phone number configuration
   - Ensure webhooks are accessible

2. **SMS not working**
   - Verify Twilio SMS webhook URL
   - Check phone number SMS capability
   - Review webhook signatures

3. **Database errors**
   - Verify Supabase credentials
   - Check RLS policies
   - Run migrations

## 📝 Next Steps (Future Milestones)

### Milestone 2: Live Data Integration & Customer Recognition
- Customer identification via phone number lookup
- Conversation memory and context preservation
- Shopify API integration for real-time order status
- Intelligent escalation based on conversation complexity

### Milestone 3: Outbound Calling and Human in the Loop
- Google/MS Calendar integration
- Appointment booking automation
- Advanced human-AI collaboration
- Performance analytics

## 📞 Support

For issues or questions about the implementation, please refer to:
- ElevenLabs Documentation: https://elevenlabs.io/docs
- Twilio Documentation: https://www.twilio.com/docs
- Supabase Documentation: https://supabase.com/docs

## License

© 2024 BICI Bike Store. All rights reserved.