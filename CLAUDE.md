# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI-based AI Voice Agent System for bike stores, derived from the original BICI Voice Agent. The system features:
- ElevenLabs Conversational AI for voice interactions
- Twilio telephony integration for calls and SMS
- React dashboard for real-time monitoring
- Supabase database for data persistence  
- Human-in-the-loop agent transfer capabilities
- Real-time updates via Server-Sent Events (SSE)

This implementation focuses on **incoming voice calls with seamless human agent transfer** as the primary feature.

## Architecture

The project follows a monorepo structure with separate client and server applications:

```
bici-cli-agent/
├── client/             # React dashboard (Vite + JSX, port 3000/5173)
├── server/             # Express.js API server (Node.js, port 3002)
├── mcp-servers/        # Model Context Protocol integrations
├── agent_configs/      # ElevenLabs agent configurations (dev/prod/staging)
├── test-*.js          # Comprehensive test suite files
├── run-tests.js       # Main test runner
└── tools.json         # Agent tool definitions
```

### Key Components

**Server (`server/src/`):**
- `app.js` - Main Express application with CORS, body parsing, and route setup
- `routes/` - API endpoints (agent.js, humanControl.js, tools.js)
- `services/` - Business logic (conversationStore.js, customerMemory.js, storeHours.js)
- `webhooks/` - ElevenLabs and Twilio webhook handlers (elevenlabs.js, twilio.js)

**Client (`client/src/`):**
- `App.jsx` - Main dashboard component with React hooks
- `components/` - AgentTester.jsx, Analytics.jsx, ConversationPanel.jsx, Header.jsx, HumanControlPanel.jsx, PromptEditor.jsx, StatusCard.jsx
- `services/api.js` - Axios-based API client for backend communication
- Tailwind CSS styling with professional Bici branding

**MCP Servers (`mcp-servers/`):**
- `elevenlabs-server.js` - ElevenLabs integration MCP server (CommonJS, needs ES module conversion)
- `twilio-server.js` - Twilio integration MCP server (CommonJS, needs ES module conversion)
- `package.json` - MCP dependencies including @modelcontextprotocol/sdk v0.6.0

### Critical Services for Human-in-the-Loop

**Human Control Service (`humanControl.service.ts`):**
- Manages human agent sessions and context handoffs
- Queues messages during transfer process
- Preserves conversation context for seamless transitions
- Handles real-time notifications to human agents

**Conversation Context Building:**
- Builds comprehensive conversation history for human agents
- Includes previous summaries, customer preferences, interaction patterns
- Provides sentiment analysis and lead qualification data
- Real-time context updates during conversations

## Database Schema (Supabase)

The actual production database schema includes these key tables:

### Core Tables
- `organizations` - Multi-tenant support with business settings
- `leads` - Customer records with bike interest and qualification data
- `conversations` - All conversation history (voice, SMS, system)
- `call_sessions` - Active call state management
- `conversation_summaries` - AI-generated summaries with sentiment analysis

### Human-in-the-Loop Tables
- `human_control_sessions` - Tracks when human agents take over conversations
- `conversation_transcripts` - Real-time transcription for human agents
- `analytics_events` - Tracks human intervention patterns and success rates

### Important Schema Notes
- `leads.id` is VARCHAR (not UUID) for phone number-based identification
- `conversations.sent_by` includes 'human_agent' for tracking human messages
- `human_control_sessions.queued_messages` stores messages during handoff
- `conversation_summaries.conversation_type` tracks voice vs SMS context

## Development Commands

### Full Development Setup
```bash
# Install all dependencies (root, server, client)
npm run install:all

# Start both server and client in development
npm run dev
```

### Individual Components
```bash
# Server development (port 3002 - Express.js with nodemon)
npm run server:dev
cd server && npm run dev

# Client development (port 3000 or 5173 - Vite React)
npm run client:dev
cd client && npm run dev
```

### Building and Testing
```bash
# Build for production
npm run build
cd client && npm run build

# Start production server
npm start
cd server && npm start

# Run comprehensive test suite
npm run test
node run-tests.js

# Run server tests
cd server && npm test

# Client linting
cd client && npm run lint
```

### Agent Management (ElevenLabs CLI)
```bash
# View current agent status
convai status --env dev

# Deploy agent configuration changes
convai sync --env dev

# Test agent with widget
convai widget "Ryder - Bici AI Teammate" --env dev
```

## Key Integrations

### ElevenLabs Configuration for Human Transfer
- Agent setup with dynamic variables for customer context
- **Critical**: Configure conversation interruption for human takeover
- Webhooks: conversation-initiation, post-call, **conversation-interruption**
- Dynamic variables must include human control status

**Required Dynamic Variables:**
```javascript
{
  conversation_context: string,    // Comprehensive conversation history
  human_agent_available: string,   // "true" | "false"
  transfer_reason: string,         // Why transfer was initiated
  customer_sentiment: string,      // Current sentiment analysis
  urgency_level: string,          // "low" | "medium" | "high"
  previous_summary: string,        // AI-generated conversation summary
  customer_name: string,
  lead_status: string,
  bike_interest: string
}
```

### Human Agent Transfer Flow
1. **Transfer Initiation**: Customer requests or AI determines need for human
2. **Context Preparation**: System builds comprehensive customer context
3. **Agent Notification**: Real-time notification to available human agents
4. **Queue Management**: Messages queued during handoff process
5. **Seamless Transition**: Human agent receives full context and queued messages
6. **Return to AI**: Option for human to hand back to AI with updated context

### Twilio Integration
- SMS webhooks for incoming messages during human sessions
- Native ElevenLabs integration maintains call connection during transfer
- Call recording capabilities for quality assurance

## Environment Configuration

Critical environment variables:
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

# Human Agent Configuration
HUMAN_AGENT_WEBHOOK_URL=your_notification_endpoint
AGENT_NOTIFICATION_TIMEOUT=30000  # 30 seconds
```

## Real-time Features

### Server-Sent Events (SSE) for Human Agents
- Live conversation updates
- Transfer request notifications
- Customer context updates
- Queue status changes

### WebSocket Communication
- Real-time message delivery between human agents and customers
- Typing indicators for human agents
- Conversation status updates

### Human Control Session Management
- Session timeouts and cleanup
- Multiple agent coordination (prevent conflicts)
- Context preservation across agent switches

## Critical Human-in-the-Loop Implementation Details

### Context Building for Human Agents
The system builds comprehensive context when transferring to human agents:

```typescript
interface HumanTransferContext {
  customerProfile: {
    name: string;
    phone: string;
    previousInteractions: ConversationSummary[];
    bikeInterests: BikePreferences;
    purchaseIntent: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  conversationFlow: {
    currentTopic: string;
    lastAIResponse: string;
    queuedCustomerMessages: Message[];
    transferReason: string;
    suggestedActions: string[];
  };
  businessContext: {
    inventory: BikeAvailability[];
    promotions: ActivePromotion[];
    appointmentSlots: AvailableSlot[];
  };
}
```

### Message Queuing During Transfer
- All customer messages received during handoff are queued
- Human agent receives queued messages upon session start  
- No customer messages are lost during transition
- System messages inform customer of transfer status

### Quality Assurance Features
- All human interactions are logged and analyzed
- Transfer success rates tracked
- Human agent performance metrics
- Customer satisfaction correlation with human intervention

## API Endpoints for Human Control

### Human Agent Management
- `POST /api/human-control/join/:leadId` - Join human control session
- `POST /api/human-control/leave/:leadId` - Leave human control  
- `GET /api/human-control/status/:leadId` - Get current control status
- `POST /api/human-control/send-message` - Send message as human agent

### Context and Analytics
- `GET /api/human-control/context/:leadId` - Get full customer context
- `GET /api/analytics/transfer-rates` - Human transfer analytics
- `POST /api/analytics/transfer-feedback` - Record transfer outcome

## Deployment Considerations

### Production Requirements
- WebSocket support for real-time communication
- Session persistence for human agent connections
- Load balancing considerations for multiple agents
- Database connection pooling for concurrent human sessions

### Monitoring and Alerts
- Human agent response time tracking
- Transfer failure alerts
- Customer wait time monitoring
- Agent availability status

## Testing Human Transfer Flow

### Manual Testing Steps
1. **Initiate Call**: Call the Twilio number
2. **Request Transfer**: Say "I want to speak to a human" or similar trigger phrase
3. **Monitor Dashboard**: Verify transfer request appears in human agent dashboard
4. **Accept Transfer**: Human agent joins conversation via dashboard
5. **Verify Context**: Ensure human agent receives full customer context
6. **Test Queuing**: Send messages during transfer to verify queuing works
7. **Return to AI**: Test human agent handing conversation back to AI

### Automated Test Scripts
```bash
# Test API connections including human control endpoints
cd server && npx tsx scripts/test-human-control-api.ts

# Test webhook delivery for transfer events
cd server && npx tsx scripts/test-transfer-webhooks.ts
```

## Performance Optimization

### Context Building Optimization
- Cache customer context for faster transfers (TTL: 30 minutes)
- Pre-build context for high-priority customers
- Parallel processing of conversation history analysis

### Real-time Communication
- WebSocket connection pooling for multiple agents
- Message compression for large context payloads
- Efficient queuing with Redis for high-volume scenarios

## Common Issues and Troubleshooting

### Transfer Failures
- Verify human agent WebSocket connections
- Check context building timeouts
- Validate message queuing functionality

### Context Loss
- Ensure proper session cleanup
- Verify database transaction handling
- Check cache invalidation logic

### Performance Issues
- Monitor context building performance
- Check WebSocket connection limits
- Validate database query optimization

## Production Deployment & Hosting

### Current Deployment Setup (Render)
- **Dashboard**: https://bici-ryder-dashboard.onrender.com (React SPA)
- **API**: Needs deployment as `bici-ryder-api` service on Render
- **Phone Number**: +1 (604) 670-0262 (Twilio-purchased, configured)

### Render Deployment Configuration
**API Service (server/):**
- Build Command: `cd server && npm install`  
- Start Command: `cd server && npm start`
- Port: 10000 (Render standard)
- Environment: Production NODE_ENV

**Dashboard Service (client/):**
- Build Command: `cd client && npm run build`
- Publish Directory: `client/dist`  
- Environment Variable: `VITE_API_URL=https://bici-ryder-api.onrender.com/api`

### Required Environment Variables for Production
```env
# Server Environment
NODE_ENV=production
PORT=10000
ELEVENLABS_API_KEY=sk_5f1308f7b35eca383dab400080c7513674edec42310a86a8
ELEVENLABS_AGENT_ID=agent_7201k9x8c9axe9h99csjf4z59821  
ELEVENLABS_PHONE_NUMBER_ID=phnum_8601k3aqzvzree7858ftsv7m5cdz
TWILIO_ACCOUNT_SID=ACa474c6d23cca243aea12953c9dc0970c
TWILIO_AUTH_TOKEN=77db43d9c4426b747e12fae079fc19ec
TWILIO_PHONE_NUMBER=+16046700262
STORE_TIMEZONE=America/Vancouver
STORE_NAME=Bici
STORE_ADDRESS=1497 Adanac Street, Vancouver, BC, Canada
STORE_PHONE=+17787193080
QUEBEC_AREA_CODES=418,438,450,514,579,581,819,873
```

### Webhook URLs (Production)
Update these in Twilio and ElevenLabs dashboards after API deployment:
- **Twilio Voice**: `https://bici-ryder-api.onrender.com/api/webhooks/twilio/voice`
- **Twilio SMS**: `https://bici-ryder-api.onrender.com/api/webhooks/twilio/sms` 
- **ElevenLabs Conversation Start**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-start`
- **ElevenLabs Post Call**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/post-call`
- **ElevenLabs Conversation Interrupt**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-interrupt`

## MCP Server Configuration & Fixes

### Current MCP Servers Status
- **Render MCP**: ✅ Configured in claude_desktop_config.json
- **Supabase MCP**: ✅ Configured via npm package
- **ElevenLabs MCP**: ❌ Module compatibility issue (CommonJS vs ES modules)
- **Twilio MCP**: ❌ Module compatibility issue (CommonJS vs ES modules)

### MCP Server Fix Required
Both custom MCP servers need conversion from CommonJS to ES modules:

**Current (Broken):**
```javascript
const { Server } = require('@modelcontextprotocol/sdk/server');
```

**Fixed (Working):**
```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
```

**Steps to Fix:**
1. Rename `.js` files to `.mjs` OR add `"type": "module"` to mcp-servers/package.json
2. Convert all `require()` to `import` statements
3. Update MCP SDK import paths to include `/index.js` suffix
4. Test MCP servers with: `npx @modelcontextprotocol/cli test <server-file>`

## Testing & Quality Assurance

### Comprehensive Test Suite
- **Main Test Runner**: `node run-tests.js` 
- **Test Categories**: Store hours, human handoff, message taking, French language, lead qualification
- **Success Criteria**: 8/10 tests must pass with 80% score, <2s response time
- **Test Files**: test-agent-interaction.js, test-complete-system.js, test-dashboard.js, test-production.js

### Agent Configuration Testing  
- **Interactive Dashboard**: Agent Testing tab at http://localhost:3000
- **CLI Testing**: `convai widget "Ryder - Bici AI Teammate" --env dev`
- **Manual Phone Testing**: Call +1 (604) 670-0262 to test full voice flow