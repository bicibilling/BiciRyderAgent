# Client Handover: Complete Guide

## Welcome! 🚴

This folder contains everything you need to transfer the **Ryder AI Voice Agent** system to your own accounts with full administrative control.

---

## What You're Getting

**"Ryder - Bici AI Teammate"** is a fully functional AI voice agent that:
- ✅ Answers calls at **+1 (604) 670-0262**
- ✅ Provides store hours, location, and information
- ✅ Searches your Shopify inventory in real-time
- ✅ Transfers calls to humans when needed (+17787193080)
- ✅ Handles after-hours voicemail
- ✅ Supports 33+ languages including French
- ✅ Remembers customer context across conversations

---

## Step-by-Step Handover Process

Follow these guides **in order**:

### 📋 Step 1: Account Setup (30-60 minutes)
**File:** `CLIENT_SETUP_GUIDE.md`

Create your ElevenLabs and Twilio accounts:
- ElevenLabs account (Creator plan $99/mo)
- Twilio account with business verification
- Payment methods and API keys

**Goal:** Have both accounts created and verified ✅

---

### 🤖 Step 2: Recreate the Agent (1-2 hours)
**File:** `AGENT_MIGRATION_GUIDE.md`

Build "Ryder" in your ElevenLabs account:
- MCP server setup (Shopify integration)
- Complete agent configuration
- Voice settings and personality
- System prompt with **Shimano shoes fix**
- Tools and webhooks
- Testing checklist

**Goal:** Agent fully configured and responding ✅

---

### 📞 Step 3: Transfer Phone Number (3-7 business days)
**File:** `TWILIO_NUMBER_TRANSFER_GUIDE.md`

Port the phone number to your Twilio account:
- Understand porting process
- Submit port request
- Coordinate with developer
- Configure after port completes

**Goal:** +1 (604) 670-0262 owned by you and working ✅

---

### ✅ Step 4: Final Checklist
**File:** `HANDOVER_CHECKLIST.md`

Complete handover verification:
- All accounts transferred
- Testing completed
- Documentation reviewed
- Developer sign-off
- Ready for production

**Goal:** Full independence and control ✅

---

## Important Bug Fixes Included

### Shimano Shoes Search Issue (FIXED)
**Problem:** Agent couldn't find shoes in inventory despite tool calls
**Solution:** Updated prompt to not use `productType` filters for shoes/accessories

**Files:**
- `PROMPT_UPDATE.md` - Exact prompt changes to make
- `SHIMANO_SHOES_FIX.md` - Technical root cause analysis

**Critical:** Apply this fix when setting up the agent to ensure inventory searches work correctly!

---

## Quick Reference

### Current System Details

**Phone Number:**
```
+1 (604) 670-0262
Provider: Twilio
Label: "Bici Ryder Vancouver"
```

**Store Information:**
```
Name: La Bicicletta Vancouver
Address: 1497 Adanac Street, Vancouver, BC V5L 2B6
Phone: 778-719-3080
Website: https://www.bici.cc
Hours:
  Mon-Fri: 8:00 AM - 6:00 PM
  Sat-Sun: 9:00 AM - 4:30 PM
```

**Agent Configuration:**
```
Name: Ryder - Bici AI Teammate
Voice: Adam (or similar professional male voice)
Model: Gemini 2.0 Flash
Temperature: 0.2
Max Tokens: 500
Transfer Number: +17787193080
```

**MCP Server:**
```
Name: BICI Shopify Storefront
URL: https://la-bicicletta-vancouver.myshopify.com/api/mcp
Type: Streamable HTTP
Tools: search_shop_catalog, get_product_details, search_shop_policies_and_faqs
```

---

## Cost Breakdown

### Monthly Recurring
| Service | Cost | Purpose |
|---------|------|---------|
| ElevenLabs Creator | $99/mo | AI agent platform |
| Twilio | $10-15/mo | Phone number + calls |
| Render (optional) | $7-25/mo | Backend API hosting |
| **Total** | **$116-139/mo** | Complete system |

### One-Time
- Account setup: **FREE**
- Number port: **FREE**
- Developer handover: **[As agreed]**

---

## Timeline Estimate

| Phase | Duration | Depends On |
|-------|----------|------------|
| Account Setup | 1-2 days | Identity verification |
| Agent Configuration | 1 day | Following guide carefully |
| Phone Number Port | 3-7 days | Twilio processing |
| Testing & Go-Live | 1-2 days | Thorough testing |
| **Total** | **1-2 weeks** | Mostly waiting for port |

**Fastest Path:** 5-7 days with prompt responses to verification requests

---

## What You Need to Prepare

### Before Starting
- [ ] Credit card for ElevenLabs and Twilio billing
- [ ] Business verification documents (license, incorporation, tax docs)
- [ ] Access to business email for account verification
- [ ] Phone number for 2FA verification
- [ ] 2-4 hours of focused time for setup

### During Setup
- [ ] Quiet space for testing calls
- [ ] Ability to make/receive test calls
- [ ] Computer with internet access
- [ ] Note-taking for credentials and IDs

---

## Support Resources

### Documentation Files
```
CLIENT_SETUP_GUIDE.md          - Account creation
AGENT_MIGRATION_GUIDE.md       - Agent configuration
TWILIO_NUMBER_TRANSFER_GUIDE.md - Phone porting
HANDOVER_CHECKLIST.md          - Master checklist
PROMPT_UPDATE.md               - Critical bug fix
SHIMANO_SHOES_FIX.md           - Technical details
```

### Configuration Files
```
agent_configs/dev/ryder-bici-ai.json - Complete agent config
.env.example                         - Environment variables template
tools.json                           - Tool definitions
```

### Getting Help

**ElevenLabs Support:**
- Email: support@elevenlabs.io
- Docs: https://elevenlabs.io/docs
- Discord: https://discord.gg/elevenlabs

**Twilio Support:**
- Phone: 1-844-997-5769
- Console: https://console.twilio.com/support
- Docs: https://www.twilio.com/docs

**Developer (30-day support):**
- Contact through agreed channel
- For technical questions during handover
- Available for troubleshooting

---

## Success Metrics

Your handover is **successful** when:

✅ You can log into both ElevenLabs and Twilio accounts independently
✅ Phone number +1 (604) 670-0262 is in your Twilio account
✅ Agent answers calls with proper greeting
✅ Inventory searches return actual products
✅ Transfers to store phone work correctly
✅ You're comfortable managing the system
✅ No dependencies on developer accounts remain

---

## Common Questions

### Q: Do I need coding experience?
**A:** No! The guides are written for non-technical users. You'll mostly be using web dashboards and forms.

### Q: Can I test before committing to paid plans?
**A:** Unfortunately, phone agent features require the Creator plan ($99/mo). But you can create accounts and explore dashboards on free tiers first.

### Q: What if something goes wrong during the port?
**A:** The current number stays active until the port completes. Brief interruption (< 5 min) during final switch. Can cancel port request before completion date if needed.

### Q: Can I make changes to the agent after handover?
**A:** Yes! You'll have full admin access to modify:
- System prompt and personality
- Voice settings
- Transfer numbers
- Store hours and information
- Webhooks and integrations

### Q: Do I need the backend (Render deployment)?
**A:** Optional. The agent works without it, but you lose:
- Customer context memory across calls
- Dynamic greeting with current date/time
- SMS features (if you plan to add them)
- Call analytics and logging

For most use cases, **backend is recommended** but not required initially.

### Q: How do I update the agent in the future?
**A:**
1. Log into ElevenLabs dashboard
2. Go to Conversational AI → Agents
3. Select "Ryder - Bici AI Teammate"
4. Edit any settings
5. Test thoroughly before going live

---

## Handover Phases

### Phase 1: Preparation (You)
- [ ] Read all documentation
- [ ] Gather business documents
- [ ] Set aside time for setup
- [ ] Understand cost commitments

### Phase 2: Account Creation (You)
- [ ] Create ElevenLabs account
- [ ] Create Twilio account
- [ ] Complete verifications
- [ ] Add payment methods

### Phase 3: Agent Setup (You + Developer)
- [ ] Recreate agent in your account
- [ ] Developer provides configuration details
- [ ] Test agent functionality
- [ ] Apply critical bug fixes

### Phase 4: Number Transfer (You + Developer + Twilio)
- [ ] Submit port request
- [ ] Developer authorizes transfer
- [ ] Wait for processing (3-7 days)
- [ ] Test after completion

### Phase 5: Go Live (You)
- [ ] Final testing checklist
- [ ] Monitor first calls
- [ ] Update business listings
- [ ] Developer sign-off

---

## Emergency Contacts

**System Down:**
1. Check ElevenLabs status: https://status.elevenlabs.io
2. Check Twilio status: https://status.twilio.com
3. Review recent changes in dashboards
4. Contact appropriate support team

**During Port Process:**
- Keep developer contact handy
- Monitor Twilio support ticket
- Don't make changes until port completes

**After Handover:**
- Primary: ElevenLabs/Twilio support
- Backup: Developer (30 days)
- Community: Discord/forums

---

## Let's Get Started! 🚀

**Your next step:**
Open `CLIENT_SETUP_GUIDE.md` and begin with account creation.

**Estimated time to first call in your account:** 5-7 days
**Estimated time to complete independence:** 1-2 weeks

**Questions?** Don't hesitate to reach out during the handover period.

---

## Appendix: File Directory

```
CLIENT_HANDOVER_README.md          ← You are here
CLIENT_SETUP_GUIDE.md              ← Start here
AGENT_MIGRATION_GUIDE.md           ← Then this
TWILIO_NUMBER_TRANSFER_GUIDE.md    ← Then this
HANDOVER_CHECKLIST.md              ← Finally this
PROMPT_UPDATE.md                   ← Critical fix
SHIMANO_SHOES_FIX.md               ← Technical details
INVENTORY_SEARCH_FIX.md            ← Additional context

agent_configs/
  └── dev/
      └── ryder-bici-ai.json       ← Full config reference

server/
  └── (backend codebase if self-hosting)
```

---

**Good luck with your handover! You've got this! 💪🚴**
