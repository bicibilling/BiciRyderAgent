# Agent Migration Guide: Recreate Ryder in Your ElevenLabs Account

## Overview
This guide will help you recreate the "Ryder - Bici AI Teammate" conversational agent in your own ElevenLabs account with the exact same configuration.

---

## Prerequisites
- ✅ ElevenLabs account created and upgraded to Creator plan
- ✅ ElevenLabs API key ready
- ✅ Backend API deployed (if using custom webhooks)

---

## Part 1: Create the MCP Server (Shopify Integration)

The agent uses an MCP (Model Context Protocol) server to search your Shopify inventory in real-time.

### Step 1: Create MCP Server in ElevenLabs

1. **Go to:** https://elevenlabs.io/app/conversational-ai/mcp-servers
2. **Click:** "Create MCP Server"
3. **Fill in details:**

```
Name: BICI Shopify Storefront
Description: Real-time product search for La Bicicletta Vancouver bike shop
Transport: Streamable HTTP
URL: https://la-bicicletta-vancouver.myshopify.com/api/mcp
Approval Policy: Auto-approve all
```

4. **Click:** "Create"
5. **Copy the MCP Server ID** (looks like `Llu7Amc0cv41fW5xa7Ag`)

### Why This Works:
- Shopify's MCP endpoint is publicly accessible
- No authentication needed for product catalog search
- Returns real inventory data with prices, availability, and variants

---

## Part 2: Create the Conversational Agent

### Step 1: Create New Agent

1. **Go to:** https://elevenlabs.io/app/conversational-ai/agents
2. **Click:** "Create Agent"
3. **Choose:** "Start from scratch"

### Step 2: Basic Configuration

**Agent Name:** `Ryder - Bici AI Teammate`

**Description:** `AI voice agent for La Bicicletta Vancouver - handles customer inquiries, inventory searches, and call transfers`

**Tags:** `environment:prod`, `store:bici`, `agent:ryder`

### Step 3: Voice & Language Settings

**Language:** English (EN)

**Voice Selection:**
1. Click "Select Voice"
2. Browse voices or search for a friendly, professional male voice
3. **Current voice ID:** `pNInz6obpgDQGcFmaJgB` (Adam - Professional)
4. **Alternative recommendations:**
   - "Josh" - Friendly and warm
   - "Charlie" - Professional and clear
   - "George" - Conversational and natural

**Voice Settings:**
```
Model: Turbo v2.5 (eleven_turbo_v2)
Stability: 0.85
Similarity Boost: 0.75
Style: 0.15
Speaker Boost: Enabled
```

### Step 4: LLM Configuration

**Model:** Gemini 2.0 Flash

**Temperature:** 0.2 (consistent, predictable responses)

**Max Tokens:** 500 (keeps responses concise)

### Step 5: System Prompt

**IMPORTANT:** Copy the complete system prompt from the file `agent_configs/dev/ryder-bici-ai.json` in the codebase.

The prompt is approximately 263 lines and includes:
- Agent identity and personality
- Store information (hours, location, services)
- Product search protocols
- Human transfer logic
- Customer conversation flow

**Critical sections to update in the prompt:**
```
Store Name: La Bicicletta Vancouver (change from "Beechee")
Location: 1497 Adanac Street, Vancouver, BC
Hours: 8am-6pm Mon-Fri, 9am-4:30pm Sat-Sun
Phone: 778-719-3080
Website: bici.cc
```

**Apply the Shimano shoes fix** from `PROMPT_UPDATE.md`:
- Replace the "Bike Search Protocol" section with the updated version
- This ensures shoes, accessories, and parts searches work correctly

### Step 6: First Message

Set the first message to use dynamic greeting:
```
{{dynamic_greeting}}
```

This variable is injected via webhooks with the current time, date, and store hours.

### Step 7: Tools & Integrations

**Built-in Tools:**
1. **Language Detection**
   - Enable: ✅
   - Allows agent to respond in 33+ languages

2. **Transfer to Number**
   - Enable: ✅
   - Phone Number: `+17787193080` (your store phone)
   - Transfer Type: `SIP Refer`
   - Condition: "When customer asks for human, person, or to speak with someone - transfer immediately"

3. **Play Keypad Touch Tone**
   - Enable: ✅ (for DTMF tones if needed)

**MCP Servers:**
1. Click "Add MCP Server"
2. Select: `BICI Shopify Storefront` (created in Part 1)
3. This gives the agent access to:
   - `search_shop_catalog` - Search products
   - `get_product_details` - Get specific product info
   - `search_shop_policies_and_faqs` - Store policies
   - `get_cart` / `update_cart` - Cart management

### Step 8: Conversation Settings

**Max Duration:** 3600 seconds (1 hour)

**Inactivity Timeout:** 300 seconds (5 minutes)

**Turn Timeout:** 7 seconds

**Mode:** Turn-based (agent waits for customer to finish speaking)

**Client Events:**
- ✅ Audio
- ✅ Interruption

### Step 9: Webhook Configuration

**Important:** These webhooks connect to your backend API for dynamic data and customer memory.

**If using Render deployment:**

1. **Conversation Initiation**
   ```
   URL: https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-start
   Event: conversation_initiation
   ```
   - Injects customer name, context, greeting with current time/date

2. **Post Call**
   ```
   URL: https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/post-call
   Event: post_call
   ```
   - Saves conversation summary for future context

3. **Conversation Interruption**
   ```
   URL: https://bici-ryder-api.onrender.com/api/webhooks/elevenlabs/conversation-interrupt
   Event: conversation_interruption
   ```
   - Handles human takeover scenarios

**If self-hosting:** Replace with your backend URL

**Webhook Security:**
- Enable signature verification if available
- Use HTTPS only
- Monitor webhook logs for errors

### Step 10: Analysis & Data Collection

Configure these data collection fields for analytics:

1. **customer_name** (string): "Extract customer's name if provided"
2. **bike_type** (string): "road, mountain, hybrid, e-bike, kids, or unsure"
3. **purchase_timeline** (string): "immediate, this_week, this_month, just_browsing, unsure"
4. **budget_range** (string): "under_500, 500_1000, 1000_2000, over_2000, not_specified"
5. **riding_experience** (string): "beginner, intermediate, advanced, returning_rider, unsure"
6. **customer_triggers** (string): "hours, directions, prices, appointment, test_ride, complaint, general_help"
7. **follow_up_needed** (string): "send hours, send directions, send price list, confirm appointment, send thank you, none"

### Step 11: Widget Settings (Optional)

If you want to embed the agent on your website:

**Appearance:**
```
Variant: Full
Placement: Bottom-right
Background: #F8F9FA (light gray)
Text Color: #2C2C2C (dark gray)
Button Color: #2B5AA0 (Bici blue)
Button Text: #FFFFFF (white)
Border: #4A90A4 (teal)
```

**Features:**
- ✅ Text input enabled
- ✅ Transcript enabled
- ✅ Mic muting enabled
- ✅ Supports text-only mode

**Avatar:**
- Type: Orb
- Color 1: #2B5AA0
- Color 2: #4A90A4

### Step 12: Privacy Settings

**Recording:**
- ✅ Record voice conversations (for quality assurance)
- Retention: 30 days

---

## Part 3: Connect Phone Number

Once your Twilio number is ported to your account:

1. **In ElevenLabs Agent Settings:**
   - Click "Phone Numbers"
   - Click "Add Phone Number"
   - Select "Import from Twilio"

2. **Authenticate Twilio:**
   - Enter your Twilio Account SID
   - Enter your Twilio Auth Token

3. **Select Number:**
   - Choose `+1 (604) 670-0262`
   - Label: "Bici Ryder Vancouver"
   - Assign to: "Ryder - Bici AI Teammate"

4. **Configure:**
   - ✅ Inbound calls enabled
   - ✅ Outbound calls enabled (if needed)
   - Provider: Twilio

---

## Part 4: Testing Checklist

Before going live, test thoroughly:

### Voice Tests
- [ ] Call the number and verify greeting includes current date/time
- [ ] Ask "What are your store hours?" - should get accurate response
- [ ] Ask "Do you have Shimano shoes?" - should search and return results
- [ ] Ask "Can I speak to someone?" - should transfer to +17787193080
- [ ] Try after-hours - should offer voicemail transfer

### Inventory Search Tests
- [ ] "Do you have Cannondale bikes under $3000?" - should filter correctly
- [ ] "Show me road cycling shoes" - should return shoes without errors
- [ ] "What sizes do you have for [specific product]?" - should list variants

### Edge Cases
- [ ] Interrupt the agent mid-sentence - should handle gracefully
- [ ] Stay silent for 10 seconds - should prompt for input
- [ ] Ask in French/Spanish - should respond in same language
- [ ] Request directions - should NOT read URL out loud

---

## Part 5: Troubleshooting

### Agent Not Responding
- Check LLM model is set to Gemini 2.0 Flash
- Verify API credits are available in ElevenLabs account
- Check webhook URLs are accessible (200 OK response)

### Inventory Search Returns No Results
- Verify MCP server URL is correct
- Test MCP endpoint directly: `curl https://la-bicicletta-vancouver.myshopify.com/api/mcp`
- Check if you applied the Shimano shoes prompt fix

### Phone Calls Not Connecting
- Verify phone number is assigned to the agent
- Check Twilio account has credits
- Ensure webhooks in Twilio are configured to ElevenLabs

### Transfers Not Working
- Verify transfer number +17787193080 is correct
- Check transfer type is set to "SIP Refer"
- Test during business hours first

---

## Part 6: Going Live

Once testing is complete:

1. **Update Tags:** Change `environment:dev` to `environment:prod`
2. **Monitor First Calls:** Listen to first 5-10 calls for issues
3. **Review Analytics:** Check data collection is working
4. **Set Up Alerts:** Configure notifications for:
   - Failed calls
   - Webhook errors
   - High call volume
5. **Document Issues:** Keep track of any improvements needed

---

## Configuration Export

The complete agent configuration is saved in:
```
agent_configs/dev/ryder-bici-ai.json
```

This JSON file can be used as reference for all settings.

---

## Support

If you encounter issues during migration:
- ElevenLabs Support: support@elevenlabs.io
- Check conversation logs in ElevenLabs dashboard
- Review webhook error logs in your backend
- Test MCP server connectivity separately

---

**Next:** Proceed to `TWILIO_NUMBER_TRANSFER_GUIDE.md` to port the phone number to your account.
