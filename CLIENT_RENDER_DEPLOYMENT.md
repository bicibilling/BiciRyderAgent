# 🚀 Client Render Deployment Guide

## Quick Deploy to Render (5 minutes)

### Prerequisites
- Render account: (provided separately)
- GitHub repo: https://github.com/bicibilling/BiciRyderAgent

---

## Option 1: Deploy via Render Dashboard (Recommended)

### Step 1: Login to Render
1. Go to https://dashboard.render.com
2. Login with your Render credentials

### Step 2: Create Backend Service
1. Click **"New +"** → **"Web Service"**
2. **Connect Repository**:
   - Click "Connect account" for GitHub
   - Select repository: `bicibilling/BiciRyderAgent`
   - Click "Connect"

3. **Service Configuration**:
   - **Name**: `bici-ryder-backend`
   - **Region**: `Oregon (US West)` or closest
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Instance Type**: Free or Starter

4. **Environment Variables** - Click "Add Environment Variable" for each:
   ```
   NODE_ENV=production
   PORT=10000
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ELEVENLABS_AGENT_ID=your_agent_id
   ELEVENLABS_PHONE_NUMBER_ID=(your_phone_number_id)
   TWILIO_ACCOUNT_SID=(your_twilio_sid)
   TWILIO_AUTH_TOKEN=(your_twilio_token)
   TWILIO_PHONE_NUMBER=(your_phone_number)
   STORE_TIMEZONE=America/Vancouver
   STORE_NAME=Beechee
   STORE_ADDRESS=1497 Adanac Street, Vancouver, BC, Canada
   STORE_PHONE=+17787193080
   STORE_WEBSITE=https://www.bici.cc
   ```

5. Click **"Create Web Service"**

6. **Wait for deployment** (2-3 minutes)
   - Once deployed, note the URL: `https://bici-ryder-backend.onrender.com`

### Step 3: Deploy Dashboard (Optional)
1. Click **"New +"** → **"Static Site"**
2. Select repository: `bicibilling/BiciRyderAgent`
3. **Configuration**:
   - **Name**: `bici-ryder-dashboard`
   - **Build Command**: `cd client && npm install && npm run build`
   - **Publish Directory**: `client/dist`
4. **Environment Variable**:
   ```
   VITE_API_URL=https://bici-ryder-backend.onrender.com/api
   ```
5. Click **"Create Static Site"**

---

## Option 2: Deploy via render.yaml (One-Click)

1. Login to Render dashboard
2. Click **"New +"** → **"Blueprint"**
3. Select repository: `bicibilling/BiciRyderAgent`
4. Render will read `render.yaml` automatically
5. Fill in the required environment variables
6. Click **"Apply"**

---

## After Deployment

### Get Your Backend URL
Once deployed, your backend URL will be:
`https://bici-ryder-backend.onrender.com`

### Configure ElevenLabs Webhooks
You need to configure these webhook URLs in your ElevenLabs agent:

1. **Conversation Initiation**:
   `https://bici-ryder-backend.onrender.com/api/webhooks/elevenlabs/conversation-start`

2. **Post Call**:
   `https://bici-ryder-backend.onrender.com/api/webhooks/elevenlabs/post-call`

3. **Conversation Interrupt**:
   `https://bici-ryder-backend.onrender.com/api/webhooks/elevenlabs/conversation-interrupt`

### Test Your Deployment
1. Visit: `https://bici-ryder-backend.onrender.com/api/health`
2. Should return: `{"status": "ok"}`

---

## Troubleshooting

### Service Won't Start
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure build command completed successfully

### Webhooks Not Working
- Verify webhook URLs in ElevenLabs dashboard
- Check Render logs for incoming requests
- Test webhook endpoint: `curl https://your-backend.onrender.com/api/webhooks/elevenlabs/health`

### Need Help?
Contact: divhit (deployment setup) or check logs in Render dashboard

---

## Cost Estimate
- **Backend (Starter)**: $7/month
- **Dashboard (Free Static Site)**: $0/month
- **Total**: ~$7/month

For production, recommend Starter plan for better performance and uptime.
