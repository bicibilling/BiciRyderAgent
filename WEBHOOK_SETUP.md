# Webhook Configuration Guide

## Critical Understanding: How the Voice Flow Works

```
Customer Call → Twilio Phone → ElevenLabs API → Your App
                     ↓
            (Voice Webhook URL)
         https://api.us.elevenlabs.io/twilio/inbound_call
                     ↓
            ElevenLabs processes call
                     ↓
         Sends webhooks to YOUR app:
         - Conversation Initiation 
         - Post-Call Summary
```

## Twilio Configuration (IMPORTANT)

### For Voice Calls:
1. Go to Twilio Console → Phone Numbers
2. Click on your phone number
3. In the **Voice Configuration** section:
   - **When a call comes in:**
     - Webhook: `https://api.us.elevenlabs.io/twilio/inbound_call`
     - HTTP Method: `POST`
   
⚠️ **DO NOT** use your Render app URL for voice webhooks!
- The voice webhook MUST point to ElevenLabs' API
- ElevenLabs handles the voice call directly
- Your app gets notified through ElevenLabs webhooks (configured separately)

### For SMS Messages:
1. In the same phone number configuration
2. In the **Messaging Configuration** section:
   - **When a message comes in:**
     - Webhook: `https://[your-app].onrender.com/webhooks/twilio/sms`
     - HTTP Method: `POST`
   - **Status Callback URL:**
     - URL: `https://[your-app].onrender.com/webhooks/twilio/sms/status`

## ElevenLabs Configuration

These webhooks notify YOUR app about call events:

1. **Go to ElevenLabs Dashboard → Webhooks**
2. **Add Conversation Initiation Webhook:**
   - URL: `https://[your-app].onrender.com/webhooks/elevenlabs/conversation-initiation`
   - Events: Conversation Started
   - Method: POST

3. **Add Post-Call Webhook:**
   - URL: `https://[your-app].onrender.com/webhooks/elevenlabs/post-call`
   - Events: Conversation Ended
   - Method: POST

## After Render Deployment

Once your app is deployed to Render, you'll need to update:

### ✅ No Changes Needed:
- Twilio voice webhook (stays as `https://api.us.elevenlabs.io/twilio/inbound_call`)

### 🔄 Update These URLs:
Replace `[your-app]` with your actual Render app name (e.g., `bici-voice-agent`):

1. **In Twilio Console (SMS only):**
   - SMS Webhook: `https://bici-voice-agent.onrender.com/webhooks/twilio/sms`
   - Status Callback: `https://bici-voice-agent.onrender.com/webhooks/twilio/sms/status`

2. **In ElevenLabs Dashboard:**
   - Conversation Initiation: `https://bici-voice-agent.onrender.com/webhooks/elevenlabs/conversation-initiation`
   - Post-Call: `https://bici-voice-agent.onrender.com/webhooks/elevenlabs/post-call`

3. **In Render Environment Variables:**
   - `WEBHOOK_BASE_URL`: `https://bici-voice-agent.onrender.com`
   - `TWILIO_WEBHOOK_URL`: `https://bici-voice-agent.onrender.com/webhooks/twilio`

## Testing Your Setup

1. **Test Voice Call:**
   - Call your Twilio number
   - Should connect to ElevenLabs AI agent
   - Check your app logs for webhook notifications

2. **Test SMS:**
   - Send SMS to your Twilio number
   - Should receive automated response
   - Check dashboard for new conversation

3. **Verify in Dashboard:**
   - Open `https://[your-app].onrender.com`
   - Should see leads and conversations
   - Real-time updates should work

## Common Issues

### "Call Failed" or No Voice Response:
- ✅ Ensure Twilio voice webhook is `https://api.us.elevenlabs.io/twilio/inbound_call`
- ❌ NOT your app URL
- Check ElevenLabs agent is active

### No Data in Dashboard:
- Check ElevenLabs webhooks are configured
- Verify webhook secret in environment variables
- Check Render app logs for webhook errors

### SMS Not Working:
- Verify SMS webhook points to YOUR app (not ElevenLabs)
- Check Twilio phone number has SMS capability
- Review Render logs for errors