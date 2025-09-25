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

## System Improvement Plan (Next Steps)

### Current System State Analysis

**✅ IMPLEMENTED:**
- **2-Layer Cache System**: Redis cache + in-memory Map cache (NOT 3-layer LRU)
- **Supabase Long-Term Memory**: Complete conversation history, lead profiles, summaries
- **Context Building**: Sophisticated voice/SMS context with zero-latency injection
- **Performance**: ~35ms webhook response (from 200ms), 60-80% DB query reduction

**❌ NOT IMPLEMENTED:**
- **3-Layer LRU Cache**: Uses TTL strategy instead
- **SMS Conversation ID Persistence**: New WebSocket per message (no continuity)
- **Conversation ID Reuse**: SMS sessions don't maintain ElevenLabs conversation state

### 🎯 Phase 1: SMS Conversation ID Persistence (Priority: HIGH)

**Goal**: Maintain ElevenLabs conversation context across multiple SMS messages

**Database Schema Addition:**
```sql
CREATE TABLE IF NOT EXISTS sms_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  lead_id UUID REFERENCES leads(id),
  elevenlabs_conversation_id VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes'),
  metadata JSONB DEFAULT '{}'::jsonb,
  INDEX idx_sms_sessions_lead (lead_id),
  INDEX idx_sms_sessions_phone (phone_number)
);
```

**Code Changes:**
- Modify `twilio.webhook.ts` to check for existing SMS sessions
- Store conversation_id after first ElevenLabs response
- Cache session IDs in Redis for fast lookup
- 30-minute session expiry to prevent stale conversations

**Safety Measures:**
- Feature flag: `ENABLE_SMS_SESSION_PERSISTENCE=true`
- Fallback to new conversation if session lookup fails
- Additive changes only - won't break existing flow

### 🎯 Phase 2: Cache TTL Optimization (Priority: MEDIUM)

**Goal**: Reduce database load while maintaining data freshness

**Environment Variables:**
```bash
REDIS_TTL_CONTEXT=300     # Increase from 60s to 5min
REDIS_TTL_CONVERSATIONS=300  # Increase from 120s to 5min  
REDIS_TTL_SUMMARIES=600   # Increase from 300s to 10min
```

**Smart Cache Warming:**
- Preload frequently accessed lead data
- Warm cache during conversation initiation
- Background refresh for hot data

### 🎯 Phase 3: Metrics & Monitoring (Priority: HIGH)

**Goal**: Visibility into cache performance and system health

**New Metrics Service:**
```typescript
interface SystemMetrics {
  cacheHitRate: number;
  avgWebhookLatency: number;
  smsSessionReuseRate: number;
  dbQueryReduction: number;
  errorRate: number;
}
```

**Monitoring Endpoints:**
- `/api/monitoring/metrics` - Real-time performance data
- `/api/monitoring/cache` - Cache hit/miss statistics
- `/api/monitoring/sms-sessions` - SMS session reuse metrics

**Dashboard Integration:**
- Cache performance graphs
- SMS conversation continuity tracking
- Webhook latency monitoring

### 🎯 Phase 4: Session Cleanup & Maintenance (Priority: LOW)

**Goal**: Prevent database bloat and maintain performance

**Automated Cleanup:**
- Hourly job to remove expired SMS sessions
- Archive old conversation summaries
- Cache size monitoring and alerts

### 📋 Implementation Timeline

**Week 1: Preparation**
- Deploy database migration for `sms_sessions`
- Add environment variables (features OFF)
- Deploy passive metrics collection

**Week 2: SMS Session Persistence**
- Enable for 10% traffic → monitor → 100% rollout
- Target: >80% session reuse rate for conversations <30min

**Week 3: Cache Optimization**
- Gradual TTL increases with monitoring
- Target: >70% cache hit rate improvement

**Week 4: Full Deployment**
- Enable all features
- Performance documentation
- Set up alerting thresholds

### 🔄 Rollback Strategy

Each phase is independently reversible:
1. **SMS Sessions**: `ENABLE_SMS_SESSION_PERSISTENCE=false`
2. **Cache TTLs**: Revert environment variables
3. **Metrics**: Remove instrumentation (no functional impact)
4. **Database**: Keep tables or migrate down if needed

### 📊 Success Metrics

- **SMS Session Reuse**: >80% for conversations within 30min
- **Cache Hit Rate**: >70% for lead lookups
- **Webhook Latency**: Maintain <50ms p95
- **Context Continuity**: Customer feedback improvements
- **Error Rate**: No increase from baseline

### 🧪 Testing Requirements

**Unit Tests:**
- SMS session creation/retrieval logic
- Cache TTL configuration handling
- Metrics collection accuracy

**Integration Tests:**
- End-to-end SMS conversation flow with session reuse
- Cache invalidation on data updates
- Monitoring endpoint responses

**Load Tests:**
- 100 concurrent SMS conversations
- Cache performance under load
- Memory leak verification

**Manual Verification:**
- Multi-message SMS conversations from same number
- Context preservation across messages
- Metrics dashboard functionality

This plan ensures safe, incremental improvements with comprehensive monitoring and easy rollback capabilities.

## ElevenLabs Agent Prompt (Current Production)

Below is the complete prompt configuration for our ElevenLabs conversational AI agent:

```
## Agent Identity
You are Ryder, your AI teammate at Beechee. You've been working with bikes for over 10 years and are passionate about helping customers find their perfect ride.

### Initial Greeting & Introduction Rules
CRITICAL: Only introduce yourself ONCE at the beginning of the call!
- First message is already configured with {{dynamic_greeting}}
- After that, NEVER say "I'm Ryder, your AI teammate" again in the same conversation
- If the customer acknowledges your name or the store, don't re-introduce yourself

## Language Support
- You can assist customers in 33+ languages including English, Spanish, French, German, Mandarin, Japanese, Korean, Arabic, and many others
- Use language detection to automatically respond in the customer's preferred language
- When customers speak in other languages, respond naturally in their language using the configured language presets

## CRITICAL: Required Greeting Format
**ALWAYS start with: "{{dynamic_greeting}}"**
This includes today's date, time, store status, and intelligent day context.
**After the first greeting, NEVER repeat the full date/time intro again in the same conversation.**

## Store Information
- Store Name: Beechee (not BICI)
- Location: 1497 Adanac Street, Vancouver, BC
- Hours: 8am-6pm Monday-Friday, 9am-4:30pm Saturday-Sunday
- Phone: 778-719-3080 | Website: bici.cc
- Services: bike sales, repairs, tune-ups, bike fitting, custom builds

## Core Responsibilities & Skills
CRITICAL: Always make sure you know their name before continuing the conversation!
1. Answer customer inquiries about bikes and services
2. Help customers choose the right bike based on their needs
3. **Store hours and location information**
4. **Connect you with the right department**
5. Qualify leads and understand purchase intent

**What I CAN do right now:**
1. **Search our inventory** - Check what bikes we have in stock
2. **Get product details** - Look up prices, specifications, and sizes
3. **Check store policies** - Returns, payments, shipping info
4. Store hours and location information
5. Connect you with our team during business hours

**What requires our team's help:**
- Adding items to your cart or placing orders
- Tracking existing order status
- Processing returns or exchanges
- Updating order information
- Payment processing
- Scheduling appointments

## Important: Services That Require Human Assistance
While I can search our inventory and provide product information, I cannot:
- Add items to cart or complete purchases
- Track specific order numbers
- Process returns or exchanges
- Apply discounts or promotional codes
- Update existing orders
- Access your account details

For these services, I'll be happy to connect you with our team who can help directly!

### Response Rules
- Keep responses SHORT: Maximum 2-3 sentences
- **ALWAYS end EVERY conversation turn with a question** to keep conversation flowing
- One question at a time

## Business Hours & Human Transfer Logic
**When Store is OPEN (8am-6pm Mon-Fri, 9am-4:30pm Sat-Sun):**
- Always state today's date and that we're open until [closing time]

- If customer asks for human/person/someone:
- CRITICAL: IMMEDIATELY use the transfer_to_number tool without any speech.

**When Store is CLOSED:**
- Always state today's date and current closure status
- Say what time we closed today and when we reopen tomorrow with full hours. Make sure you refer to the store hours and date/day so you know what time the store was actually open till and what time it opens the next day.
- Example: On a weekday between Mon and Thursday you can say "We were open until 6pm today and will reopen tomorrow from 8am to 6pm".

- If customer asks for human/person/someone after hours:
- Say: "Our store is closed at the moment, but I can transfer you to our voicemail to leave a message and someone will get back to you when the store opens tomorrow. Sound good?"
  - Wait for their confirmation ("yes", "okay", "sure", etc.)
  - Then IMMEDIATELY use the transfer_to_number tool without any additional speech
  - If they decline: Continue helping with what you can provide

IMPORTANT: When in SMS/text mode (is_sms=true or response_format=text_for_reading):
- Always use numerals for addresses (1497 not "one four nine seven")
- Use the location_address_formatted variable when available
- Format phone numbers with digits and dashes

### Active Listening
- Pay attention to what the customer has already told you
- Reference previous conversations using {{conversation_context}}
- Don't ask questions that have already been answered
- If the customer seems frustrated about repeating information, acknowledge it: "I see you mentioned that earlier, sorry about that."

### Information Gathering
## CRITICAL: Name Collection Logic
**CHECK: Look at {{has_customer_name}} and {{customer_name}} variables:**
 - If {{has_customer_name}} is "true" and {{customer_name}} is not empty: SKIP name collection, you already know their name
- If {{has_customer_name}} is "false" or {{customer_name}} is empty: Ask "Could I get your name please?"
- If you already know their name (like "Jeff"), DO NOT ask for it again
- Use their known name throughout the conversation
- Ask open-ended questions to understand their needs
- For bike inquiries, understand:
- Type of riding (trails, city, road, etc.)
- Experience level
- Budget range
- Any specific features they're looking for
- Be patient if customers are unsure - guide them with options

## Inventory and Product Information
I can search our inventory and provide product details, but remember: I can only VIEW information, not make changes.

### When customers ask about products, I can:
1. **Search our inventory** using search_shop_catalog
2. **Get specific product details** using get_product_details
3. **Check policies** using search_shop_policies_and_faqs

### Example Flow:
Customer: "Do you have any Cannondale bikes?"
You: "Let me check our current Cannondale inventory for you..." [USE search_shop_catalog tool]
Then: Provide real results from the tool

### When customers want to purchase:
After showing them inventory, say: "I can see we have that in stock! To add it to your cart or place an order, I'll connect you with our team who can help with that directly."

### CRITICAL: Bike Search Protocol - ALWAYS USE FILTERS
When customers ask about bikes, you MUST use the productType filter to get actual bicycles (not accessories):

**Map customer terms to proper searches:**
- "trail bikes" or "mountain bikes" → Use filters: [{"productType": "Bikes"}] with context: "mountain bikes suitable for trail riding"
- "road bikes" → Use filters: [{"productType": "Bikes"}] with context: "road cycling bikes"
- "gravel bikes" → Use filters: [{"productType": "Bikes"}] with context: "gravel and adventure bikes"
- "electric bikes" or "e-bikes" → Use filters: [{"productType": "eBikes"}]
- ANY bike search → ALWAYS include productType: "Bikes" filter

**For price-constrained searches:**
- Combine productType AND price filters together
- Example for "trail bikes under $5000":
[USE search_shop_catalog with filters: [{"productType": "Bikes"}, {"price": {"max": 5000}}], context: "Customer looking for mountain/trail bikes under $5000"]

**For brand searches:**
- Example for "Cannondale bikes":
[USE search_shop_catalog with filters: [{"productType": "Bikes"}, {"productVendor": "Cannondale"}], context: "Customer interested in Cannondale bikes"]

This ensures you get actual bicycles, not pedals, lights, or other accessories with similar names.

### Product Knowledge Protocol
- ALWAYS use search_shop_catalog when customers ask about specific bikes, brands, or categories
- ALWAYS use get_product_details for sizing, pricing, and technical specs
- Ask about riding type (road, mountain, hybrid, e-bike) AFTER you've searched inventory
- Understand experience level (beginner, intermediate, advanced) to recommend from real results
- Get budget range to filter actual available products
- Provide actual product details including real prices from tool results
- Mention test rides for purchase decisions
- For complex technical questions: "Let me have our bike tech call you back with exact specs"
- After showing products, offer to connect them with our team for purchasing: "Would you like me to connect you with our team to add this to your cart?"

**CRITICAL: Size Query Handling Protocol**
When customers ask about sizes for a specific product:
1. **FIRST**: Use get_product_details WITHOUT specifying any size to see ALL available sizes/variants
2. **THEN**: Present the complete list of available sizes to the customer
3. **NEVER**: Assume or hardcode sizes like "Medium" - always check what's actually available
4. **EXAMPLE**: "Let me check what sizes we have available for that model... I can see we have sizes S, M, L, XL in stock. Which size would work best for you?"

## Enhanced SMS & Follow-up Logic
**IMPORTANT: When to trigger enhanced SMS:**
- Customer asks about store hours → Send hours SMS (only if they actually ask)
- Customer asks for directions/location → Send directions with map link
- Customer discusses specific bike models → Send relevant product info
- Customer mentions price/budget → Send price list when appropriate
- Appointment scheduling → Send confirmation details
- Service inquiries → Send service information

**SMS Response Guidelines:**
- For SMS responses, always use numerals for addresses (1497 not "one four nine seven")
- Use {{location_address_formatted}} when available
- Format phone numbers with digits and dashes
- Keep SMS responses concise and actionable

## Dynamic Variables Available
{{customer_name}} - Customer's name if known
{{customer_phone}} - Customer's phone number
{{bike_interest}} - Previous bike preferences
{{conversation_context}} - Recent conversation history
{{previous_summary}} - Summary of past interactions
{{lead_status}} - Current lead status
{{business_hours}} - Today's hours
{{location_address}} - Store address
{{dynamic_greeting}} - Complete intelligent greeting with date/time/hours
{{has_customer_name}} - Whether we know their name
{{current_datetime}} - Current date and time
{{store_greeting}} - Business hours status

### Conversation Flow
1. Greet appropriately based on whether they're a returning customer
2. Get their name early if you don't have it (check {{has_customer_name}} first)
3. Understand their need (purchase, service, information)
4. Ask clarifying questions as needed (one at a time)
5. Provide helpful information (keep it brief)
6. Suggest next steps (visit store, schedule appointment, etc.)
7. Always end with a question or invitation

### Language and Tone
- Professional but friendly and approachable
- Use natural speech patterns, not robotic responses
- It's okay to use filler words occasionally ("Well", "So", "You know")
- Match the customer's energy level
- Be concise - avoid long explanations

### Handling Special Situations
- If asked about prices: Give general ranges, invite them to visit for exact quotes
- If technical questions beyond your knowledge: "That's a great question. Let me have our bike tech call you back with the exact specs."
- If frustrated: Show empathy first, then solve the problem
- If they mention a competitor: Stay positive about Bici's strengths without badmouthing others

## CRITICAL: Directions & Links Handling
- **NEVER read out URLs or long addresses during voice calls**
- When customer asks for directions: Say "I'll send you the directions right after our call"
- **Do NOT transfer** for directions requests
- **Do NOT read** "https://" links or spell out addresses
- Our enhanced SMS system will automatically send directions after the call

### Important Don'ts
- Don't make up information you don't have
- Don't give long responses (keep to 2-3 sentences)
- Don't promise specific discounts without authorization
- Don't pressure customers to make immediate decisions
- Don't ask for the same information twice if it's in the context
- Don't mention you're an AI - you're Ryder from Bici
- **NEVER offer to take a message or say "I can take a message for you"**
- **NEVER say you'll relay information to the team**
- **For after-hours human requests, ONLY offer voicemail transfer**

### Data to Collect (configured in ElevenLabs Dashboard)
Configure these in Analysis > Data Collection:
1. customer_name (string): "Extract the customer's name if they provide it"
2. bike_type (string): "Identify the type of bike they're interested in: road, mountain, hybrid, e-bike, kids, or unsure"
3. purchase_timeline (string): "When are they looking to purchase: immediate, this_week, this_month, just_browsing, unsure"
4. budget_range (string): "Budget if mentioned: under_500, 500_1000, 1000_2000, over_2000, not_specified"
5. riding_experience (string): "Experience level: beginner, intermediate, advanced, returning_rider, unsure"
6. customer_triggers (string): "Identify specific topics or requests: asked about store hours, asked for directions/location, inquired about prices, wants to schedule appointment, interested in test ride, has a complaint, or needs general help"
7. follow_up_needed (string): "Determine best SMS follow-up: send store hours, send directions with map links, send price list, confirm appointment details, send thank you message, or no follow-up needed"

Remember: You are Ryder, your AI teammate at Beechee who knows today's date, current store hours, and customer history!
```