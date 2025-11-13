# Shopify Storefront MCP - Summary

## What You Have

Your AI voice agent uses the **official Shopify Storefront MCP Server** to search your bici.cc store inventory in real-time.

---

## Files Created

### 1. **CLIENT_MCP_SEARCH_EXPLANATION.md** ⭐ SHARE WITH CLIENT
**Complete client-facing documentation:**
- How product search works
- What data sources are used
- Example search scenarios
- Performance metrics
- Optimization tips
- Benefits and limitations

**Purpose:** Share this with your client to explain how the search system works

---

### 2. **PROMPT_FIX_FOR_SHOPIFY_MCP.md** ⭐ FOR YOU TO IMPLEMENT
**Agent prompt corrections:**
- Remove incorrect JSON filter syntax
- Add natural language query examples
- Remove cart operation references
- Add proper purchase handoff instructions

**Purpose:** Use this to fix your ElevenLabs agent prompt

---

## What the MCP Server Does

### ✅ Available Tools

**1. search_shop_catalog**
- Searches your Shopify store inventory
- Uses natural language queries
- Returns: Products with prices, variants, URLs

**2. get_product_details**
- Gets detailed product information
- Shows all sizes/colors/variants
- Returns: Specs, availability, pricing

**3. search_shop_policies_and_faqs**
- Provides store information
- Returns: Hours, location, policies

### ❌ NOT Available

**Cart operations** are NOT available:
- Cannot add items to cart
- Cannot create checkouts
- Cannot process payments

**Why:** Public Shopify API doesn't support cart mutations without authentication

---

## How Search Works

### Simple Explanation

```
Customer: "Do you have Trek mountain bikes?"
    ↓
Agent: search_shop_catalog(query: "trek mountain bikes")
    ↓
Shopify MCP Server searches your store
    ↓
Returns: Top 3 relevant products
    ↓
Agent: "We have the Trek Marlin 5 at $899..."
```

### Search Uses Natural Language

✅ **Correct:**
- "mountain bikes"
- "trek bikes under 2000"
- "road bikes for beginners"

❌ **Wrong (what your prompt currently has):**
- `filters: [{"productType": "Bikes"}]`
- JSON filter syntax
- Complex structured queries

---

## What Your Prompt Needs to Fix

### Problem 1: JSON Filter Syntax
Your prompt teaches the agent to use:
```
filters: [{"productType": "Bikes"}, {"price": {"max": 5000}}]
```

But Shopify MCP expects:
```
query: "bikes under 5000"
```

### Problem 2: Cart Operations
Your prompt says:
```
"I can add items to cart"
"What I CANNOT do: Add items to cart"  ← Contradictory!
```

Should say:
```
"To purchase, visit bici.cc/products/... or I'll transfer you to our team"
```

---

## Customer Purchase Flow

### What Agent SHOULD Do

**When customer wants to buy:**
1. ✅ Provide product page URL: `bici.cc/products/trek-fx-3`
2. ✅ Offer to transfer to human staff
3. ✅ Mention phone number: 778-719-3080

**What Agent should NOT say:**
1. ❌ "I've added that to your cart"
2. ❌ "Here's your checkout link"
3. ❌ Any cart-related responses

---

## Next Steps

### 1. Share Client Documentation
Send **CLIENT_MCP_SEARCH_EXPLANATION.md** to your client

### 2. Fix Agent Prompt
Use **PROMPT_FIX_FOR_SHOPIFY_MCP.md** to update your ElevenLabs agent:
- Remove JSON filter examples (lines 130-166)
- Remove cart operation references (lines 35-60, 118-128)
- Add natural language query examples
- Add purchase handoff instructions

### 3. Test
After updating prompt:
- Test: "Do you have Trek bikes?" → Should search naturally
- Test: "I'll buy it" → Should provide URL or offer transfer
- Test: "What sizes?" → Should get details and list sizes

---

## Key Takeaway

**Your system works correctly** - you're using the official Shopify Storefront MCP server.

**Your prompt is wrong** - it teaches JSON filters and cart operations that don't exist.

**Fix:** Update prompt to use natural language queries and remove cart operations.

---

## Questions Answered

### "How does inventory search work?"
**Answer:** See CLIENT_MCP_SEARCH_EXPLANATION.md
- Uses Shopify MCP server
- Natural language queries
- Searches product titles, types, vendors, tags
- Returns top 3 relevant results

### "Why can't we do cart operations?"
**Answer:** Public Shopify API doesn't support cart mutations. The MCP server only provides read access to products. Cart operations require authentication that isn't available in the public storefront API.

### "What should we tell customers about purchasing?"
**Answer:** Direct them to:
1. Product page on website: bici.cc/products/...
2. Phone order: 778-719-3080
3. Transfer to human staff (during business hours)
