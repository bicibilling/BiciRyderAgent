# Twilio Phone Number Transfer Guide

## Overview
This guide explains how to transfer the phone number `+1 (604) 670-0262` from the current Twilio account to your newly created Twilio account.

**Important:** This is called "phone number porting" and typically takes 2-7 business days to complete.

---

## Understanding the Process

### What is Number Porting?
Porting transfers ownership of a phone number from one provider/account to another while keeping the same number active.

### Current Setup
- **Number:** +1 (604) 670-0262
- **Current Owner:** Developer's Twilio account
- **Current SID:** ACa474c6d23cca243aea12953c9dc0970c
- **Target Owner:** Your Twilio account (to be created)

### Timeline
- **Preparation:** 1-2 days (gather docs, verify identity)
- **Port Request:** Submitted to Twilio
- **Processing:** 2-5 business days
- **Activation:** Same day as approval
- **Total:** 3-7 business days typically

---

## Option 1: Internal Twilio Transfer (Recommended - Fastest)

If transferring between two Twilio accounts, this is the fastest method.

### Step 1: Verify Both Accounts

**Your Account (Recipient):**
1. Complete identity verification (Business Profile)
2. Have payment method on file
3. Ensure account in good standing

**Current Account (Donor):**
1. Will need to initiate the transfer
2. Must confirm ownership

### Step 2: Request Transfer

**You (Client) will need to:**

1. **Contact Twilio Support:**
   - Go to: https://console.twilio.com/support
   - Click "Create Support Ticket"
   - Select: "Phone Number Porting"

2. **Provide Information:**
   ```
   Subject: Internal Twilio Account Transfer Request

   I would like to transfer phone number +1 (604) 670-0262
   from account SID: ACa474c6d23cca243aea12953c9dc0970c
   to my account SID: [YOUR_ACCOUNT_SID]

   Current owner has authorized this transfer.

   My business information:
   Legal Name: [Your Business Name]
   Address: 1497 Adanac Street, Vancouver, BC V5L 2B6
   Contact: [Your Email]
   ```

3. **Current Owner Authorization:**
   The developer (current owner) will need to:
   - Confirm transfer via email from Twilio
   - Provide Letter of Authorization (LOA)
   - Release the number from their account

### Step 3: Process Timeline

| Day | Action | Who |
|-----|--------|-----|
| Day 1 | Client submits transfer request | You |
| Day 1-2 | Twilio reviews request | Twilio |
| Day 2 | Current owner confirms | Developer |
| Day 2-3 | Twilio processes transfer | Twilio |
| Day 3-4 | Number activated in your account | Automatic |

### Step 4: During Transfer

**What Happens:**
- Number remains ACTIVE during transfer
- Calls continue to work on current account
- Brief interruption (< 5 minutes) during final switch
- Once complete, number appears in your account

**What You Need to Do:**
- Monitor Twilio support ticket
- Respond to any verification requests promptly
- Update ElevenLabs integration once transfer completes

---

## Option 2: External Port (If Number Originally from Another Carrier)

If the number was originally from a carrier like Bell, Rogers, Telus, etc., you'll need to port it.

### Step 1: Gather Required Information

**You'll need from the current account:**
- [ ] Current phone number: +1 (604) 670-0262
- [ ] Account number with current provider
- [ ] PIN or password on account
- [ ] Billing name and address
- [ ] Service address (if different)
- [ ] Latest bill copy (optional but helpful)

### Step 2: Submit Port Request

1. **In Your Twilio Console:**
   - Go to: https://console.twilio.com/us1/develop/phone-numbers/port-requests
   - Click "New Port Request"

2. **Fill Out Port-In Form:**
   ```
   Port Type: Local Number
   Numbers to Port: +16046700262
   Carrier: [Current Carrier Name]
   Account Number: [From current provider]
   PIN/Password: [From current provider]

   Authorized Person:
   Name: [Your Name]
   Title: Owner / Manager
   Phone: [Your Phone]
   Email: [Your Email]

   Billing Address: [Must match current provider records]
   Service Address: 1497 Adanac Street, Vancouver, BC V5L 2B6
   ```

3. **Upload Letter of Authorization (LOA):**
   - Twilio will provide a template
   - Sign and upload
   - Must match name on current account

### Step 3: Port Processing Timeline

| Stage | Duration | Notes |
|-------|----------|-------|
| Submission Review | 1-2 days | Twilio checks completeness |
| FOC Date Set | Same day | Firm Order Commitment |
| Port Processing | 2-5 days | Carrier coordination |
| Port Completion | FOC date | Number activates |

**FOC Date:** This is the date your number will officially transfer. Cannot be changed without restarting process.

### Step 4: Port Completion

**On FOC Date:**
- Old service terminates at 11:59 PM
- New service activates at 12:00 AM
- Brief outage (typically < 30 minutes)
- Test immediately after activation

---

## Post-Transfer Setup

Once the number is in your Twilio account:

### Step 1: Configure Twilio Webhooks

1. **Go to:** https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. **Click:** +1 (604) 670-0262
3. **Configure Voice:**
   ```
   A Call Comes In: Webhook
   URL: [Your ElevenLabs webhook or use "Connect to ElevenLabs"]
   HTTP Method: POST
   ```

4. **Configure Messaging (if needed):**
   ```
   A Message Comes In: Webhook
   URL: https://bici-ryder-api.onrender.com/api/webhooks/twilio/sms
   HTTP Method: POST
   ```

### Step 2: Connect to ElevenLabs

**Option A: Direct ElevenLabs Integration**
1. In ElevenLabs agent settings
2. Go to Phone Numbers
3. Click "Import from Twilio"
4. Authenticate with your Twilio credentials
5. Select +1 (604) 670-0262
6. Assign to "Ryder - Bici AI Teammate"

**Option B: Custom Webhook**
1. Set Twilio webhook to your backend API
2. Backend forwards to ElevenLabs
3. Allows custom logic before/after calls

### Step 3: Test Thoroughly

**Test Scenarios:**
- [ ] Make inbound call - should reach Ryder agent
- [ ] Verify caller ID displays correctly
- [ ] Test transfer feature - should forward to store phone
- [ ] Try during and after hours
- [ ] Send test SMS (if using SMS features)
- [ ] Verify voicemail working (if configured)

### Step 4: Update All References

Update the phone number in:
- [ ] Google My Business listing
- [ ] Website contact page
- [ ] Social media profiles
- [ ] Email signatures
- [ ] Business cards (future printings)
- [ ] Local directory listings

---

## Costs

### Twilio Charges
- **Port-In Fee:** $0 (free)
- **Monthly Rental:** ~$1.15/month (Canadian local number)
- **Usage Charges:** Per minute/message as configured

### During Port
- Continue paying current provider until FOC date
- Twilio charges begin on FOC date
- No double-billing on the port date itself

---

## Common Issues & Solutions

### Port Rejection - "Information Mismatch"
**Cause:** Name, address, or account number doesn't match carrier records
**Solution:**
- Request exact billing details from current provider
- Ensure names match exactly (including middle initials, Inc., Ltd., etc.)
- Double-check account number format

### Port Rejection - "Number Not Portable"
**Cause:** Number may be toll-free, recently ported, or under contract
**Solution:**
- Verify number is a local number (not toll-free)
- Check if number was recently ported (< 30 days ago)
- Ensure no active contracts or payment holds

### Delay in Processing
**Cause:** Missing documentation, signature issues, or carrier backlog
**Solution:**
- Respond to Twilio requests immediately
- Keep support ticket open and check daily
- Call Twilio support for urgent updates

### Number Not Working After Port
**Cause:** Webhooks not configured, ElevenLabs not connected
**Solution:**
- Verify Twilio console shows "Active" status
- Check webhook configuration
- Test webhook URL responds with 200 OK
- Reconnect ElevenLabs integration if needed

---

## Emergency Rollback

If something goes wrong during port:

### Before FOC Date
- Contact Twilio support immediately
- Request port cancellation
- Number remains with current provider

### After FOC Date
- Cannot reverse port automatically
- Would need to port back (another 3-7 days)
- Test thoroughly BEFORE FOC date!

---

## Coordination with Developer

### What Developer Needs to Do:

1. **Authorize Transfer:**
   - Confirm transfer via Twilio email
   - Provide Letter of Authorization if needed
   - Release number from their account

2. **Provide Information:**
   - Current account details
   - Any authentication info needed
   - Confirm billing address on file

3. **During Transfer:**
   - Keep account active until transfer completes
   - Don't make any changes to number configuration
   - Be available for any verification calls from Twilio

### What You (Client) Need to Do:

1. **Submit Port Request:**
   - Fill out all forms accurately
   - Upload signed LOA
   - Provide business verification

2. **Respond Promptly:**
   - Check email daily for Twilio updates
   - Reply to verification requests within 24 hours
   - Monitor support ticket status

3. **Prepare for Activation:**
   - Have ElevenLabs agent ready
   - Backend webhooks configured
   - Testing plan prepared

---

## Support Resources

### Twilio Porting Support
- **Documentation:** https://www.twilio.com/docs/phone-numbers/porting
- **Support Console:** https://console.twilio.com/support
- **Phone:** 1-844-997-5769 (Twilio support)
- **Email:** help@twilio.com

### ElevenLabs Integration
- **Phone Setup Docs:** https://elevenlabs.io/docs/conversational-ai/phone-setup
- **Twilio Integration:** https://elevenlabs.io/docs/conversational-ai/twilio
- **Support:** support@elevenlabs.io

---

## Alternative: Keep Current Setup (Not Recommended)

If porting is too complex, you could:

**Option:** Keep number in developer's account, grant you access
- ❌ You won't have full admin control
- ❌ Dependent on developer's account
- ❌ Billing goes through developer
- ❌ Can't make configuration changes independently
- ✅ No port process needed
- ✅ Immediate access

**Better Long-term:** Complete the port for full independence and control.

---

## Checklist: Ready to Port?

- [ ] Your Twilio account created and verified
- [ ] Business profile completed in Twilio
- [ ] Identity documents uploaded
- [ ] Payment method added
- [ ] Developer has authorized transfer
- [ ] Current account information gathered
- [ ] Letter of Authorization prepared
- [ ] ElevenLabs agent configured and ready
- [ ] Backend webhooks prepared
- [ ] Testing plan documented

**Once all checked:** Submit the port request!

---

**Next:** After number is ported, see `HANDOVER_CHECKLIST.md` for final steps.
