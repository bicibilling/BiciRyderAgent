# 🚀 DEPLOY TO RENDER - STEP BY STEP

## Current Status
- ✅ **Dashboard**: https://bici-ryder-dashboard.onrender.com (deployed but needs API)
- ❌ **API**: Need to create `bici-ryder-api` service
- ❌ **Webhooks**: Need to update Twilio to use Render URLs

## Step 1: Create API Service on Render

Go to https://dashboard.render.com and create a **Web Service**:

### Basic Configuration
- **Name**: `bici-ryder-api`
- **Git Repository**: `https://github.com/divhit/bici-cli-agent`
- **Branch**: `main`
- **Runtime**: `Node`
- **Region**: `Oregon (US West)` or closest to Vancouverå

### Build & Deploy Settings
- **Build Command**: `cd server && npm install`
- **Start Command**: `cd server && npm start`
- **Auto-Deploy**: `Yes`

### Environment Variables (Critical!)
Add these in Render dashboard → Environment tab:

```
NODE_ENV=production
PORT=10000

# ElevenLabs Configuration
ELEVENLABS_API_KEY=sk_5f1308f7b35eca383dab400080c7513674edec42310a86a8
ELEVENLABS_AGENT_ID=agent_7201k9x8c9axe9h99csjf4z59821
ELEVENLABS_PHONE_NUMBER_ID=phnum_8601k3aqzvzree7858ftsv7m5cdz

# Twilio Configuration  
TWILIO_ACCOUNT_SID=ACa474c6d23cca243aea12953c9dc0970c
TWILIO_AUTH_TOKEN=77db43d9c4426b747e12fae079fc19ec
TWILIO_PHONE_NUMBER=+16046700262

# Store Configuration
STORE_TIMEZONE=America/Vancouver
STORE_NAME=Bici
STORE_ADDRESS=1497 Adanac Street, Vancouver, BC, Canada
STORE_PHONE=+17787193080
STORE_WEBSITE=https://www.bici.cc

# Quebec Area Codes
QUEBEC_AREA_CODES=418,438,450,514,579,581,819,873
```

## Step 2: Update Dashboard Environment

Once API is deployed, you'll get URL like: `https://bici-ryder-api.onrender.com`

Add environment variable to the dashboard service:
```
VITE_API_URL=https://bici-ryder-api.onrender.com/api
```

## Step 3: Update Twilio Webhooks

Once API is deployed, update Twilio phone number webhooks to:

- **Voice URL**: `https://bici-ryder-api.onrender.com/api/webhooks/twilio/voice`
- **SMS URL**: `https://bici-ryder-api.onrender.com/api/webhooks/twilio/sms`
- **Status Callback**: `https://bici-ryder-api.onrender.com/api/webhooks/twilio/status`

## Step 4: Update ElevenLabs Webhooks

Update ElevenLabs agent webhooks to:

- **Conversation Start**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-start`
- **Conversation Interrupt**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-interrupt`  
- **Post Call**: `https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/post-call`

## Expected URLs After Deployment
- **Dashboard**: https://bici-ryder-dashboard.onrender.com
- **API**: https://bici-ryder-api.onrender.com
- **Health Check**: https://bici-ryder-api.onrender.com/health
- **Phone Number**: +1 (604) 670-0262 (same, but webhooks updated)

## Testing
1. Visit dashboard URL to see Ryder interface
2. Call +1 (604) 670-0262 to test voice agent
3. Use "Human Handoff" tab for voice summaries
4. Use "Prompt Editor" tab for team refinements