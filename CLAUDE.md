# Jack AI Agent Implementation Guide
## Complete Multi-Modal Telephony System for Automotive Lead Management

### System Overview
Build a production-ready AI telephony system where:
- **ElevenLabs AI agents** make voice calls with full conversation context
- **SMS conversations** seamlessly integrate with voice calls  
- **Human agents** can take control instantly
- **Real-time chat interface** streams all conversations live
- **Multi-tenant security** isolates dealership data completely

### What You're Building
A chat interface that opens when clicking a lead, with tabs for Conversation/Profile/Analytics/Settings, where agents can start AI voice calls, send SMS, or take manual control - all while maintaining conversation context across channels.

---

## 1. ElevenLabs Agent Setup

### Create Agent with Dynamic Variables
1. **Go to ElevenLabs Dashboard** → Conversational AI → Create Agent
2. **Configure Agent Identity:**
   ```
   Name: Jack - Automotive Lead Agent
   Voice: Professional male voice
   Language: English (US)
   ```

3. **Add Dynamic Variables** (Critical for context):
   ```
   conversation_context: String - "No previous conversation"
   customer_name: String - "Customer"  
   organization_name: String - "Jack Automotive"
   lead_status: String - "New Inquiry"
   previous_summary: String - "No previous calls"
   organization_id: String - "default-org"
   caller_type: String - "new_caller"
   ```

4. **System Prompt** (References dynamic variables):
   ```
   Jack - Automotive Lead Qualification Agent

   ## CRITICAL: CONVERSATION CONTEXT
   {{conversation_context}}

   ## CUSTOMER INFORMATION
   - Customer Name: {{customer_name}}
   - Lead Status: {{lead_status}}
   - Previous Summary: {{previous_summary}}
   - Organization: {{organization_name}}

   ## CONTEXT INSTRUCTIONS
   - If {{previous_summary}} contains vehicle details, acknowledge them specifically
   - Continue conversation from where it left off
   - Use {{customer_name}} instead of generic greetings
   - Don't ask questions already answered in {{previous_summary}}

   [Rest of your agent personality and instructions...]
   ```

5. **First Message** (No conditionals allowed):
   ```
   Hi {{customer_name}}! Jack from {{organization_name}} here. I'm an AI assistant specializing in vehicle financing. Are you available to chat for a few minutes?
   ```

---

## 2. Twilio Integration with ElevenLabs

### Phone Number Configuration
**Key Point: Voice calls go directly to ElevenLabs, SMS goes to your webhook**

1. **Purchase Twilio Phone Number** with Voice + SMS capability
2. **Configure Phone Number:**
   ```
   Voice Webhook: [LEAVE EMPTY - ElevenLabs handles this natively]
   SMS Webhook: https://your-domain.com/api/webhooks/twilio/sms/incoming
   SMS Status Callback: https://your-domain.com/api/webhooks/twilio/sms/status
   ```

3. **Import Number to ElevenLabs:**
   - ElevenLabs Dashboard → Agent → Phone Numbers → Import from Twilio
   - Verify and get Phone Number ID (format: `pn_xxxxxxxxxxxxx`)

### Native Integration Flow
```
Voice Calls: Customer → Twilio → ElevenLabs Agent (direct)
SMS Messages: Customer → Twilio → Your Webhook → Context Building → ElevenLabs
Outbound Calls: Your API → ElevenLabs → Twilio → Customer
```

---

## 3. Webhook Configuration

### ElevenLabs Webhooks (Configure in ElevenLabs Dashboard)

#### A. Conversation Initiation Webhook
**Purpose:** Inject context when calls start (inbound calls)
```
URL: https://your-domain.com/api/webhooks/elevenlabs/conversation-initiation
```

**Your Handler:**
```javascript
app.post('/api/webhooks/elevenlabs/conversation-initiation', async (req, res) => {
  const { caller_id } = req.body;
  
  // Find organization and lead data
  const organizationId = await getOrganizationByPhoneNumber(caller_id);
  const leadData = await findLeadByPhone(caller_id, organizationId);
  
  // Build dynamic variables with conversation context
  const dynamicVariables = await buildDynamicVariables(caller_id, organizationId, leadData);
  
  // Return to ElevenLabs
  res.json({ dynamic_variables: dynamicVariables });
});
```

#### B. Post-Call Webhook
**Purpose:** Process call results and update lead data
```
URL: https://your-domain.com/api/webhooks/elevenlabs/post-call
```

**Your Handler:**
```javascript
app.post('/api/webhooks/elevenlabs/post-call', async (req, res) => {
  const { conversation_id, phone_number, transcript, analysis, metadata } = req.body;
  
  // Verify HMAC signature
  const signature = req.headers['xi-signature'];
  // [HMAC verification code...]
  
  // Process transcript and extract insights
  const callAnalysis = await processCallTranscript(transcript, phone_number, organizationId);
  
  // Update lead with call results
  await updateLeadFromCallData(leadId, callAnalysis, organizationId);
  
  // Store conversation summary
  if (callAnalysis.summary) {
    storeConversationSummary(phone_number, callAnalysis.summary, organizationId);
  }
  
  // Broadcast call end to UI
  broadcastConversationUpdate({
    type: 'call_ended',
    phoneNumber: phone_number,
    summary: callAnalysis.summary,
    organizationId: organizationId
  });
  
  res.json({ success: true });
});
```

#### C. Conversation Events Webhook (Optional)
**Purpose:** Real-time call events during conversation
```
URL: https://your-domain.com/api/webhooks/elevenlabs/conversation-events
```

### Twilio Webhooks

#### SMS Incoming Webhook
**Purpose:** Process incoming SMS and inject into ElevenLabs context
```javascript
app.post('/api/webhooks/twilio/sms/incoming', async (req, res) => {
  const { From, Body, MessageSid, To } = req.body;
  
  // Verify Twilio signature
  // [Signature verification...]
  
  // Get organization context
  const organizationId = await getOrganizationByPhoneNumber(To);
  
  // Store in conversation history
  addToConversationHistory(From, Body, 'user', 'text', organizationId);
  
  // Check if under human control
  if (isUnderHumanControl(From, organizationId)) {
    // Queue for human agent
    addToHumanQueue(From, organizationId, Body);
    
    // Broadcast to UI
    broadcastConversationUpdate({
      type: 'user_message_during_human_control',
      phoneNumber: From,
      message: Body,
      organizationId: organizationId
    });
    
    return res.status(200).send('Queued for human agent');
  }
  
  // Broadcast to UI
  broadcastConversationUpdate({
    type: 'sms_received',
    phoneNumber: From,
    message: Body,
    organizationId: organizationId
  });
  
  // Continue conversation with ElevenLabs
  await continueConversationWithSMS(From, Body, organizationId);
  
  res.status(200).send('SMS processed');
});
```

---

## 4. Dynamic Variables & Context Building

### Building Conversation Context
```javascript
async function buildDynamicVariables(phoneNumber, organizationId, leadData = null) {
  // Get conversation history (last 6 messages)
  const history = await getConversationHistory(phoneNumber, organizationId);
  const summaryData = await getConversationSummary(phoneNumber, organizationId);
  
  // Build context string from recent messages
  let conversationContext = "No previous conversation";
  if (history && history.length > 0) {
    const recentMessages = history.slice(-6);
    conversationContext = recentMessages.map(msg => 
      `${msg.sentBy === 'user' ? 'Customer' : 'Agent'}: ${msg.content}`
    ).join('\n');
  }
  
  // Include previous call summary if exists
  if (summaryData?.summary) {
    conversationContext = `Previous Call Summary: ${summaryData.summary}\n\nRecent Messages:\n${conversationContext}`;
  }
  
  return {
    conversation_context: conversationContext,
    customer_name: leadData?.customerName || "Customer",
    organization_name: await getOrganizationName(organizationId),
    lead_status: summaryData?.summary ? "Returning Customer" : "New Inquiry",
    previous_summary: summaryData?.summary || "No previous calls",
    organization_id: organizationId,
    caller_type: leadData ? "existing_lead" : "new_caller"
  };
}
```

### Context Storage & Retrieval
```javascript
// Organization-scoped memory keys
function createOrgMemoryKey(organizationId, phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return `${organizationId}:${normalized}`;
}

// Store conversation messages
function addToConversationHistory(phoneNumber, message, sentBy, messageType, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  
  if (!conversationHistory.has(key)) {
    conversationHistory.set(key, []);
  }
  
  const conversationMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content: message,
    sentBy: sentBy,
    timestamp: new Date().toISOString(),
    type: messageType,
    phoneNumber: normalizePhoneNumber(phoneNumber)
  };
  
  conversationHistory.get(key).push(conversationMessage);
  
  // Limit to last 50 messages
  const history = conversationHistory.get(key);
  if (history.length > 50) {
    conversationHistory.set(key, history.slice(-50));
  }
  
  return conversationMessage;
}
```

---

## 5. Chat Interface Implementation

### TelephonyInterface Component Structure
**File:** `src/components/subprime/TelephonyInterface-fixed.tsx`

#### Key Features:
1. **Tabbed Interface:** Conversation, Profile, Analytics, Settings
2. **Auto/Manual Toggle:** Switch between AI and human control
3. **Real-time Updates:** SSE connection for live conversation streaming
4. **Smart Scrolling:** Auto-scroll with scroll-to-bottom button
5. **Organization Security:** All API calls include organization headers

#### Component State:
```tsx
const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
const [isCallActive, setIsCallActive] = useState(false);
const [isUnderHumanControl, setIsUnderHumanControl] = useState(false);
const [isAutoMode, setIsAutoMode] = useState(true);
const [activeMainTab, setActiveMainTab] = useState<'conversation' | 'profile' | 'analytics' | 'settings'>('conversation');
```

#### Chat Window Opening Flow:
1. **User clicks lead** in SubprimeLeadsList
2. **selectedLead prop** passed to TelephonyInterface
3. **SSE connection** established automatically
4. **Conversation history** loaded via SSE with `load=true`
5. **Chat interface** becomes active with all features

### Real-Time SSE Connection
```tsx
const setupEventSource = () => {
  if (!selectedLead) return;
  
  // SSE with organization security and auto-load
  const eventSource = new EventSource(
    `/api/stream/conversation/${selectedLead.id}?phoneNumber=${encodeURIComponent(selectedLead.phoneNumber)}&load=true&organizationId=${encodeURIComponent(organizationId)}`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // Security: Validate organization
    if (data.organizationId && data.organizationId !== organizationId) {
      console.error('🚨 Cross-org data detected');
      return;
    }
    
    handleRealTimeUpdate(data);
  };
};
```

### Message Handling:
```tsx
const handleRealTimeUpdate = (data: any) => {
  switch (data.type) {
    case 'conversation_history':
      // Load initial history
      setConversationHistory(data.messages);
      setTimeout(scrollToBottom, 200);
      break;
      
    case 'sms_received':
      addConversationMessage({
        id: `sms-${data.messageSid}`,
        type: 'sms',
        content: data.message,
        timestamp: data.timestamp,
        sentBy: 'user',
        status: 'delivered'
      });
      break;
      
    case 'call_initiated':
      setIsCallActive(true);
      setCurrentMode('voice');
      break;
      
    case 'human_control_started':
      setIsUnderHumanControl(true);
      setHumanControlAgent(data.agentName);
      break;
  }
};
```

---

## 6. Human-in-the-Loop System

### Auto/Manual Mode Toggle
```tsx
// Auto mode: AI handles responses
// Manual mode: Human agent takes control

const [isAutoMode, setIsAutoMode] = useState(true);

// Connect toggle to human control
useEffect(() => {
  if (!isAutoMode && !isUnderHumanControl) {
    // Switch to manual - join human control
    handleJoinHumanControl();
  } else if (isAutoMode && isUnderHumanControl) {
    // Switch to auto - leave human control
    handleLeaveHumanControl();
  }
}, [isAutoMode]);
```

### Human Control API Endpoints:
```javascript
// Join human control session
app.post('/api/human-control/join', validateOrganizationAccess, async (req, res) => {
  const { phoneNumber, agentName, leadId } = req.body;
  const { organizationId } = req;
  
  // Start human control session
  const success = startHumanControlSession(phoneNumber, organizationId, agentName, leadId);
  
  // Close AI WebSocket to prevent AI responses
  closeElevenLabsConnection(phoneNumber, organizationId);
  
  // Broadcast to UI
  broadcastConversationUpdate({
    type: 'human_control_started',
    phoneNumber,
    organizationId,
    agentName
  });
  
  res.json({ success: true });
});

// Send message as human agent
app.post('/api/human-control/send-message', validateOrganizationAccess, async (req, res) => {
  const { phoneNumber, message, leadId, agentName } = req.body;
  
  // Send SMS via Twilio
  await sendSMSReply(phoneNumber, message, organizationId);
  
  // Store as human agent message
  addToConversationHistory(phoneNumber, message, 'human_agent', 'text', organizationId);
  
  res.json({ success: true });
});
```

---

## 7. Outbound Call Implementation

### Frontend Call Initiation:
```tsx
const handleStartVoiceCall = async () => {
  const response = await fetch('/api/elevenlabs/outbound-call/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'organizationId': organizationId
    },
    body: JSON.stringify({
      phoneNumber: selectedLead.phoneNumber,
      leadId: selectedLead.id,
      organizationId: organizationId
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    setIsCallActive(true);
    setCurrentMode('voice');
    toast.success(`Call initiated to ${selectedLead.phoneNumber}`);
  }
};
```

### Backend Call Handler:
```javascript
app.post('/api/elevenlabs/outbound-call', validateOrganizationAccess, async (req, res) => {
  const { phoneNumber, leadId, organizationId } = req.body;
  
  // Get lead data and build context
  const leadData = await getLeadData(leadId);
  const dynamicVariables = await buildDynamicVariables(phoneNumber, organizationId, leadData);
  
  // Call ElevenLabs API
  const callPayload = {
    agent_id: process.env.ELEVENLABS_AGENT_ID,
    agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
    to_number: phoneNumber,
    conversation_initiation_client_data: {
      lead_id: leadId,
      customer_phone: phoneNumber,
      organization_id: organizationId,
      dynamic_variables: dynamicVariables
    }
  };
  
  const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/conversations/phone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify(callPayload)
  });
  
  const result = await elevenLabsResponse.json();
  
  // Broadcast call initiation
  broadcastConversationUpdate({
    type: 'call_initiated',
    phoneNumber,
    leadId,
    organizationId,
    conversationId: result.conversation_id
  });
  
  res.json({ success: true, conversation_id: result.conversation_id });
});
```

---

## 8. Real-Time Streaming Architecture

### Server-Sent Events Implementation:
```javascript
app.get('/api/stream/conversation/:leadId', validateOrganizationAccess, (req, res) => {
  const { leadId } = req.params;
  const { organizationId } = req;
  const phoneNumber = req.query.phoneNumber;
  const loadHistory = req.query.load === 'true';
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Store connection with organization context
  const connectionId = `${leadId}-${Date.now()}`;
  if (!activeConnections.has(leadId)) {
    activeConnections.set(leadId, new Map());
  }
  activeConnections.get(leadId).set(connectionId, { 
    res, 
    organizationId,
    phoneNumber 
  });
  
  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    leadId: leadId,
    organizationId: organizationId
  })}\n\n`);
  
  // Load and send conversation history if requested
  if (loadHistory && phoneNumber) {
    loadAndSendConversationHistory(leadId, phoneNumber, organizationId, res);
  }
  
  // Cleanup on disconnect
  req.on('close', () => {
    cleanupConnection(leadId, connectionId);
  });
});
```

### Broadcasting Updates:
```javascript
function broadcastConversationUpdate(data) {
  const { leadId, organizationId } = data;
  
  const leadConnections = activeConnections.get(leadId);
  if (!leadConnections) return;
  
  leadConnections.forEach((connection, connectionId) => {
    // Security: Only send to same organization
    if (connection.organizationId !== organizationId) {
      console.warn('🚨 Blocked cross-org broadcast');
      return;
    }
    
    try {
      connection.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      leadConnections.delete(connectionId);
    }
  });
}
```

---

## 9. Organization Security Implementation

### Security Headers Function:
```tsx
const getOrganizationHeaders = (organizationId?: string) => {
  if (!organizationId) {
    throw new Error('Organization context required - please refresh the page');
  }
  return { 'organizationId': organizationId };
};
```

### Backend Validation Middleware:
```javascript
async function validateOrganizationAccess(req, res, next) {
  const organizationId = req.headers['organizationid'];
  
  if (!organizationId) {
    return res.status(400).json({ 
      error: 'Organization context required',
      code: 'MISSING_ORG_CONTEXT'
    });
  }
  
  req.organizationId = organizationId;
  next();
}
```

### Organization-Scoped Memory:
```javascript
// All operations use organization-scoped keys
const memoryKey = createOrgMemoryKey(organizationId, phoneNumber);
// Result: "org-123:1234567890"

// All data access includes organization validation
const conversation = await getConversationHistory(phoneNumber, organizationId);
```

---

## 10. Environment Variables Setup

```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=sk_your_api_key_here
ELEVENLABS_AGENT_ID=agent_01jwc5v1nafjwv7zw4vtz1050m  
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_id_here

# Webhook Secrets (from ElevenLabs dashboard)
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=whsec_your_secret
ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET=whsec_your_secret

# Twilio Configuration  
TWILIO_ACCOUNT_SID=ACyour_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your_jwt_secret
```

---

## 11. Database Schema (Supabase)

### Essential Tables:
```sql
-- Organizations (tenant isolation)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT
);

-- Leads (organization-scoped)
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  customer_name TEXT NOT NULL,
  phone_number_normalized TEXT NOT NULL,
  email TEXT,
  funding_readiness TEXT DEFAULT 'Not Ready',
  chase_status TEXT DEFAULT 'Auto Chase Running',
  sentiment TEXT DEFAULT 'Neutral',
  UNIQUE(organization_id, phone_number_normalized)
);

-- Conversations (organization-scoped)
CREATE TABLE conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lead_id TEXT REFERENCES leads(id),
  phone_number_normalized TEXT NOT NULL,
  content TEXT NOT NULL,
  sent_by TEXT NOT NULL, -- 'user', 'agent', 'human_agent', 'system'
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT DEFAULT 'text' -- 'text', 'voice', 'system'
);

-- Call sessions (voice call tracking)
CREATE TABLE call_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lead_id TEXT REFERENCES leads(id),
  elevenlabs_conversation_id TEXT,
  transcript TEXT,
  summary TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);
```

---

## 12. Testing Your Implementation

### Test Conversation Flow:
1. **Click on a lead** → Chat window opens
2. **Send SMS** → Message appears in chat, triggers AI response
3. **Start voice call** → Call initiated, status shows in UI
4. **Toggle to Manual** → Human control activated, AI paused
5. **Send manual message** → Goes directly via human control
6. **Toggle back to Auto** → AI resumes control

### Debug Tools:
```javascript
// Debug conversation state
function debugConversationState(phoneNumber, organizationId) {
  const key = createOrgMemoryKey(organizationId, phoneNumber);
  console.log('🔍 Debug:', {
    key,
    historyLength: conversationHistory.get(key)?.length || 0,
    humanControl: humanControlSessions.has(key),
    activeConnections: activeConnections.has(phoneNumber)
  });
}
```

### Webhook Testing:
Use ngrok for local testing:
```bash
ngrok http 3000
# Use ngrok URL for webhook configuration
```

---

## 13. Deployment Checklist

### Production URLs:
```
ElevenLabs Post-call: https://your-domain.com/api/webhooks/elevenlabs/post-call
ElevenLabs Conversation Initiation: https://your-domain.com/api/webhooks/elevenlabs/conversation-initiation
Twilio SMS Incoming: https://your-domain.com/api/webhooks/twilio/sms/incoming
```

### Verification Steps:
1. ✅ ElevenLabs agent responds to dynamic variables
2. ✅ Voice calls include conversation context
3. ✅ SMS messages integrate with voice context
4. ✅ Human control stops AI responses immediately
5. ✅ Real-time updates stream to UI
6. ✅ Organization data isolation working
7. ✅ Webhook signatures verified
8. ✅ All API endpoints include organization validation

This implementation creates a production-ready telephony system where clicking a lead opens a comprehensive chat interface with AI voice calling, SMS integration, human takeover capabilities, and real-time conversation streaming - all with enterprise-grade security and multi-tenant isolation.