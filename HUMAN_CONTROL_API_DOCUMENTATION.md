# Human-in-the-Loop API System Documentation

## Overview

The Human Control API system provides seamless human agent takeover of AI conversations. This system allows human agents to:

- Take control of any AI conversation in real-time
- Send messages directly to customers via SMS
- Manage conversation state and message queuing
- Return control to AI when done
- Maintain full conversation context and history

## Architecture

The system integrates with:
- **Conversation Streaming System**: Real-time UI updates via Server-Sent Events (SSE)
- **Twilio SMS Service**: Direct SMS sending for human agents
- **Organization Isolation**: Secure multi-tenant access control
- **State Management**: In-memory session tracking with automatic cleanup

## API Endpoints

### Base URL
All endpoints are prefixed with `/api/human-control`

### Authentication
All endpoints require:
- Valid JWT token in Authorization header
- `conversations:manage` permission for control operations
- `conversations:read` permission for status operations

## Endpoints

### 1. Join Human Control Session

**POST** `/api/human-control/join`

Take control of a conversation from AI.

#### Request Body
```json
{
  "phoneNumber": "+15551234567",
  "agentName": "John Smith",
  "leadId": "lead_123",
  "handoffReason": "manual_takeover",
  "customMessage": "Hi! I'm a human agent here to help."
}
```

#### Parameters
- `phoneNumber` (required): Customer phone number in E.164 format
- `agentName` (optional): Agent display name (defaults to user email)
- `leadId` (optional): Associated lead ID
- `handoffReason` (optional): Reason for takeover
  - `manual_takeover` (default)
  - `customer_request`
  - `complex_issue`
  - `escalation`
  - `ai_confidence_low`
  - `technical_issue`
  - `custom`
- `customMessage` (optional): Initial message to send to customer

#### Response
```json
{
  "success": true,
  "message": "Human control session started successfully",
  "data": {
    "session": {
      "sessionId": "session_1234567890_abc123",
      "phoneNumber": "15551234567",
      "leadId": "lead_123",
      "agentName": "John Smith",
      "agentId": "user_456",
      "organizationId": "bici-demo",
      "startTime": "2024-01-15T10:30:00.000Z",
      "handoffReason": "manual_takeover",
      "customMessage": "Hi! I'm a human agent here to help.",
      "status": "active"
    },
    "queuedMessages": 0,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Error Responses
- `400` - Invalid phone number or validation errors
- `409` - Conversation already under human control
- `500` - Session creation failed

### 2. Send Message as Human Agent

**POST** `/api/human-control/send-message`

Send a message to the customer as a human agent.

#### Request Body
```json
{
  "phoneNumber": "+15551234567",
  "message": "I can help you with that bike recommendation!",
  "leadId": "lead_123",
  "messageType": "text",
  "priority": "normal"
}
```

#### Parameters
- `phoneNumber` (required): Customer phone number
- `message` (required): Message content (max 1600 characters for SMS)
- `leadId` (optional): Associated lead ID
- `messageType` (optional): Message type (`text`, `voice`, `system`)
- `priority` (optional): Message priority (`low`, `normal`, `high`, `urgent`)

#### Response
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "messageId": "msg-1234567890-abc123",
    "smsId": "SM1234567890abcdef",
    "phoneNumber": "+15551234567",
    "leadId": "lead_123",
    "messageType": "text",
    "priority": "normal",
    "agentName": "John Smith",
    "agentId": "user_456",
    "timestamp": "2024-01-15T10:35:00.000Z",
    "smsStatus": "queued",
    "sessionInfo": {
      "sessionId": "session_1234567890_abc123",
      "messageCount": 1,
      "duration": 300
    }
  }
}
```

#### Error Responses
- `400` - Not under human control, empty message, or message too long
- `403` - Organization access denied
- `500` - SMS send failed

### 3. Leave Human Control Session

**POST** `/api/human-control/leave`

End human control session and return to AI.

#### Request Body
```json
{
  "phoneNumber": "+15551234567",
  "leadId": "lead_123",
  "summary": "Customer question about mountain bikes resolved. Recommended Trek X-Caliber 8.",
  "nextSteps": [
    "Follow up with product brochure",
    "Schedule test ride appointment"
  ],
  "handoffSuccess": true
}
```

#### Parameters
- `phoneNumber` (required): Customer phone number
- `leadId` (optional): Associated lead ID
- `summary` (optional): Session summary (max 5000 characters)
- `nextSteps` (optional): Array of follow-up actions (max 10 items)
- `handoffSuccess` (optional): Whether handoff was successful (default: true)

#### Response
```json
{
  "success": true,
  "message": "Human control session ended successfully",
  "data": {
    "session": {
      "sessionId": "session_1234567890_abc123",
      "phoneNumber": "15551234567",
      "leadId": "lead_123",
      "agentName": "John Smith",
      "agentId": "user_456",
      "organizationId": "bici-demo",
      "startTime": "2024-01-15T10:30:00.000Z",
      "endTime": "2024-01-15T10:45:00.000Z",
      "duration": 900,
      "messageCount": 3,
      "summary": "Customer question about mountain bikes resolved...",
      "nextSteps": ["Follow up with product brochure", "Schedule test ride appointment"],
      "handoffSuccess": true,
      "status": "ended"
    },
    "queuedMessages": {
      "total": 2,
      "customerMessages": 1,
      "processed": true
    },
    "timestamp": "2024-01-15T10:45:00.000Z"
  }
}
```

### 4. Check Control Status

**GET** `/api/human-control/status`

Check human control status for phone number or agent sessions.

#### Query Parameters
- `phoneNumber` (optional): Check status for specific phone number
- `includeAgentSessions` (optional): Include agent's active sessions

#### Response (with phoneNumber)
```json
{
  "success": true,
  "data": {
    "organizationId": "bici-demo",
    "userId": "user_456",
    "timestamp": "2024-01-15T10:35:00.000Z",
    "phoneNumber": "+15551234567",
    "isUnderHumanControl": true,
    "session": {
      "sessionId": "session_1234567890_abc123",
      "agentName": "John Smith",
      "agentId": "user_456",
      "startTime": "2024-01-15T10:30:00.000Z",
      "lastActivity": "2024-01-15T10:35:00.000Z",
      "duration": 300,
      "messageCount": 1,
      "customerResponsesPending": 0,
      "handoffReason": "manual_takeover",
      "status": "active"
    },
    "queuedMessages": 0
  }
}
```

#### Response (agent sessions)
```json
{
  "success": true,
  "data": {
    "organizationId": "bici-demo",
    "userId": "user_456",
    "timestamp": "2024-01-15T10:35:00.000Z",
    "agentSessions": {
      "total": 2,
      "active": 2,
      "sessions": [
        {
          "sessionId": "session_1234567890_abc123",
          "phoneNumber": "15551234567",
          "leadId": "lead_123",
          "startTime": "2024-01-15T10:30:00.000Z",
          "lastActivity": "2024-01-15T10:35:00.000Z",
          "duration": 300,
          "messageCount": 1,
          "customerResponsesPending": 0,
          "handoffReason": "manual_takeover",
          "status": "active"
        }
      ]
    }
  }
}
```

### 5. Get Message Queue

**GET** `/api/human-control/queue/{phoneNumber}`

Get queued messages for a conversation under human control.

#### Parameters
- `phoneNumber` (path): Customer phone number
- `includeProcessed` (query): Include processed messages (default: false)

#### Response
```json
{
  "success": true,
  "data": {
    "phoneNumber": "+15551234567",
    "sessionId": "session_1234567890_abc123",
    "agentName": "John Smith",
    "messages": [
      {
        "id": "queued_1234567890_abc123",
        "content": "Thanks for your help with the bike recommendation!",
        "type": "customer",
        "timestamp": "2024-01-15T10:33:00.000Z",
        "processed": false
      }
    ],
    "stats": {
      "total": 3,
      "unprocessed": 1,
      "customerMessages": 1,
      "systemMessages": 0
    },
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

### 6. Process Queued Messages

**POST** `/api/human-control/queue/{phoneNumber}/process`

Mark queued messages as processed.

#### Request Body
```json
{
  "messageIds": ["queued_1234567890_abc123"]
}
```

#### Parameters
- `messageIds` (optional): Specific message IDs to process (empty array processes all)

#### Response
```json
{
  "success": true,
  "message": "1 messages marked as processed",
  "data": {
    "phoneNumber": "+15551234567",
    "sessionId": "session_1234567890_abc123",
    "processedCount": 1,
    "remainingUnprocessed": 0,
    "processedBy": "user_456",
    "timestamp": "2024-01-15T10:36:00.000Z"
  }
}
```

### 7. Get All Active Sessions (Admin/Manager)

**GET** `/api/human-control/sessions`

Get all active human control sessions for organization.

#### Query Parameters
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)
- `status` (optional): Session status filter (`active`, `all`)

#### Response
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "session_1234567890_abc123",
        "phoneNumber": "15551234567",
        "leadId": "lead_123",
        "agentName": "John Smith",
        "agentId": "user_456",
        "organizationId": "bici-demo",
        "startTime": "2024-01-15T10:30:00.000Z",
        "lastActivity": "2024-01-15T10:35:00.000Z",
        "duration": 300,
        "messageCount": 1,
        "customerResponsesPending": 0,
        "handoffReason": "manual_takeover",
        "status": "active",
        "queuedMessages": 0
      }
    ],
    "stats": {
      "total": 1,
      "active": 1,
      "totalAgents": 1,
      "averageDuration": 300,
      "totalMessages": 1
    }
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1,
    "hasMore": false
  }
}
```

## Real-Time Integration

### Server-Sent Events (SSE)

The system broadcasts real-time updates via the existing conversation streaming infrastructure:

#### Events Broadcasted

1. **human_control_started**
   - When agent joins conversation
   - Includes session details and agent info

2. **human_message_sent**
   - When human agent sends message
   - Includes message content and delivery status

3. **customer_message_received**
   - When customer responds during human control
   - Message is queued for agent

4. **human_control_ended**
   - When agent leaves conversation
   - Includes session summary and next steps

5. **human_control_timeout**
   - When session times out due to inactivity
   - Automatic cleanup notification

### WebSocket Integration

Real-time updates are sent to connected clients via the `/api/stream/conversation/{leadId}` endpoint.

## SMS Integration

### Twilio Integration

- Human agents send messages directly through Twilio SMS API
- Messages are stored in conversation history
- Delivery status is tracked and reported
- Incoming SMS during human control is queued for agents

### Message Routing

1. **AI Active**: SMS → AI processing → Response
2. **Human Control**: SMS → Queue for agent → Manual response
3. **Handoff**: Queued messages processed by AI after agent leaves

## Security Features

### Organization Isolation
- All sessions scoped to organization
- Cross-organization access blocked
- Agent can only control their org's conversations

### Permission System
- `conversations:manage` required for control operations
- `conversations:read` required for status checks
- Admin/Manager roles for session management

### Session Security
- Automatic session timeout (2 hours inactivity)
- Session validation on all operations
- Secure message queuing

## State Management

### In-Memory Storage
- Human control sessions stored in Map structures
- Message queues maintained per session
- Agent connection tracking

### Automatic Cleanup
- Stale sessions cleaned up every 15 minutes
- Session timeout after 2 hours inactivity
- Memory-efficient with size limits

### Session Lifecycle

1. **Join**: Create session, broadcast start, queue messages
2. **Active**: Send messages, receive queued customer messages
3. **Leave**: End session, process queued messages, return to AI
4. **Timeout**: Auto-cleanup inactive sessions

## Error Handling

### Common Errors
- `INVALID_PHONE_NUMBER`: Phone number format validation
- `ALREADY_UNDER_HUMAN_CONTROL`: Cannot join active session
- `NOT_UNDER_HUMAN_CONTROL`: Operation requires active session
- `ORGANIZATION_ACCESS_DENIED`: Cross-organization access
- `MESSAGE_TOO_LONG`: SMS character limit exceeded
- `SMS_SEND_FAILED`: Twilio delivery failure

### Recovery Mechanisms
- Automatic retry for failed SMS
- Session cleanup on errors
- Graceful degradation for external service failures

## Usage Examples

### Basic Workflow

```javascript
// 1. Check status
const status = await fetch('/api/human-control/status?phoneNumber=+15551234567');

// 2. Join if not under control
if (!status.data.isUnderHumanControl) {
  await fetch('/api/human-control/join', {
    method: 'POST',
    body: JSON.stringify({
      phoneNumber: '+15551234567',
      agentName: 'John Smith',
      customMessage: 'Hi! How can I help you today?'
    })
  });
}

// 3. Send messages
await fetch('/api/human-control/send-message', {
  method: 'POST',
  body: JSON.stringify({
    phoneNumber: '+15551234567',
    message: 'I recommend the Trek X-Caliber 8 for mountain biking.'
  })
});

// 4. Leave when done
await fetch('/api/human-control/leave', {
  method: 'POST',
  body: JSON.stringify({
    phoneNumber: '+15551234567',
    summary: 'Recommended mountain bike, customer interested.',
    nextSteps: ['Send product brochure', 'Follow up in 24 hours']
  })
});
```

### Real-Time Updates

```javascript
// Listen for SSE events
const eventSource = new EventSource('/api/stream/conversation/lead_123');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'human_control_started':
      console.log('Agent joined:', data.agentName);
      break;
      
    case 'customer_message_received':
      console.log('Customer replied:', data.message.content);
      // Update queue UI
      break;
      
    case 'human_control_ended':
      console.log('Session ended:', data.session.summary);
      break;
  }
};
```

## Testing

### Test Script

Run the included test script:

```bash
node test-human-control.js
```

The test script verifies:
- Authentication flow
- Session creation and management
- Message sending and queuing
- Status checking
- Session cleanup

### Manual Testing

1. Start the API server
2. Authenticate with test credentials
3. Use Postman or curl to test endpoints
4. Monitor logs for session state changes
5. Test SMS integration with real phone numbers

## Monitoring and Logging

### Logs
- Session creation/destruction
- Message sending/receiving
- Error conditions
- Performance metrics

### Metrics
- Active sessions count
- Average session duration
- Messages per session
- Error rates

## Production Considerations

### Scaling
- Consider Redis for session storage in multi-instance deployments
- Implement session sticky routing for load balancers
- Monitor memory usage with high concurrent sessions

### Reliability
- Implement database persistence for critical session data
- Add circuit breakers for external API calls
- Implement proper retry mechanisms

### Security
- Rate limiting on control operations
- Audit logging for compliance
- IP whitelisting for webhook endpoints

This documentation covers the complete Human-in-the-Loop API system implementation, providing all necessary information for developers to integrate and use the system effectively.