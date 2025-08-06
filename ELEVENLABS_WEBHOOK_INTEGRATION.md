# ElevenLabs Webhook Integration System

## Complete Implementation Guide for BICI AI Voice System

This document provides a comprehensive overview of the ElevenLabs webhook integration system that has been implemented to connect the conversation streaming infrastructure with ElevenLabs conversational AI for context injection and call processing.

## 🎯 System Overview

The ElevenLabs webhook integration system enables:

- **Context Injection**: Automatically provides conversation history and customer data to ElevenLabs agents when calls start
- **Real-time Call Events**: Processes live conversation events for immediate UI updates
- **Post-Call Processing**: Analyzes call transcripts, updates lead data, and generates summaries
- **Human Takeover Integration**: Seamlessly connects with the human control system
- **SMS Integration**: Continues conversations via SMS with full context preservation

## 📋 Implementation Status: COMPLETE ✅

All requirements from CLAUDE.md have been fully implemented:

- ✅ ElevenLabs Webhooks (`/api/webhooks/elevenlabs/*`)
- ✅ Dynamic Variables & Context Building
- ✅ Context Injection System
- ✅ Post-Call Processing
- ✅ Security & Validation (HMAC signatures)
- ✅ Integration Points (SSE broadcasting, conversation memory)

## 🔗 Webhook Endpoints

### 1. Conversation Initiation
**Endpoint**: `/api/webhooks/elevenlabs/conversation-initiation`
- **Purpose**: Inject context when calls start
- **Method**: POST
- **Security**: HMAC SHA-256 signature verification
- **Returns**: Dynamic variables object for ElevenLabs agent

### 2. Post-Call Processing  
**Endpoint**: `/api/webhooks/elevenlabs/post-call`
- **Purpose**: Process call results and update leads
- **Method**: POST
- **Security**: HMAC SHA-256 signature verification
- **Actions**: 
  - Analyzes call transcript
  - Updates lead data
  - Stores conversation summaries
  - Broadcasts call end events

### 3. Conversation Events (Optional)
**Endpoint**: `/api/webhooks/elevenlabs/conversation-events`
- **Purpose**: Real-time call events during conversation
- **Method**: POST
- **Security**: HMAC SHA-256 signature verification
- **Events**: Speech detection, interruptions, transfers, errors

## 🔐 Security Implementation

### HMAC Signature Verification
All webhook endpoints implement HMAC SHA-256 signature verification:

```javascript
const signature = req.headers['xi-signature'];
const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(req.rawBody || JSON.stringify(req.body))
  .digest('hex');
```

### Rate Limiting
- 20 calls per 5 minutes for conversation initiation
- 50 SMS per 5 minutes for SMS integration
- Automatic cleanup of rate limit records

### Environment Variables Required:
```bash
ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=your-secret
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=your-secret  
ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET=your-secret
```

## 📊 Dynamic Variables System

### Context Building Process

1. **Phone Number Lookup**: Find organization by incoming phone number
2. **Lead Data Retrieval**: Get existing lead information from database
3. **Conversation History**: Extract last 6 messages for context
4. **Summary Generation**: Combine voice + SMS interaction history

### Generated Variables

```javascript
{
  conversation_context: "Last 6 messages formatted as context",
  customer_name: "Customer Name or 'Customer'",
  organization_name: "BICI Bike Store", 
  lead_status: "Returning Customer" or "New Inquiry",
  previous_summary: "Comprehensive call + SMS summary",
  organization_id: "bici-demo",
  caller_type: "existing_lead" or "new_caller",
  has_conversation_history: "true/false",
  total_messages: "number of previous messages"
}
```

## 🔄 Post-Call Processing

### Transcript Analysis
- **Keyword Extraction**: Identifies bike-related terms and interests
- **Sentiment Analysis**: Determines positive/neutral/negative sentiment
- **Lead Scoring**: Calculates qualification score (0-100)
- **Intent Detection**: Identifies customer intentions and needs
- **Action Items**: Extracts follow-up tasks and requirements

### Lead Updates
- Updates lead quality score based on call analysis
- Stores conversation summary for future context
- Increments interaction count
- Updates last contact date
- Stores call metadata (duration, outcome, conversation ID)

### Real-time Broadcasting
Sends updates via SSE to connected dashboard clients:
```javascript
{
  type: 'call_ended',
  leadId: 'lead_123',
  phoneNumber: '+1234567890',
  organizationId: 'bici-demo',
  summary: 'Call completed successfully...',
  duration: 180,
  outcome: 'lead_qualified'
}
```

## 🎤 Conversation Events

### Supported Event Types
- `conversation_started`: Call initiation
- `user_speech_started/ended`: Customer speaking events  
- `agent_response_started/ended`: AI agent responses
- `interruption_detected`: Customer interruptions
- `silence_timeout`: Long silences during call
- `conversation_transferred`: Human takeover events
- `error_occurred`: Call errors and failures

### Real-time Processing
Events are immediately:
- Stored in conversation history
- Broadcast to dashboard UI
- Logged for analytics
- Used for live conversation monitoring

## 📱 SMS Integration

### Incoming SMS Processing
1. **Signature Verification**: Validates Twilio webhook signature
2. **Organization Lookup**: Finds business number owner
3. **Lead Management**: Creates or updates lead records
4. **Human Control Check**: Routes to human agent if under control
5. **Context Continuation**: Maintains conversation context
6. **ElevenLabs Integration**: Triggers appropriate responses

### Outbound Call Triggers
SMS content analysis can trigger outbound calls for:
- Urgent keywords (emergency, help, urgent)
- High-value leads with quality scores >75
- Business hours availability

## 🛠 Service Integration

### ElevenLabsService Class
Enhanced service class provides:
- Outbound call initiation with context
- Conversation history retrieval  
- Transcript and analysis fetching
- Human takeover management
- Health monitoring and metrics
- WebSocket connection management

### Key Methods:
```javascript
// Initiate call with full context
await elevenLabsService.initiateOutboundCall(phoneNumber, agentId, {
  leadId, organizationId, dynamicVariables
});

// Transfer to human agent
await elevenLabsService.transferToHuman(conversationId, reason);

// Resume AI control  
await elevenLabsService.resumeAIControl(conversationId, summary);
```

## 🔧 Configuration Setup

### ElevenLabs Dashboard
1. Navigate to Conversational AI > Phone Numbers
2. Configure webhook URLs:
   - Conversation Initiation: `https://yourdomain.com/api/webhooks/elevenlabs/conversation-initiation`
   - Post-Call: `https://yourdomain.com/api/webhooks/elevenlabs/post-call`  
   - Events: `https://yourdomain.com/api/webhooks/elevenlabs/conversation-events`
3. Enable HMAC signature verification
4. Set webhook secrets in environment variables

### Twilio Console  
1. Navigate to Phone Numbers > Active Numbers
2. Configure webhook URLs:
   - SMS: `https://yourdomain.com/api/webhooks/twilio/sms/incoming`
   - Voice: `https://yourdomain.com/api/webhooks/twilio/voice/incoming`
3. Set up status callbacks for delivery tracking

## 📈 Monitoring & Analytics

### Health Checks
- `/api/health` - Overall system health
- ElevenLabs service health monitoring
- Database connection status
- Active conversation tracking

### Metrics Tracked
- Total conversations per day
- Average call duration  
- Human takeover rate
- AI success rate
- Lead conversion metrics
- Webhook delivery success rates

### Logging
- Comprehensive console logging
- Webhook request/response logging  
- Error tracking with context
- Performance metrics

## 🚀 Deployment Checklist

### Required Environment Variables
```bash
# ElevenLabs API
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_AGENT_ID=your-agent-id
ELEVENLABS_PHONE_NUMBER_ID=your-phone-id

# Webhook Secrets
ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=secret1
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=secret2  
ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET=secret3

# Twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=your-number

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

### Webhook URL Configuration
Update these URLs in your ElevenLabs and Twilio dashboards with your domain.

### Testing
1. Test webhook signature verification
2. Verify conversation context injection
3. Test post-call processing
4. Check real-time UI updates
5. Validate SMS integration
6. Test human takeover flows

## 🔍 Troubleshooting

### Common Issues

**Webhook Signature Failures**
- Verify webhook secrets in environment
- Check raw body parsing in middleware
- Ensure HTTPS is used for webhook URLs

**Context Not Injecting**  
- Check organization lookup by phone number
- Verify conversation history is being stored
- Test dynamic variable generation

**Real-time Updates Not Working**
- Verify SSE connections are established  
- Check broadcasting function calls
- Ensure organization isolation is working

**SMS Integration Issues**
- Verify Twilio webhook signatures
- Check phone number normalization
- Test human control detection

### Debug Mode
Enable debug logging with:
```bash
ENABLE_DEBUG_LOGS=true
ENABLE_WEBHOOK_LOGGING=true
```

## 📚 Code Structure

### Key Files
- `/api/routes/webhooks.js` - Complete webhook handlers
- `/api/routes/conversations.js` - Conversation management & SSE
- `/api/services/elevenLabsService.js` - ElevenLabs integration
- `/api/services/databaseService.js` - Database operations
- `/database/schema.sql` - Database schema

### Integration Points
- Conversation memory system (in-memory Maps)
- SSE broadcasting for real-time updates
- Human control session management
- Lead scoring and qualification
- Organization-based multi-tenancy

## 🎉 Success Metrics

The implementation successfully provides:
- **Context-Aware Conversations**: Every call starts with full customer history
- **Real-time Monitoring**: Dashboard shows live conversation events  
- **Comprehensive Analytics**: Detailed post-call analysis and lead updates
- **Seamless Integration**: SMS and voice work together with shared context
- **Human Takeover**: Smooth transition between AI and human agents
- **Security**: HMAC signature verification and rate limiting
- **Scalability**: Multi-tenant architecture with organization isolation

This implementation fulfills all requirements specified in CLAUDE.md and provides a production-ready ElevenLabs webhook integration system.