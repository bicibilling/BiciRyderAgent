# ElevenLabs Conversational AI Integration

This document explains the fixed ElevenLabs integration based on the official API documentation.

## What Was Fixed

### 1. Outbound Call API Endpoint ✅
- **Fixed**: Updated endpoint from `/convai/conversations/phone` to `/convai/twilio/outbound-call`
- **Location**: `/api/routes/conversations.js` and `/api/services/elevenLabsService.js`
- **Impact**: Now uses the correct ElevenLabs Twilio integration endpoint

### 2. API Payload Structure ✅
- **Fixed**: Updated payload to use correct parameters:
  - `agent_id`
  - `agent_phone_number_id` 
  - `to_number`
  - `conversation_initiation_client_data`
- **Location**: `/api/routes/conversations.js`
- **Impact**: Payload now matches official ElevenLabs API specification

### 3. Authentication Headers ✅
- **Fixed**: Updated headers to use:
  - `xi-api-key` (instead of any other format)
  - `Content-Type: application/json`
- **Location**: Both conversation routes and service files
- **Impact**: Authentication now follows ElevenLabs standard

### 4. Response Field Names ✅
- **Fixed**: Updated response handling to use `call_id` instead of `call_sid`
- **Location**: Service and route files
- **Impact**: Proper handling of ElevenLabs API responses

### 5. Environment Variables ✅
- **Added**: Missing environment variables and proper naming
- **Location**: `.env` file
- **Added Variables**:
  ```
  ELEVENLABS_API_KEY=your_api_key_here
  ELEVENLABS_AGENT_ID=your_agent_id_here
  ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id_here
  ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=your_webhook_secret
  ```

## Configuration

### Required Environment Variables

Add these to your `.env` file:

```bash
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_actual_api_key
ELEVENLABS_AGENT_ID=your_actual_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_actual_phone_number_id

# Webhook Secrets
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=your_post_call_webhook_secret
ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=your_conversation_initiation_webhook_secret
```

### Getting Your ElevenLabs Credentials

1. **API Key**: Get from [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. **Agent ID**: Create an agent in the ElevenLabs dashboard and copy the ID
3. **Phone Number ID**: Set up a phone number in ElevenLabs and get its ID
4. **Webhook Secrets**: Configure in your ElevenLabs webhook settings

## Testing the Integration

### Run the Test Suite

```bash
# Run the integration test
node test-elevenlabs.js
```

This will:
- ✅ Test API connectivity
- ✅ Validate outbound call payload format  
- ✅ Verify webhook payload structures
- ✅ Check authentication headers

### Test with Real API (Optional)

To test with actual API calls:

```bash
# Set environment variable to disable dry-run mode
ELEVENLABS_TEST_DRY_RUN=false node test-elevenlabs.js
```

⚠️ **Warning**: This will make real API calls and may consume credits.

## API Endpoints

### Outbound Call Endpoint
```
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
```

**Headers:**
```
xi-api-key: your_api_key
Content-Type: application/json
```

**Payload:**
```json
{
  "agent_id": "your_agent_id",
  "agent_phone_number_id": "your_phone_number_id", 
  "to_number": "+1234567890",
  "conversation_initiation_client_data": {
    "lead_id": "lead_123",
    "customer_phone": "+1234567890",
    "organization_id": "org_456",
    "dynamic_variables": {
      "customer_name": "John Doe",
      "organization_name": "BICI Bike Store"
    }
  }
}
```

**Response:**
```json
{
  "conversation_id": "conv_abc123",
  "call_id": "call_def456", 
  "status": "initiated"
}
```

## Webhook Endpoints

### 1. Conversation Initiation Webhook
```
POST /api/webhooks/elevenlabs/conversation-initiation
```

**Expected Payload:**
```json
{
  "caller_id": "+1234567890",
  "conversation_id": "conv_abc123",
  "client_data": {
    "lead_id": "lead_123",
    "organization_id": "org_456"
  }
}
```

**Response:**
```json
{
  "success": true,
  "dynamic_variables": {
    "customer_name": "John Doe",
    "organization_name": "BICI Bike Store",
    "conversation_context": "Previous conversation history...",
    "lead_status": "Returning Customer"
  }
}
```

### 2. Post-Call Webhook
```
POST /api/webhooks/elevenlabs/post-call
```

**Expected Payload:**
```json
{
  "conversation_id": "conv_abc123",
  "phone_number": "+1234567890",
  "transcript": "Full conversation transcript...",
  "analysis": {
    "duration": 120,
    "sentiment": "positive"
  },
  "call_duration": 120,
  "call_outcome": "completed",
  "client_data": {
    "lead_id": "lead_123",
    "organization_id": "org_456"
  }
}
```

## Usage Example

### Making an Outbound Call

```javascript
// POST /api/conversations/outbound-call
const response = await fetch('/api/conversations/outbound-call', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_jwt_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phoneNumber: '+1234567890',
    leadId: 'lead_123',
    callReason: 'follow_up',
    customMessage: 'Following up on your bike inquiry'
  })
});

const result = await response.json();
console.log('Call initiated:', result.data.conversationId);
```

## Error Handling

The implementation now includes proper error handling for:

- ❌ **400 Bad Request**: Invalid payload format
- ❌ **401 Unauthorized**: Invalid API key
- ❌ **403 Forbidden**: Insufficient permissions
- ❌ **429 Too Many Requests**: Rate limiting
- ❌ **500 Internal Server Error**: ElevenLabs API errors

## Troubleshooting

### Common Issues

1. **400 Error on Outbound Calls**
   - ✅ Fixed: Now using correct endpoint and payload format
   - Verify your `agent_id` and `agent_phone_number_id` are correct

2. **Authentication Errors**
   - ✅ Fixed: Now using `xi-api-key` header
   - Verify your API key is active and has sufficient credits

3. **Webhook Signature Verification**
   - ✅ Fixed: Using proper signature validation
   - Ensure webhook secrets are configured correctly

4. **Response Field Errors**
   - ✅ Fixed: Now using `call_id` instead of `call_sid`
   - Updated all response handling to match ElevenLabs format

## Development vs Production

- **Development**: Uses mock responses when API credentials aren't set
- **Production**: Makes actual API calls to ElevenLabs when properly configured
- **Testing**: Dry-run mode validates request format without making calls

## Next Steps

1. Set up your ElevenLabs account and get API credentials
2. Configure the environment variables
3. Run the test suite to verify everything works
4. Deploy with webhook endpoints configured in ElevenLabs dashboard
5. Monitor logs and test with real phone calls

The implementation is now fully compatible with the official ElevenLabs Conversational AI API documentation.