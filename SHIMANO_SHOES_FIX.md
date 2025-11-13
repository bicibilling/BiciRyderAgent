# Shimano Shoes Search Issue - Root Cause & Solution

## Problem
Agent cannot find Shimano shoes even though they exist in inventory and the MCP server works correctly.

## Root Cause Analysis

### What We Discovered:
1. **MCP Server Works** ✅ - Direct API calls to `https://la-bicicletta-vancouver.myshopify.com/api/mcp` successfully return Shimano shoes
2. **Agent Has MCP Server Connected** ✅ - Agent ID `agent_7201k9x8c9axe9h99csjf4z59821` has `mcp_server_ids: ["Llu7Amc0cv41fW5xa7Ag"]`
3. **Agent Makes Tool Calls** ✅ - Transcript shows `Tool succeeded: BICIShopifyStorefront_search_shop_catalog`
4. **BUT Returns Empty Results** ❌ - MCP returns `"products": []` to the agent

### The Real Problem:
**The agent is applying INCORRECT or OVERLY RESTRICTIVE filters** that eliminate all shoes from results.

### Evidence:
```bash
# This works (returns 3 Shimano shoes under $300):
filters: [{"productVendor":"Shimano"}, {"price":{"max":300}}]

# This returns ZERO products:
filters: [{"productVendor":"Shimano"}, {"price":{"max":300}}, {"productType":"Shoes - Gravel"}]
```

**The productType filter "Shoes - Gravel" doesn't exist** in Shopify. Actual shoe product types are:
- `"Apparel - Apparel Accessories - Shoes - Road"`
- `"Apparel - Apparel Accessories - Shoes - Mountain - Clip-in"`

## Solution

### Prompt Fix Required:
The agent prompt currently says:

```
### CRITICAL: Bike Search Protocol - ALWAYS USE FILTERS
When customers ask about bikes, you MUST use the productType filter...
```

**This guidance causes the agent to ALSO apply productType filters to NON-bike searches** (shoes, accessories, etc.), which breaks the search.

### Updated Prompt Section:

```markdown
### CRITICAL: Product Search Protocol

**For BIKES ONLY - Use productType filters:**
- "trail bikes" or "mountain bikes" → filters: [{"productType": "Bikes"}]
- "road bikes" → filters: [{"productType": "Bikes"}]
- "e-bikes" → filters: [{"productType": "eBikes"}]

**For SHOES, APPAREL, ACCESSORIES - DO NOT use productType filters:**
- Use productVendor for brand (e.g., [{"productVendor": "Shimano"}])
- Use price filter for budget (e.g., [{"price": {"max": 300}}])
- Let the natural query handle the rest (e.g., query: "shimano gravel shoes")

**Examples:**
- "Shimano shoes under $300" →
  query: "shimano shoes"
  filters: [{"productVendor": "Shimano"}, {"price": {"max": 300}}]
  context: "Customer looking for Shimano cycling shoes under $300"

- "Cannondale trail bike under $5000" →
  query: "cannondale mountain bike"
  filters: [{"productType": "Bikes"}, {"productVendor": "Cannondale"}, {"price": {"max": 5000}}]
  context: "Customer looking for trail/mountain bike"
```

## Testing Results

### Before Fix:
```
Query: "Shimano gravel shoes under $300"
Result: [] (0 products)
Agent Response: "I'm sorry, we don't have any Shimano gravel shoes in stock"
```

### After Fix (Expected):
```
Query: "shimano shoes"
Filters: [{"productVendor":"Shimano"}, {"price":{"max":300}}]
Result: 3 products (RX600, RX600W, RX600E)
Agent Response: "We have several Shimano gravel options under $300, including the RX600 at $259..."
```

## Implementation Steps

1. **Update agent prompt** in ElevenLabs dashboard
2. **Test with various shoe queries:**
   - "Shimano shoes"
   - "Shimano gravel shoes under $300"
   - "road cycling shoes"
   - "mountain bike shoes size 48"

3. **Verify agent behavior:**
   - Agent should NOT apply productType filters for shoes
   - Agent should use productVendor + price filters only
   - Agent should present results conversationally

## Key Takeaway

**The MCP server and inventory are working perfectly.** The issue is purely in the prompt logic that tells the agent HOW to construct filters for different product categories.

Bikes need specific productType filters. Everything else (shoes, accessories, parts) should use simple vendor/price filters and rely on natural language query matching.
