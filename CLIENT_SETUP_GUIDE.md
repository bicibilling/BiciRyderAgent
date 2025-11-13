# Setup Guide: Create ElevenLabs & Twilio Accounts

## Overview
This guide will help you set up your own ElevenLabs and Twilio accounts to take full admin control of the Bici AI voice agent and phone number.

---

## Part 1: ElevenLabs Account Setup

### What is ElevenLabs?
ElevenLabs provides the AI conversational agent platform that powers Ryder's voice interactions, natural language understanding, and phone system integration.

### Step 1: Create ElevenLabs Account

1. **Go to:** https://elevenlabs.io
2. **Click:** "Sign Up" (top right)
3. **Choose Sign-up Method:**
   - Email + Password
   - OR Google Account
   - OR GitHub Account

4. **Verify your email** (check spam folder if needed)

### Step 2: Choose the Right Plan

**For Phone Agent Features, you need the Creator Plan or higher:**

| Plan | Price | What You Get |
|------|-------|--------------|
| **Creator** | **$99/mo** | ✅ Conversational AI agents<br>✅ Phone number provisioning<br>✅ 1M characters/mo<br>✅ Custom voices<br>✅ API access |
| Pro | $330/mo | Everything in Creator + more characters |
| Scale | Custom | Enterprise features |

**Recommended:** Start with **Creator ($99/mo)** - includes everything you need for Ryder.

**To Upgrade:**
1. Go to: https://elevenlabs.io/app/settings/billing
2. Click **"Upgrade Plan"**
3. Select **"Creator"**
4. Enter payment details (credit card required)

### Step 3: Get Your API Key

You'll need this for connecting your backend server:

1. Go to: https://elevenlabs.io/app/settings/api-keys
2. Click **"Create New Key"**
3. Give it a name: `"Ryder Agent API Key"`
4. **Copy the key** (starts with `sk_...`)
5. **Save it somewhere safe** - you'll only see it once!

### Step 4: Verify Your Account

For phone agent features, ElevenLabs may require:
- Business email verification
- Phone number verification
- Payment method on file

Check: https://elevenlabs.io/app/settings/account

---

## Part 2: Twilio Account Setup

### What is Twilio?
Twilio provides the phone number infrastructure. The number `+1 (604) 670-0262` is currently provisioned through Twilio and will be transferred to your account.

### Step 1: Create Twilio Account

1. **Go to:** https://www.twilio.com/try-twilio
2. **Click:** "Sign up and start building"
3. **Fill out the form:**
   - Email address
   - Password
   - Company information

4. **Verify your email**
5. **Verify your phone number** (Twilio will send verification code)

You can buy a new number or we can port the existing ones for dev and prod. For porting, see Step 2, else Step 3.

### Step 2: Verify Your Identity

**Important:** For porting existing phone numbers, Twilio requires identity verification:

1. **Go to:** https://console.twilio.com/us1/account/compliance
2. **Complete Business Profile:**
   - Legal business name: **"La Bicicletta Vancouver"** (or your legal entity)
   - Business address: **1497 Adanac Street, Vancouver, BC V5L 2B6**
   - Business type: Retail
   - Tax ID (if applicable)

3. **Upload Required Documents:**
   - Business license OR
   - Articles of incorporation OR
   - Tax registration documents

**Note:** This verification can take 1-3 business days

### Step 3: Add Payment Method

1. **Go to:** https://console.twilio.com/us1/billing
2. **Click:** "Add Payment Method"
3. **Enter credit card details**
4. **Set up auto-recharge:** Recommended $50 threshold, $100 recharge

### Step 4: Get Your Twilio Credentials

You'll need these for the backend integration:

1. **Go to:** https://console.twilio.com
2. **Find on the dashboard:**
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click "View" to reveal)
3. **Copy both** - save them securely

---

## Security Best Practices

1. **Enable 2FA** on both ElevenLabs and Twilio accounts
2. **Never share your API keys** publicly or in code repositories
3. **Use environment variables** for all API credentials
4. **Rotate API keys** every 90 days
5. **Monitor billing** - set up alerts for unusual usage
6. **Restrict API key permissions** where possible

---

