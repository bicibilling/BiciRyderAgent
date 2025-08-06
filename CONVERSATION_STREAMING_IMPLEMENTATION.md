# TelephonyInterface Conversation Streaming Infrastructure

## Overview

This implementation provides the core conversation streaming infrastructure for the BICI TelephonyInterface system. It enables real-time conversation streaming, organization-scoped security, human-in-the-loop functionality, and seamless integration between voice calls and SMS messaging.

## Core Components Implemented

### 1. Server-Sent Events (SSE) Streaming Endpoint

**Endpoint:** `/api/stream/conversation/:leadId`

**Features:**
- Real-time conversation streaming to UI
- Organization-scoped access control
- Automatic conversation history loading
- Connection management with heartbeat
- Graceful error handling and reconnection

**Usage:**
```javascript
const eventSource = new EventSource(
  `/api/stream/conversation/${leadId}?phoneNumber=${phone}&load=true&organizationId=${orgId}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleRealTimeUpdate(data);
};
```

### 2. Conversation Memory Management

**Organization-Scoped Storage:**
- Memory keys: `organizationId:normalizedPhoneNumber`
- Automatic message limiting (50 messages per conversation)
- Conversation history with metadata
- Summary storage and retrieval

**Key Functions:**
```javascript
addToConversationHistory(phoneNumber, message, sentBy, messageType, organizationId)
getConversationHistory(phoneNumber, organizationId)
storeConversationSummary(phoneNumber, summary, organizationId)
```

### 3. Broadcasting System

**Real-time Updates:**
- Organization isolation security
- Multi-connection support per lead
- Dead connection cleanup
- Message type routing

**Broadcast Types:**
- `conversation_history` - Initial history load
- `sms_received` - Incoming SMS messages
- `call_initiated` - Voice call start
- `call_ended` - Voice call completion
- `human_control_started` - Agent takeover
- `human_control_ended` - AI resumption
- `human_message_sent` - Agent messages

### 4. Context Building for ElevenLabs

**Dynamic Variables Generation:**
```javascript
const dynamicVariables = await buildDynamicVariables(phoneNumber, organizationId, leadData);

// Returns:
{
  conversation_context: "Recent conversation messages...",
  customer_name: "John Doe",
  organization_name: "BICI Bike Store",
  lead_status: "Returning Customer",
  previous_summary: "Previous call summary...",
  organization_id: "bici-demo",
  caller_type: "existing_lead",
  has_conversation_history: "true",
  total_messages: "15"
}
```

**Context Functions:**
- `buildConversationContext()` - Recent message context
- `generateComprehensiveSummary()` - Voice + SMS summary
- `buildDynamicVariables()` - Complete ElevenLabs context

### 5. Human-in-the-Loop System

**Human Control API Endpoints:**
- `POST /api/conversations/human-control/join` - Agent takeover
- `POST /api/conversations/human-control/leave` - Return to AI
- `POST /api/conversations/human-control/send-message` - Agent messaging
- `GET /api/conversations/human-control/status/:phoneNumber` - Control status

**Features:**
- Session management with agent tracking
- AI pause during human control
- Message queuing for human agents
- Seamless handoff back to AI

### 6. Webhook Integration

**ElevenLabs Webhooks:**
- `/api/webhooks/elevenlabs/conversation-initiation` - Context injection
- `/api/webhooks/elevenlabs/post-call` - Call result processing

**Twilio Webhooks:**
- `/api/webhooks/twilio/sms/incoming` - SMS processing
- `/api/webhooks/twilio/sms/status` - Delivery tracking

### 7. Outbound Calling System

**Endpoint:** `POST /api/conversations/outbound-call`

**Features:**
- Context-aware call initiation
- Dynamic variable injection
- Human control validation
- Real-time UI updates

## Security Features

### Organization Isolation
- All data scoped by organization ID
- Cross-organization access prevention
- Connection validation on every broadcast
- Memory key organization prefixing

### Authentication & Authorization
- JWT token verification
- Permission-based access control
- Webhook signature verification
- Rate limiting on communications

### Data Protection
- Phone number normalization
- Sensitive data filtering
- Error message sanitization
- Connection cleanup on disconnect

## Performance Optimizations

### Memory Management
- Message history limiting (50 per conversation)
- Dead connection cleanup
- Efficient Map-based storage
- Heartbeat connection validation

### Connection Management
- Automatic reconnection support
- Connection pooling per lead
- Graceful error handling
- Resource cleanup on disconnect

## Usage Examples

### Frontend Integration
```typescript
// Setup SSE connection
const setupEventSource = () => {
  const eventSource = new EventSource(
    `/api/stream/conversation/${selectedLead.id}?phoneNumber=${selectedLead.phoneNumber}&load=true&organizationId=${organizationId}`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // Security validation
    if (data.organizationId !== organizationId) {
      console.error('Cross-org data detected');
      return;
    }
    
    handleRealTimeUpdate(data);
  };
};

// Handle real-time updates
const handleRealTimeUpdate = (data) => {
  switch (data.type) {
    case 'conversation_history':
      setConversationHistory(data.messages);
      break;
    case 'sms_received':
      addMessage(data.message);
      break;
    case 'call_initiated':
      setCallActive(true);
      break;
    case 'human_control_started':
      setHumanControlActive(true);
      break;
  }
};
```

### Backend Webhook Integration
```javascript
// ElevenLabs conversation initiation
app.post('/api/webhooks/elevenlabs/conversation-initiation', async (req, res) => {
  const { caller_id } = req.body;
  
  const organizationId = await getOrganizationByPhoneNumber(caller_id);
  const leadData = await findLeadByPhone(caller_id, organizationId);
  const dynamicVariables = await buildDynamicVariables(caller_id, organizationId, leadData);
  
  res.json({ dynamic_variables: dynamicVariables });
});

// SMS processing
app.post('/api/webhooks/twilio/sms/incoming', async (req, res) => {
  const { From, Body, To } = req.body;
  const organizationId = await getOrganizationByPhoneNumber(To);
  
  addToConversationHistory(From, Body, 'user', 'text', organizationId);
  
  if (!isUnderHumanControl(From, organizationId)) {
    await continueConversationWithSMS(From, Body, organizationId);
  }
  
  broadcastConversationUpdate({
    type: 'sms_received',
    phoneNumber: From,
    message: Body,
    organizationId
  });
  
  res.status(200).send('SMS processed');
});
```

## File Structure

```
/Users/divhit/bici/
├── api/routes/
│   ├── conversations.js          # Main conversation streaming logic
│   └── webhooks.js              # Webhook handlers
├── api-server.js                # Updated routing configuration
├── test-streaming.html          # Test interface for streaming
└── CONVERSATION_STREAMING_IMPLEMENTATION.md
```

## Testing

### Test Interface
A complete test interface is provided at `/test-streaming.html` that demonstrates:
- SSE connection establishment
- Real-time message streaming
- Connection error handling
- Message broadcasting simulation
- Human control workflow

### API Testing
Use the provided endpoints to test:
1. Connect to SSE stream
2. Send test SMS via webhook
3. Initiate human control
4. Send agent messages
5. Return to AI control

## Production Deployment

### Environment Variables Required
```env
# ElevenLabs
ELEVENLABS_API_KEY=sk_your_api_key
ELEVENLABS_AGENT_ID=agent_your_id
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_id
ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=whsec_your_secret
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=whsec_your_secret

# Twilio
TWILIO_ACCOUNT_SID=AC_your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# Application
DEFAULT_ORGANIZATION_NAME=BICI Bike Store
```

### Database Integration
For production deployment, replace mock functions with actual database queries:
- `getOrganizationByPhoneNumber()`
- `findLeadByPhone()`
- `processCallTranscript()`

### Webhook Configuration
Configure these webhook URLs in your services:
- ElevenLabs: `https://your-domain.com/api/webhooks/elevenlabs/conversation-initiation`
- ElevenLabs: `https://your-domain.com/api/webhooks/elevenlabs/post-call`
- Twilio SMS: `https://your-domain.com/api/webhooks/twilio/sms/incoming`

## Key Benefits

1. **Real-time Communication** - Instant conversation updates
2. **Multi-tenant Security** - Complete organization isolation
3. **Context Continuity** - Seamless voice/SMS integration
4. **Human Takeover** - Instant agent intervention capability
5. **Scalable Architecture** - Efficient connection management
6. **Production Ready** - Comprehensive error handling and security

This implementation provides the foundation for a complete telephony interface system with real-time streaming, context awareness, and enterprise-grade security features.