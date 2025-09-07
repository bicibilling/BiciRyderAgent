# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## BICI AI Voice Agent System

A comprehensive AI voice and SMS system for BICI Bike Store using ElevenLabs Conversational AI, Twilio telephony, Supabase database, and React dashboard. The system handles both voice calls and SMS messages with intelligent context preservation across channels.

## Development Commands

### Quick Start
```bash
# Install all dependencies (root, server, client)
npm run install:all

# Development mode (runs both server and client)
npm run dev

# Build for production (uses render-build.sh)
npm run build

# Alternative build command
npm run build:alt

# Start production server
npm start
```

### Individual Services
```bash
# Server development (TypeScript with hot reload using tsx)
cd server && npm run dev

# Client development (React + Vite)
cd client && npm run dev

# Server build only
cd server && npm run build

# Run tests (Jest with ts-jest)
cd server && npm test

# Individual server start (without client)
cd server && npm start
```

### Build Process
The project uses a custom build script (`render-build.sh`) that:
1. Cleans all `node_modules` directories
2. Installs root dependencies
3. Builds server (TypeScript compilation)
4. Builds client (Vite build with React + TypeScript)
5. Copies client build to `server/public/` for static serving
6. Prunes dev dependencies for production

### Testing and Development Scripts
```bash
# Clear test data
cd server && npm run script scripts/clear-test-data.sh

# Test API connections
cd server && npx tsx scripts/test-api-connections.ts

# Test remote APIs
cd server && scripts/test-remote-apis.sh
```

## ElevenLabs Agent Management

### Core CLI Commands
Uses ElevenLabs ConvAI CLI for agent management:

```bash
# Agent management
convai status                    # Check all agents status
convai sync --env prod          # Deploy agent configurations
convai fetch --dry-run          # Preview available agents
convai widget "Agent Name"      # Generate embed code

# Working with configurations
convai add agent "Name"         # Create new agent
convai templates list           # Show templates
```

### Agent Configuration Files
- `agents.json` - Defines agents and environments
- `convai.lock` - Tracks deployed agent IDs and hashes
- `agent_configs/prod/` - Production agent configurations with full prompts, tools, and webhooks

**Current Active Agent**: `agent_3801k4e43akwffn88rhkjq9z97nd` (Bike Agent New)
**Legacy Agents**: 
- `agent_4101k4e2k0z6f65a1cxha527ydmv` (BICI Voice Agent)
- `agent_9801k4dzaerfet3srneq5wfbd6kc` (Bike agent)

## Architecture Overview

### Unified Voice & SMS System
The system uses a **single ElevenLabs agent** for both voice calls and SMS messages:

**Voice Channel Flow:**
```
Twilio Phone → ElevenLabs Native Integration → Conversational AI Agent
```

**SMS Channel Flow:**
```
Twilio SMS → Webhook → WebSocket to ElevenLabs Agent → SMS Response
```

### Context Preservation Strategy
**Critical Pattern**: Context is maintained across channels using:

1. **Lead-based Context Storage**
   - Single lead record per phone number
   - All conversations (voice + SMS) linked to lead
   - Customer name, preferences, history preserved

2. **Dynamic Variable Injection** 
   - Zero-latency context via conversation initiation webhook
   - Real-time customer context, conversation history, business hours
   - Time-aware greetings ("Happy Friday!", "Hope you had a great weekend!")

3. **WebSocket Implementation for SMS**
   ```typescript
   // Key pattern: Never use text_only mode for SMS
   const initMessage = {
     type: 'conversation_initiation_client_data',
     dynamic_variables: { /* full context */ },
     client_data: { 
       channel: 'sms',  // Indicates SMS context
       phone_number, customer_phone, lead_id 
     }
   };
   ```

### Webhook Architecture

**ElevenLabs Webhooks:**
- `conversation_initiation` - Injects customer context at call/SMS start
- `post_call` - Processes conversation outcomes and updates lead data

**Twilio Webhooks:**
- SMS webhook processes incoming messages via WebSocket to ElevenLabs
- Voice calls use ElevenLabs native Twilio integration

**Signature Verification:**
- Phone calls: No signature validation (ElevenLabs doesn't sign call webhooks)
- SMS/other webhooks: HMAC SHA-256 validation with `ELEVENLABS_WEBHOOK_SECRET`

## Key Services Architecture

### Lead & Context Management
```typescript
// Lead lookup and context building pattern
const lead = await leadService.findOrCreateLead(phoneNumber, organizationId);
const conversationContext = await buildConversationContext(lead.id);
const greetingContext = generateGreetingContext(lead);
const dynamicGreeting = createDynamicGreeting(lead, currentTime, dayOfWeek, businessHours);
```

### Real-time Updates
- **SSE (Server-Sent Events)** for real-time dashboard updates
- **WebSocket connections** for ElevenLabs SMS integration
- **Broadcast system** for multi-client updates

### Services Structure
- `lead.service.ts` - Customer/lead management
- `conversation.service.ts` - Message storage and retrieval
- `callSession.service.ts` - Voice call session tracking
- `sms.service.ts` / `enhanced-sms.service.ts` - SMS automation
- `humanControl.service.ts` - Human agent takeover
- `realtime.service.ts` - SSE broadcasting

## Critical Patterns & Best Practices

### SMS WebSocket Implementation
**Never use `text_only: true`** - Use channel identification instead:
```typescript
// Correct approach
client_data: {
  channel: 'sms',           // Identifies as SMS
  conversation_context,     // Full context
  phone_number, lead_id     // Customer identification
}
```

### Dynamic Greeting Generation
Uses time-aware, customer-specific greetings:
```typescript
// Pacific timezone aware greetings
"Thanks for calling so late! John! Hope you're enjoying your weekend! 
I'm Ryder from BICI Bike Store. How can I help you today?"
```

### Conversation Context Building
Context includes:
- Customer interaction history
- Previous conversation summaries  
- Bike interests and preferences
- Purchase intent scoring
- Business hours and store information

### Environment Configuration
**Critical Environment Variables:**
```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=agent_3801k4e43akwffn88rhkjq9z97nd
ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id
ELEVENLABS_WEBHOOK_SECRET=wsec_[actual_secret]

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+17786528784

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Application Configuration
JWT_SECRET=generate_secure_secret
WEBHOOK_BASE_URL=https://bici-voice-agent.onrender.com
NODE_ENV=development|production
PORT=3001
```

## Data Models

### Core Entities
- **Organizations** - Multi-tenant support for bike stores
- **Leads** - Customer records with phone number as primary identifier  
- **Conversations** - Individual message/call records
- **CallSessions** - Voice call metadata and session tracking

### Lead Context Schema
```typescript
interface Lead {
  id: string;
  customer_name?: string;
  phone_number: string;
  bike_interest: any;
  previous_summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  last_contact_at: string;
  // ... additional fields
}
```

## Troubleshooting Common Issues

### SMS Not Working
1. Check WebSocket connection logs in `twilio.webhook.ts`
2. Verify `dynamic_greeting` variable is generated properly
3. Ensure agent ID matches `convai.lock` active agent
4. Check webhook signature validation isn't blocking SMS

### Voice Calls Failing
1. Verify ElevenLabs agent is active: `convai status`
2. Check webhook signature validation (calls don't have signatures)
3. Confirm Twilio integration with ElevenLabs is configured

### Context Not Preserving
1. Verify lead creation/lookup in logs
2. Check conversation context building in `elevenlabs.webhook.ts`
3. Ensure dynamic variables are being sent to ElevenLabs properly

### Agent Configuration Issues
1. Use `convai fetch --dry-run` to see current agent configs
2. Sync changes with `convai sync --env prod`
3. Verify agent ID in `.env` matches `convai.lock`

## Technology Stack

### Backend
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with WebSocket support
- **Database**: Supabase (PostgreSQL with RLS)
- **Real-time**: Server-Sent Events (SSE) + WebSocket for ElevenLabs
- **Logging**: Winston structured logging
- **Build**: TypeScript compilation with `tsc`
- **Development**: `tsx` for hot reload

### Frontend  
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom BICI branding
- **HTTP Client**: Axios for API calls
- **Real-time**: EventSource for SSE connections

### External Services
- **Voice AI**: ElevenLabs Conversational AI
- **Telephony**: Twilio (Phone + SMS)
- **Agent Management**: ElevenLabs ConvAI CLI
- **Deployment**: Render.com with custom build process

## File Structure Overview

```
├── server/src/
│   ├── app.ts                 # Express server setup
│   ├── config/                # Service configurations (Supabase, Twilio, ElevenLabs)
│   ├── services/              # Core business logic services
│   │   ├── lead.service.ts         # Customer/lead management
│   │   ├── conversation.service.ts # Message storage
│   │   ├── callSession.service.ts  # Call tracking
│   │   ├── sms.service.ts          # SMS automation
│   │   ├── humanControl.service.ts # Agent takeover
│   │   └── realtime.service.ts     # SSE broadcasting
│   ├── webhooks/              # Webhook handlers
│   │   ├── elevenlabs.webhook.ts   # ElevenLabs events
│   │   └── twilio.webhook.ts       # Twilio SMS events
│   ├── routes/                # API route handlers
│   └── utils/                 # Helpers (logger, greeting, analysis)
├── client/src/
│   ├── App.tsx               # Main React application
│   ├── components/           # React components
│   └── services/api.ts       # API client
├── agent_configs/            # ElevenLabs agent configurations
├── database/                 # SQL schemas and migrations
└── scripts/                 # Utility and build scripts
```

## Production Considerations

- **Webhook Security**: Enable signature validation for production
- **Lead Management**: Phone numbers are normalized for consistent lookup
- **Error Handling**: Comprehensive fallback responses for API failures
- **Logging**: Structured logging with Winston for debugging and monitoring
- **Rate Limiting**: Consider implementing for webhook endpoints
- **Database**: Uses Supabase with RLS policies for multi-tenancy
- **Deployment**: Uses Render.com with `render-build.sh` for atomic deployments
- **Static Assets**: Client built and served from `server/public/`