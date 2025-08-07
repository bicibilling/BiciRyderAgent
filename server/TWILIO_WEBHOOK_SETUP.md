# Twilio Webhook Configuration

## SMS Webhook Setup

To enable SMS responses, configure these webhooks in your Twilio Console:

### 1. Go to Twilio Console
- Navigate to **Phone Numbers** > **Manage** > **Active numbers**
- Click on your phone number: **+17786528784**

### 2. Configure SMS Webhook
In the **Messaging** section, set:

**Webhook URL**: `https://bici-voice-agent.onrender.com/webhooks/twilio/sms`
**HTTP Method**: `POST`

### 3. Configure Status Callback (Optional)
**Status Callback URL**: `https://bici-voice-agent.onrender.com/webhooks/twilio/sms/status`
**HTTP Method**: `POST`

## Test SMS Flow

1. **Send SMS from dashboard** → Should appear in conversation interface
2. **Reply via SMS** → Should trigger AI response
3. **Check logs** for webhook reception

## Debugging

Check these logs to verify:
- `Incoming SMS received:` - Webhook is working
- `SMS stored with conversation:` - Message stored with lead_id
- `SMS sent successfully:` - Response sent

## ElevenLabs SMS Integration (Future)

For more sophisticated SMS responses using ElevenLabs:
1. Use ElevenLabs Conversational AI for SMS
2. Configure dynamic variables like voice calls
3. Maintain conversation context across SMS/voice

## Current Status
- ✅ Outbound SMS working (sending from dashboard)
- ❌ SMS webhook needs Twilio console configuration
- ❌ SMS not appearing in conversation interface (fixed with lead_id)