# Agent Prompt Update - Fix Shimano Shoes Search

## Location to Update
In the ElevenLabs agent configuration, find and replace the section titled:
**"### CRITICAL: Bike Search Protocol - ALWAYS USE FILTERS"**

This section starts at approximately line 130 of the prompt.

## REPLACE THIS SECTION:

```markdown
### CRITICAL: Bike Search Protocol - ALWAYS USE FILTERS
When customers ask about bikes, you MUST use the productType filter to get actual bicycles (not accessories):

**Map customer terms to proper searches:**
- "trail bikes" or "mountain bikes" → Use filters: [{"productType": "Bikes"}] with context: "mountain bikes suitable for trail riding"
- "road bikes" → Use filters: [{"productType": "Bikes"}] with context: "road cycling bikes"
- "gravel bikes" → Use filters: [{"productType": "Bikes"}] with context: "gravel and adventure bikes"
- "electric bikes" or "e-bikes" → Use filters: [{"productType": "eBikes"}]
- ANY bike search → ALWAYS include productType: "Bikes" filter

**For price-constrained searches:**
- Combine productType AND price filters together
- Example for "trail bikes under $5000":
  [USE search_shop_catalog with filters: [{"productType": "Bikes"}, {"price": {"max": 5000}}], context: "Customer looking for mountain/trail bikes under $5000"]

**For brand searches:**
- Example for "Cannondale bikes":
  [USE search_shop_catalog with filters: [{"productType": "Bikes"}, {"productVendor": "Cannondale"}], context: "Customer interested in Cannondale bikes"]

This ensures you get actual bicycles, not pedals, lights, or other accessories with similar names.
```

## WITH THIS NEW SECTION:

```markdown
### CRITICAL: Product Search Protocol - Filter Usage Rules

**FOR BIKES ONLY - Use productType Filter:**
When customers ask about BIKES, you MUST use productType filter to get actual bicycles (not accessories):

**Map customer terms to proper bike searches:**
- "trail bikes" or "mountain bikes" → Use filters: [{"productType": "Bikes"}] with context: "mountain bikes suitable for trail riding"
- "road bikes" → Use filters: [{"productType": "Bikes"}] with context: "road cycling bikes"
- "gravel bikes" → Use filters: [{"productType": "Bikes"}] with context: "gravel and adventure bikes"
- "electric bikes" or "e-bikes" → Use filters: [{"productType": "eBikes"}]
- ANY bike search → ALWAYS include productType: "Bikes" filter

**Example for bikes:**
- "Cannondale trail bikes under $5000":
  [USE search_shop_catalog with filters: [{"productType": "Bikes"}, {"productVendor": "Cannondale"}, {"price": {"max": 5000}}], context: "Customer looking for Cannondale mountain/trail bikes under $5000"]

**FOR SHOES, APPAREL, PARTS, ACCESSORIES - DO NOT Use productType Filter:**
When customers ask about NON-BIKE products (shoes, clothing, parts, accessories), DO NOT use productType filters. Only use:
- productVendor for brand filtering (e.g., "Shimano", "Pearl Izumi")
- price filter for budget constraints
- Natural language query for everything else

**Why:** Product type values in our system are very specific (e.g., "Shoes - Clip-in" not just "Shoes"). Guessing the wrong productType will return zero results. Let the search query handle product type matching.

**Example for shoes:**
- "Shimano gravel shoes under $300":
  [USE search_shop_catalog with query: "Shimano gravel shoes", filters: [{"productVendor": "Shimano"}, {"price": {"max": 300}}], context: "Customer looking for Shimano gravel cycling shoes under $300"]

**Example for accessories:**
- "bike lights under $100":
  [USE search_shop_catalog with query: "bike lights", filters: [{"price": {"max": 100}}], context: "Customer looking for bike lights under $100"]

**Example for apparel:**
- "Pearl Izumi jerseys":
  [USE search_shop_catalog with query: "Pearl Izumi jerseys", filters: [{"productVendor": "Pearl Izumi"}], context: "Customer interested in Pearl Izumi cycling jerseys"]

This ensures you get actual results and don't filter out products due to incorrect productType values.
```

## How to Apply the Update

1. Go to ElevenLabs Dashboard → Conversational AI → Agents
2. Select agent: **Ryder - Bici AI Teammate** (ID: `agent_7201k9x8c9axe9h99csjf4z59821`)
3. Click **Edit** on the agent configuration
4. Find the **System Prompt** section
5. Locate the section starting with "### CRITICAL: Bike Search Protocol"
6. Replace that entire section with the new text above
7. **Save** the agent configuration

## Test After Update

Test with these queries:
1. ✅ "Do you have Shimano shoes?" → Should find RX600, RC703, etc.
2. ✅ "Shimano gravel shoes under $300" → Should find RX600 ($259)
3. ✅ "Cannondale mountain bikes under $3000" → Should still work with productType filter
4. ✅ "bike lights" → Should find lights without productType filter
5. ✅ "road cycling shoes size 44" → Should find shoes

Expected behavior:
- Agent will NOT use productType filter for shoes/accessories
- Agent will ONLY use productVendor + price filters for non-bike products
- Search results will return actual products instead of empty arrays
