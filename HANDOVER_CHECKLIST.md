# Client Handover Checklist

## Overview
Complete checklist to transfer the Ryder AI voice agent system to client's full administrative control.

---

## Phase 1: Account Setup ✅

### ElevenLabs Account
- [ ] Account created at https://elevenlabs.io
- [ ] Email verified
- [ ] Upgraded to Creator plan ($99/mo)
- [ ] API key generated and saved securely
- [ ] Payment method added
- [ ] 2FA enabled for security

### Twilio Account
- [ ] Account created at https://www.twilio.com
- [ ] Email and phone verified
- [ ] Business profile completed
- [ ] Identity documents submitted
- [ ] Account SID and Auth Token saved
- [ ] Payment method added with auto-recharge
- [ ] 2FA enabled for security

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Phase 2: Agent Migration ✅

### MCP Server Setup
- [ ] Logged into ElevenLabs account
- [ ] Created MCP server: "BICI Shopify Storefront"
- [ ] URL configured: `https://la-bicicletta-vancouver.myshopify.com/api/mcp`
- [ ] Transport set to: Streamable HTTP
- [ ] Approval policy: Auto-approve all
- [ ] MCP server ID copied and saved
- [ ] Tested MCP endpoint returns products

### Agent Configuration
- [ ] Created new agent: "Ryder - Bici AI Teammate"
- [ ] Voice selected and configured (Adam or similar)
- [ ] Voice settings: Stability 0.85, Similarity 0.75, Style 0.15
- [ ] LLM set to: Gemini 2.0 Flash
- [ ] Temperature: 0.2, Max Tokens: 500
- [ ] System prompt copied from `ryder-bici-ai.json`
- [ ] Store information updated (name, address, hours)
- [ ] **Shimano shoes fix applied** (updated filter protocol)
- [ ] First message set to: `{{dynamic_greeting}}`
- [ ] Language detection enabled
- [ ] Transfer to number configured: +17787193080
- [ ] MCP server connected to agent
- [ ] Conversation settings configured (1hr max, 5min timeout)

### Data Collection
- [ ] customer_name field added
- [ ] bike_type field added
- [ ] purchase_timeline field added
- [ ] budget_range field added
- [ ] riding_experience field added
- [ ] customer_triggers field added
- [ ] follow_up_needed field added

### Webhooks (Optional - if using backend)
- [ ] conversation_initiation webhook configured
- [ ] post_call webhook configured
- [ ] conversation_interruption webhook configured
- [ ] Webhook URLs using HTTPS
- [ ] Webhooks tested and responding 200 OK

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Phase 3: Phone Number Transfer ✅

### Pre-Transfer
- [ ] Decided on transfer method (Internal Twilio vs External Port)
- [ ] Gathered all required information
- [ ] Letter of Authorization prepared (if needed)
- [ ] Developer authorization obtained
- [ ] Current account details confirmed

### Port Request
- [ ] Port request submitted to Twilio
- [ ] Support ticket number: _______________
- [ ] FOC date set: _______________
- [ ] All documents uploaded
- [ ] Confirmation received from Twilio

### Post-Transfer
- [ ] Number shows in your Twilio account as "Active"
- [ ] Twilio webhooks configured for voice
- [ ] Number connected to ElevenLabs agent
- [ ] Number assigned to "Ryder - Bici AI Teammate"
- [ ] Caller ID settings verified

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

**FOC Date:** _______________

---

## Phase 4: Testing ✅

### Basic Functionality Tests
- [ ] Called +1 (604) 670-0262
- [ ] Agent answers with proper greeting
- [ ] Greeting includes current date/time/hours
- [ ] Agent asks for customer name
- [ ] Agent responds in natural, conversational tone
- [ ] Agent ends each turn with a question

### Inventory Search Tests
- [ ] Asked: "Do you have Shimano shoes?"
  - [ ] Agent makes tool call
  - [ ] Returns actual products (RX600, RC703, etc.)
  - [ ] Provides prices and availability

- [ ] Asked: "Show me Cannondale bikes under $3000"
  - [ ] Uses correct filters (productType: "Bikes")
  - [ ] Returns relevant results
  - [ ] Prices within budget range

- [ ] Asked: "What road cycling shoes do you have?"
  - [ ] Does NOT use productType filter
  - [ ] Returns shoe results successfully
  - [ ] No empty result errors

### Transfer & Hours Tests
- [ ] During business hours:
  - [ ] Asked: "Can I speak to someone?"
  - [ ] Agent transfers immediately to +17787193080
  - [ ] Transfer connects successfully

- [ ] After business hours:
  - [ ] Called outside 8am-6pm Mon-Fri or 9am-4:30pm Sat-Sun
  - [ ] Agent states correct closure status
  - [ ] Offers voicemail transfer option
  - [ ] Transfers to voicemail when requested

### Edge Cases
- [ ] Interrupted agent mid-sentence - handles gracefully
- [ ] Silent for 10+ seconds - agent prompts appropriately
- [ ] Asked in French - agent responds in French
- [ ] Asked for directions - does NOT read URL aloud
- [ ] Multiple products requested - shows 2-3 max, conversational

### Quality Tests
- [ ] Voice quality clear and professional
- [ ] No robotic or choppy speech
- [ ] Responses are 2-3 sentences max
- [ ] Agent doesn't repeat itself unnecessarily
- [ ] Natural conversation flow maintained

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

**Test Date:** _______________

---

## Phase 5: Backend (Optional) ✅

Only complete this if you want custom webhooks, customer memory, or SMS features.

### Render Deployment (or other host)
- [ ] Created Render account
- [ ] Cloned codebase repository
- [ ] Created Web Service for API
- [ ] Environment variables configured
- [ ] Backend deployed successfully
- [ ] Backend URL: _______________

### Environment Variables
- [ ] ELEVENLABS_API_KEY - Your key
- [ ] ELEVENLABS_AGENT_ID - New agent ID
- [ ] TWILIO_ACCOUNT_SID - Your account
- [ ] TWILIO_AUTH_TOKEN - Your token
- [ ] TWILIO_PHONE_NUMBER - +16046700262
- [ ] STORE_TIMEZONE - America/Vancouver
- [ ] STORE_NAME - La Bicicletta Vancouver
- [ ] STORE_ADDRESS - 1497 Adanac Street, Vancouver, BC
- [ ] STORE_PHONE - +17787193080
- [ ] All other variables from `.env.example`

### Webhook Testing
- [ ] GET /health returns 200 OK
- [ ] POST /api/webhooks/elevenlabs/conversation-start responds
- [ ] POST /api/webhooks/elevenlabs/post-call responds
- [ ] Returns dynamic_greeting with current date/time
- [ ] Logs show webhook calls from ElevenLabs

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

**Backend URL:** _______________

---

## Phase 6: Documentation & Handoff ✅

### Documentation Review
- [ ] Read CLIENT_SETUP_GUIDE.md
- [ ] Read AGENT_MIGRATION_GUIDE.md
- [ ] Read TWILIO_NUMBER_TRANSFER_GUIDE.md
- [ ] Read PROMPT_UPDATE.md (Shimano fix)
- [ ] Read SHIMANO_SHOES_FIX.md (troubleshooting)
- [ ] Reviewed agent_configs/dev/ryder-bici-ai.json

### Access Transfer
- [ ] Received all credentials securely
- [ ] ElevenLabs account credentials
- [ ] Twilio account credentials
- [ ] Backend access (if applicable)
- [ ] Render/hosting access (if applicable)
- [ ] GitHub repo access (if needed for updates)

### Training
- [ ] Trained on how to update agent prompt
- [ ] Shown how to view conversation logs
- [ ] Demonstrated analytics dashboard
- [ ] Explained how to handle common issues
- [ ] Provided support resources list

### Business Information Updates
- [ ] Website updated with new ownership
- [ ] Google My Business updated
- [ ] Social media profiles updated
- [ ] Email signatures updated
- [ ] Staff trained on new system

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Phase 7: Monitoring & Optimization ✅

### First Week
- [ ] Day 1: Monitor first 10 calls closely
- [ ] Day 2-3: Review conversation transcripts
- [ ] Day 4-5: Check analytics data collection
- [ ] Day 6-7: Gather customer feedback
- [ ] Week 1: Document any issues found

### Ongoing
- [ ] Set up billing alerts (Twilio & ElevenLabs)
- [ ] Schedule weekly log reviews
- [ ] Monitor call quality and completion rates
- [ ] Track common customer questions
- [ ] Plan prompt improvements based on data

### Performance Metrics
- [ ] Call answer rate: Target >95%
- [ ] Successful inventory searches: Target >90%
- [ ] Transfer success rate: Target >90%
- [ ] Customer satisfaction (if tracked)
- [ ] Average call duration

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Developer Sign-Off

### Developer Checklist
- [ ] All account credentials transferred securely
- [ ] Phone number port request authorized
- [ ] Developer account decommission plan in place
- [ ] Billing transferred to client account
- [ ] No remaining dependencies on developer accounts
- [ ] Final invoice/payment settled (if applicable)

**Developer Signature:** _______________ **Date:** _______________

---

## Client Sign-Off

### Client Checklist
- [ ] Received all credentials and access
- [ ] Able to log into all systems independently
- [ ] Phone number working in our account
- [ ] Agent performing as expected
- [ ] Comfortable managing system ongoing
- [ ] Support resources documented
- [ ] Training completed

**Client Signature:** _______________ **Date:** _______________

---

## Post-Handover Support

### 30-Day Support Period
- [ ] Developer available for questions via: _______________
- [ ] Response time commitment: _______________
- [ ] Issues to contact developer about:
  - Agent configuration questions
  - Webhook troubleshooting
  - Prompt optimization help
  - Technical debugging

### Long-Term Support
- [ ] ElevenLabs support contact info saved
- [ ] Twilio support contact info saved
- [ ] Community resources bookmarked
- [ ] Emergency contact: _______________

---

## Cost Summary

### One-Time Costs
| Item | Cost | Status |
|------|------|--------|
| ElevenLabs Account Setup | $0 | ☐ |
| Twilio Account Setup | $0 | ☐ |
| Phone Number Port Fee | $0 | ☐ |
| Developer Handover Fee | $_____ | ☐ |
| **Total One-Time** | **$_____** | |

### Monthly Recurring Costs
| Service | Est. Monthly | Actual |
|---------|--------------|--------|
| ElevenLabs Creator Plan | $99 | ☐ |
| Twilio Number + Calls | $10-15 | ☐ |
| Render Backend (optional) | $7-25 | ☐ |
| **Total Monthly** | **$116-139** | **$_____** |

---

## Emergency Contacts

**ElevenLabs Support:**
- Email: support@elevenlabs.io
- Dashboard: https://elevenlabs.io/app

**Twilio Support:**
- Phone: 1-844-997-5769
- Console: https://console.twilio.com/support

**Developer (30 days):**
- Email: _______________
- Phone: _______________

**Render Support (if applicable):**
- Dashboard: https://dashboard.render.com

---

## Final Notes

**Handover Date:** _______________

**Next Review Date:** _______________

**Outstanding Items:**
1. _______________
2. _______________
3. _______________

**Additional Comments:**
_______________________________________________
_______________________________________________
_______________________________________________

---

## Success Criteria

✅ **System is successfully handed over when:**
- [ ] Client can independently manage agent
- [ ] Phone number fully transferred and working
- [ ] All accounts under client ownership
- [ ] No dependencies on developer accounts
- [ ] Client confident in operating system
- [ ] Documentation complete and accessible
- [ ] First week monitoring complete with no critical issues

---

**Status:** ☐ Handover in Progress | ☐ **Handover Complete** ✅

**Completion Date:** _______________
