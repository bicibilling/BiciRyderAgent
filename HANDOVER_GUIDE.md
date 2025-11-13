# Client Handover Guide - Complete Transfer Process

This guide covers transferring the GitHub repo, Twilio number, and deploying to the client's Render account **without breaking anything**.

---

## Part 1: GitHub Repository Transfer

### Option A: Transfer Repo Ownership (Recommended)
**Safest method - keeps all history, issues, and settings**

1. **Client creates GitHub account** (if they don't have one)
   - Have them send you their GitHub username

2. **Transfer the repository:**
   - Go to: https://github.com/divhit/bici-cli-agent/settings
   - Scroll to "Danger Zone" → Click "Transfer"
   - Enter: `bici-cli-agent`
   - Enter client's GitHub username
   - Confirm transfer

3. **What this preserves:**
   - ✅ All commit history
   - ✅ All branches
   - ✅ GitHub Actions (if any)
   - ✅ Issues and PRs
   - ✅ Settings

### Option B: Create New Repo for Client (Alternative)
**If you want to keep your copy**

1. **Client creates new empty repo on their GitHub:**
   - Name: `bici-cli-agent` (or their preferred name)
   - Private or Public (their choice)
   - DO NOT initialize with README

2. **Push to their repo:**
```bash
cd /Users/divhit/Desktop/bici-cli-agent
git remote add client https://github.com/CLIENT_USERNAME/bici-cli-agent.git
git push client main --all
git push client --tags
```

3. **Remove your remote (optional):**
```bash
git remote remove client
```

---

## Part 2: Twilio Phone Number Transfer

### Current Twilio Number
- **Number:** +1 (604) 670-0262
- **Account SID:** ACa474c6d23cca243aea12953c9dc0970c
- **Your Account:** divhit's Twilio account

### Transfer Process

**IMPORTANT:** Twilio phone numbers CANNOT be transferred between accounts directly. You have two options:

### Option A: Port Number to Client's Twilio Account (Recommended)
**Use this if client wants to keep the exact number**

1. **Client creates Twilio account:**
   - Sign up at https://www.twilio.com/try-twilio
   - Verify their business details
   - Add payment method

2. **Initiate port request in CLIENT's account:**
   - Go to: Phone Numbers → Port a Number
   - Enter: +16046700262
   - Upload Letter of Authorization (LOA)
   - Wait 7-10 business days for completion

3. **During port (number stays active):**
   - Keep webhooks pointing to OLD deployment
   - Don't change anything until port completes

4. **After port completes:**
   - Update webhooks in client's Twilio account
   - Point to their new Render deployment (see Part 3)
   - Test thoroughly

**LOA Requirements:**
- Must be signed by current account owner (you)
- States you authorize transfer to client's account
- Twilio provides template in port request flow

### Option B: Release Number & Client Gets New Number (Faster)
**Use this if exact number doesn't matter**

1. **Client gets new number in their Twilio account:**
   - Buy a new number in their desired area code
   - Configure webhooks (see below)

2. **You release old number:**
   - Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/active
   - Click on +16046700262
   - Release number (ONLY after client's is working)

3. **Update everywhere:**
   - ElevenLabs agent configuration
   - Client's website/marketing materials
   - Google My Business
   - Email signatures

---

## Part 3: Deploy to Client's Render Account

### Prerequisites
✅ Client has Render account (free at https://render.com)
✅ Client has access to GitHub repo (from Part 1)
✅ Client has environment variable values ready

### Step-by-Step Deployment

#### 1. Client Creates Render Account
- Sign up at https://render.com
- Connect GitHub account
- Allow Render to access the `bici-cli-agent` repository

#### 2. Deploy Using Blueprint (Automatic - Recommended)

**This uses the `render.yaml` file already in the repo**

1. **Client goes to Render Dashboard**
   - Click "New" → "Blueprint"
   - Select repository: `bici-cli-agent`
   - Branch: `main`
   - Click "Apply"

2. **Render automatically creates:**
   - `bici-ryder-server` (web service on port 10000)
   - `bici-ryder-dashboard` (static site)

3. **Add Environment Variables** (in bici-ryder-server settings):

   **Required Variables:**
   ```
   ELEVENLABS_API_KEY=sk_their_api_key
   ELEVENLABS_AGENT_ID=agent_their_agent_id
   ELEVENLABS_PHONE_NUMBER_ID=phnum_their_phone_number_id
   TWILIO_ACCOUNT_SID=ACtheir_account_sid
   TWILIO_AUTH_TOKEN=their_auth_token
   TWILIO_PHONE_NUMBER=+1their_phone_number
   ```

   **Pre-configured Variables** (from render.yaml):
   ```
   NODE_ENV=production
   PORT=10000
   STORE_TIMEZONE=America/Vancouver
   STORE_NAME=Bici
   STORE_ADDRESS=1497 Adanac Street, Vancouver, BC, Canada
   STORE_PHONE=+17787193080
   STORE_WEBSITE=https://www.bici.cc
   ```

4. **Wait for deployment:**
   - Server: ~3-5 minutes
   - Dashboard: ~2-3 minutes

5. **Get deployment URLs:**
   - Server: `https://bici-ryder-server.onrender.com`
   - Dashboard: `https://bici-ryder-dashboard.onrender.com`

#### 3. Manual Deployment (Alternative)

If Blueprint doesn't work:

**Deploy Server:**
1. New → Web Service
2. Connect repository: `bici-cli-agent`
3. Settings:
   - Name: `bici-ryder-server`
   - Runtime: `Node`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
   - Port: `10000`
4. Add all environment variables from above
5. Click "Create Web Service"

**Deploy Dashboard:**
1. New → Static Site
2. Connect repository: `bici-cli-agent`
3. Settings:
   - Name: `bici-ryder-dashboard`
   - Build Command: `cd client && npm install && npm run build`
   - Publish Directory: `client/dist`
4. Add environment variable:
   - `VITE_API_URL=https://bici-ryder-server.onrender.com/api`
5. Click "Create Static Site"

---

## Part 4: Configure Webhooks (CRITICAL)

Once Render deployment is live, update webhooks:

### A. Twilio Webhooks

**In Client's Twilio Console:**
1. Go to: Phone Numbers → Active Numbers
2. Click on their phone number
3. Configure:

**Voice Configuration:**
- A call comes in: `Webhook`
- URL: `https://bici-ryder-server.onrender.com/api/webhooks/twilio/voice`
- HTTP: `POST`

**Messaging Configuration:**
- A message comes in: `Webhook`
- URL: `https://bici-ryder-server.onrender.com/api/webhooks/twilio/sms`
- HTTP: `POST`

4. Save

### B. ElevenLabs Webhooks

**In Client's ElevenLabs Agent Settings:**
1. Go to: Conversational AI → Agents → [Their Agent]
2. Webhooks tab
3. Configure:

**Conversation Initiation:**
- URL: `https://bici-ryder-server.onrender.com/api/webhooks/elevenlabs/conversation-start`
- Events: `conversation_initiation`

**Post Call:**
- URL: `https://bici-ryder-server.onrender.com/api/webhooks/elevenlabs/post-call`
- Events: `post_call`

**Conversation Interruption:**
- URL: `https://bici-ryder-server.onrender.com/api/webhooks/elevenlabs/conversation-interrupt`
- Events: `conversation_interruption`

4. Save and copy the webhook secret
5. Add to Render environment variables:
   - `ELEVENLABS_WEBHOOK_SECRET=their_webhook_secret`

---

## Part 5: Testing Checklist

### Before Going Live:

1. **Test Server Health:**
   - Visit: `https://bici-ryder-server.onrender.com/health`
   - Should return: `{"status":"ok"}`

2. **Test Dashboard:**
   - Visit: `https://bici-ryder-dashboard.onrender.com`
   - Should load dashboard interface
   - Check API connection in browser console

3. **Test Phone Call:**
   - Call the Twilio number
   - Verify agent answers
   - Verify dynamic greeting works
   - Test product search
   - Test human transfer

4. **Test SMS:**
   - Send text to Twilio number
   - Verify response
   - Check conversation context

5. **Check Logs:**
   - Render Dashboard → bici-ryder-server → Logs
   - Verify no errors during test call
   - Check webhook delivery

### Common Issues:

**Issue: Server returns 500 errors**
- Check Render logs for missing environment variables
- Verify all required env vars are set
- Check database connection (if using Supabase)

**Issue: Webhooks not received**
- Verify webhook URLs are correct (use Render service URL)
- Check Render logs to see if requests are arriving
- Verify webhook secret matches in both places

**Issue: Agent doesn't respond**
- Check ELEVENLABS_AGENT_ID is correct
- Verify ELEVENLABS_API_KEY has correct permissions
- Check ElevenLabs dashboard for agent status

**Issue: Dashboard can't connect to API**
- Check VITE_API_URL is set correctly in static site
- Verify CORS is enabled in server (should be by default)
- Check browser console for errors

---

## Part 6: Post-Handover Cleanup

### What YOU should do after handover:

1. **Keep your deployment running for 7 days:**
   - Ensures smooth transition
   - Allows rollback if issues arise

2. **After client confirms everything works:**
   - Delete your Render services (bici-ryder-server, bici-ryder-dashboard)
   - Release Twilio number (if they got new one)
   - Archive or delete your local repo copy

3. **Transfer or delete these accounts (if client-specific):**
   - Supabase project (if used)
   - Any monitoring services
   - Domain/DNS records

### What CLIENT should do:

1. **Update documentation:**
   - Change webhook URLs in runbook
   - Update deployment process docs
   - Document their Render account details

2. **Set up monitoring:**
   - Render email alerts
   - Uptime monitoring (optional)
   - Log aggregation (optional)

3. **Backup strategy:**
   - Database backups (if applicable)
   - Regular Git commits
   - Environment variable backup (secure location)

---

## Quick Reference: All URLs & Credentials

### GitHub
- Original: `https://github.com/divhit/bici-cli-agent`
- Client's: `https://github.com/CLIENT_USERNAME/bici-cli-agent`

### Twilio
- Current number: `+16046700262`
- Current account: `ACa474c6d23cca243aea12953c9dc0970c`
- Client's account: `[Their new SID]`

### Render Deployment
- Server: `https://bici-ryder-server.onrender.com`
- Dashboard: `https://bici-ryder-dashboard.onrender.com`
- Health check: `https://bici-ryder-server.onrender.com/health`

### ElevenLabs
- Current agent: `agent_7201k9x8c9axe9h99csjf4z59821`
- Current API key: `sk_c01c7176f11e1128246a8daa1a0265ec6bfec6aa9879ed6e`
- Client's agent: `[Their new agent ID]`
- Client's API key: `[Their new key]`

### Environment Variables Client Needs
See `.env.example` file for complete list with descriptions.

**Minimum required:**
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_PHONE_NUMBER_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

---

## Timeline Estimate

| Task | Time Required | Can Break Things? |
|------|---------------|-------------------|
| GitHub transfer | 5 minutes | No |
| Client creates Render account | 10 minutes | No |
| Deploy to Render (Blueprint) | 5-10 minutes | No |
| Add environment variables | 15 minutes | No |
| Configure Twilio webhooks | 5 minutes | **Yes** - test first |
| Configure ElevenLabs webhooks | 10 minutes | **Yes** - test first |
| Testing | 30 minutes | - |
| Twilio number port | 7-10 business days | No (seamless) |

**Total hands-on time:** ~2 hours
**Total calendar time:** 1-2 weeks (if porting number)

---

## Support During Handover

**Recommended handover process:**
1. Schedule 2-hour session with client
2. Walk through deployment together (screen share)
3. Test everything while both online
4. Keep your deployment running as backup
5. Client tests independently for 48 hours
6. Final handoff call to confirm and cleanup

**Emergency rollback:**
- If client's deployment has issues
- Point webhooks back to your Render deployment
- Investigate issue without downtime
- Fix and re-deploy to client's account

---

**End of Handover Guide**

Questions? Issues? Best to handle these during the scheduled handover session.
