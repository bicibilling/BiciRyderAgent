# How Product Search Works in Your AI Voice Agent

## Overview

Your AI voice agent (Ryder) uses the **Shopify Storefront MCP (Model Context Protocol) Server** to search your live Shopify store inventory in real-time during customer conversations.

---

## What is the Shopify Storefront MCP Server?

The Shopify Storefront MCP Server is an official tool from Shopify that connects AI agents directly to your Shopify store's public catalog. It provides:

✅ **Real-time product search**
✅ **Product details and specifications**
✅ **Store policy information**
✅ **Natural language queries**

❌ **Not included:** Cart operations (requires authentication)

---

## Available Tools

### 1. search_shop_catalog

**Purpose:** Search your store's product catalog

**What it does:**
- Searches all published products in your Shopify store
- Uses natural language queries (just like a customer would ask)
- Returns relevant products with prices, descriptions, and variants
- Can filter and refine results based on customer needs

**Example queries:**
- "mountain bikes"
- "Trek bikes under $2000"
- "road bikes for beginners"
- "Shimano cycling shoes"

**What it returns:**
- Product name and description
- Price and currency
- Product variants (sizes, colors)
- Product URL (direct link to your website)
- Product images
- Availability status

---

### 2. get_product_details

**Purpose:** Get detailed information about a specific product

**What it does:**
- Looks up a product by its ID (from search results)
- Returns complete specifications
- Shows all available variants (sizes, colors, etc.)
- Provides pricing for each variant

**When it's used:**
- Customer asks "What sizes does this come in?"
- Customer wants full specifications
- Customer asks about color options
- Agent needs detailed information to help customer decide

**What it returns:**
- Full product description
- All variants with individual prices
- Size/color availability
- SKU information
- Product images
- Direct product page URL

---

### 3. search_shop_policies_and_faqs

**Purpose:** Answer questions about your store

**What it does:**
- Provides store information
- Returns store hours and location
- Explains return policies
- Details shipping and payment options
- Shares warranty information

**When it's used:**
- "What are your store hours?"
- "What's your return policy?"
- "Do you offer financing?"
- "Where are you located?"

---

## How Product Search Works

### Step 1: Customer Asks a Question

**Example conversation:**

```
Customer: "Do you have mountain bikes?"
```

### Step 2: AI Agent Uses search_shop_catalog

**Behind the scenes:**
```
Tool: search_shop_catalog
Query: "mountain bikes"
Context: "Customer interested in mountain biking"
```

The MCP server searches your Shopify store catalog using:
- Product titles
- Product descriptions
- Product types
- Vendor names
- Product tags
- Metadata

### Step 3: Search Returns Results

**Example results:**
```json
[
  {
    "title": "Trek Marlin 5 Mountain Bike",
    "price": {
      "amount": "899.99",
      "currencyCode": "CAD"
    },
    "description": "Perfect for beginner mountain bikers...",
    "url": "https://bici.cc/products/trek-marlin-5",
    "variants": [
      {"title": "Small", "available": true},
      {"title": "Medium", "available": true},
      {"title": "Large", "available": true}
    ],
    "available": true
  },
  {
    "title": "Cannondale Trail 8",
    "price": {
      "amount": "1299.99",
      "currencyCode": "CAD"
    },
    "url": "https://bici.cc/products/cannondale-trail-8",
    "available": true
  }
]
```

### Step 4: AI Agent Presents Results Naturally

**What the customer hears:**

```
Agent: "We have some excellent mountain bikes! The Trek Marlin 5 at $899
is perfect for beginners with great components and reliable performance.
If you want something more advanced, the Cannondale Trail 8 at $1,299
offers better suspension and lighter weight. What's your experience level
with mountain biking?"
```

---

## Complete Search Example

### Scenario: Customer Looking for a Specific Product

**Customer:** "Do you have the Trek FX 3?"

**Agent uses:** `search_shop_catalog(query: "Trek FX 3")`

**Results returned:**
- Trek FX 3 Disc found
- Price: $1,299.99
- Available in multiple sizes
- Product URL provided

**Agent responds:** "Yes! We have the Trek FX 3 Disc at $1,299. It's a great hybrid bike for fitness and commuting."

**Customer:** "What sizes do you have?"

**Agent uses:** `get_product_details(product_id: "gid://shopify/Product/12345")`

**Results returned:**
- Small: Available
- Medium: Available
- Large: Available
- X-Large: Available

**Agent responds:** "The Trek FX 3 is available in Small, Medium, Large, and X-Large. What's your height? That helps me recommend the right frame size."

---

## Search Features

### Natural Language Queries

The MCP server understands conversational queries:

✅ **Works great:**
- "mountain bikes under $1500"
- "Cannondale road bikes"
- "beginner hybrid bikes"
- "Trek bikes for commuting"

✅ **Also works:**
- Brand names: "Shimano", "Trek", "Cannondale"
- Product types: "helmets", "shoes", "accessories"
- Price ranges: "under $1000", "between $500 and $1500"
- Use cases: "commuting", "trail riding", "racing"

### Context-Aware Search

The agent includes customer context in searches:

**Example:**
```
Query: "road bikes"
Context: "Beginner rider, $1,500 budget, fitness riding"
```

This helps the MCP server return more relevant results based on:
- Experience level
- Budget constraints
- Intended use
- Customer preferences

---

## What Data Sources Are Used?

### Shopify Store Catalog

The MCP server accesses your **published products** from Shopify:

**Includes:**
- Product titles and descriptions
- Prices and currency
- Product types and categories
- Vendor/brand names
- Product tags
- Variant options (sizes, colors, etc.)
- Availability status
- Product images
- Product URLs

**Does NOT include:**
- Draft/unpublished products
- Customer account information
- Order history
- Cart data (not available via public API)

---

## Search Quality Factors

### What Makes Search Work Well

✅ **Good product data in Shopify:**

**Product Titles:**
- ✅ Good: "Trek FX 3 Disc Hybrid Bike"
- ❌ Bad: "FX 3"

**Product Types:**
- ✅ Good: "Bikes - Mountain", "Helmets", "Shoes - Road"
- ❌ Bad: "Products" or blank

**Product Tags:**
- ✅ Good: ["mountain", "beginner", "hardtail", "29er", "trail"]
- ❌ Bad: ["bike"] or minimal tags

**Vendor Names:**
- ✅ Good: "Trek", "Cannondale", "Shimano"
- ❌ Bad: "Supplier A" or blank

**Descriptions:**
- ✅ Good: Detailed features, specifications, ideal use cases
- ❌ Bad: Empty or very brief

### What Reduces Search Quality

❌ **Poor product data:**
- Vague titles: "Bike Model 3"
- Missing product types
- No tags or minimal tags
- Empty descriptions

❌ **Customer query issues:**
- Too vague: "bikes" (returns too many results)
- Misspellings: "Cannondail" (won't match "Cannondale")
- Very specific model numbers not in product data

---

## Performance

### Response Time

**Typical search performance:**
- Simple query: ~300-800ms
- Complex query with filtering: ~500-1200ms
- Product details lookup: ~200-500ms

**Factors affecting speed:**
- Store catalog size
- Network latency
- Query complexity
- Number of variants per product

### Scalability

The MCP server handles:
- Small catalogs (10-100 products): Excellent
- Medium catalogs (100-1000 products): Very good
- Large catalogs (1000+ products): Good (with pagination)

---

## Customer Purchase Flow

### What the Agent Can Do

1. **Search and discover** products
2. **Provide details** about specific products
3. **Answer questions** about features and specifications
4. **Share product URLs** for online purchase
5. **Transfer to human** for purchase assistance

### What the Agent Cannot Do

❌ **Add items to cart** - Requires authentication not available via public API
❌ **Process payments** - Must be done on website or with human staff
❌ **Track orders** - Requires customer account access
❌ **Apply discount codes** - Not available through MCP server

### Recommended Purchase Process

**When customer is ready to buy:**

**Option 1: Website**
```
Agent: "Great choice! You can add the Trek FX 3 to your cart at
bici.cc/products/trek-fx-3-disc. Would you like me to send you
that link?"
```

**Option 2: Human Transfer**
```
Agent: "I can connect you with our team right now to complete
your order. They can also help with financing options and
answer any other questions. Would you like me to transfer you?"
```

**Option 3: Phone Order**
```
Agent: "You can call us at 778-719-3080 and our team will be
happy to help you complete your order."
```

---

## Technical Architecture

### How It Works

```
Customer Phone Call
       ↓
ElevenLabs AI Agent (Ryder)
       ↓
Calls: search_shop_catalog
       ↓
Shopify Storefront MCP Server
       ↓
Connects to: Your Shopify Store (bici.cc)
       ↓
Returns: Product data
       ↓
AI Agent processes and speaks naturally
       ↓
Customer hears conversational response
```

### MCP Server Endpoint

The MCP server connects to your Shopify store at:
```
https://bici.cc/api/mcp
```

This is your store's MCP endpoint that provides:
- Product catalog access
- Search functionality
- Product detail lookups
- Store policy information

### Data Format

The MCP server uses **JSON-RPC 2.0** format for communication:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": "request_123",
  "params": {
    "name": "search_shop_catalog",
    "arguments": {
      "query": "mountain bikes",
      "context": "Beginner rider, $1000 budget"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "request_123",
  "result": {
    "products": [...]
  }
}
```

---

## Optimizing Search Results

### Shopify Product Configuration

To get the best search results, ensure your Shopify products have:

**1. Descriptive Titles**
```
✅ "Trek Marlin 5 Mountain Bike - Small"
❌ "Marlin"
```

**2. Accurate Product Types**
```
✅ "Bikes - Mountain"
❌ "Products"
```

**3. Comprehensive Tags**
```
✅ ["mountain", "hardtail", "beginner", "29er", "trail", "trek"]
❌ ["bike"]
```

**4. Detailed Descriptions**
Include:
- Key features
- Ideal use cases
- Experience level recommendations
- Size information
- Material specifications

**5. Complete Variants**
- All size options listed
- Color variants included
- Accurate availability status
- Consistent naming (not "Med" and "Medium" mixed)

**6. Proper Vendor Names**
```
✅ "Trek", "Cannondale", "Shimano"
❌ "Vendor 123"
```

---

## Benefits of MCP Search

### For Customers

✅ **Natural conversation** - Ask questions naturally, no need for exact keywords
✅ **Real-time information** - Always current inventory and pricing
✅ **Instant answers** - No waiting, no browsing required
✅ **Personalized recommendations** - Based on experience level, budget, use case
✅ **24/7 availability** - Product information anytime

### For Your Business

✅ **Increased engagement** - Customers get immediate product information
✅ **Better qualification** - AI gathers customer needs before purchase
✅ **Reduced support load** - AI handles basic product questions
✅ **Improved conversion** - Relevant recommendations lead to purchases
✅ **Consistent information** - Always accurate pricing and availability

---

## Limitations & Considerations

### What's Not Included

❌ **Cart operations** - Cannot add items to cart or create checkouts
❌ **Customer accounts** - No access to customer login or order history
❌ **Inventory management** - Cannot modify stock levels or product data
❌ **Pricing changes** - Cannot apply discounts or adjust prices
❌ **Order tracking** - Cannot look up existing orders

### Privacy & Security

✅ **Public data only** - Only accesses published product information
✅ **No authentication required** - Uses public Shopify API endpoints
✅ **No customer data** - Cannot access account information
✅ **Read-only access** - Cannot modify your Shopify store

---

## Summary

### What the MCP Server Provides

**Core Functions:**
1. Real-time product catalog search
2. Detailed product information
3. Store policy and information queries
4. Natural language understanding
5. Context-aware recommendations

**Customer Experience:**
- Conversational product discovery
- Instant answers to product questions
- Personalized recommendations
- Seamless handoff to purchase (website or human staff)

**Business Value:**
- Excellent pre-sale support
- Reduced support burden for basic questions
- Better customer qualification
- Increased engagement and conversion opportunities

### Integration Points

**Works seamlessly with:**
- ElevenLabs AI voice agent
- Your Shopify store catalog
- Twilio phone system
- Human agent transfer system

**Hands off to:**
- Your website for online checkout
- Human staff for purchase assistance
- In-store visits for specialized needs

---

## Conclusion

The Shopify Storefront MCP Server enables your AI voice agent to provide excellent product discovery and recommendation services by searching your live Shopify inventory in real-time.

Customers get instant, accurate product information through natural conversation, then complete their purchases through your website or with your human staff.

This provides a seamless experience that combines AI efficiency with human expertise where it matters most.

---

## Questions?

For more information about:
- **MCP Server functionality:** See Shopify's official documentation
- **AI agent configuration:** Check your ElevenLabs dashboard settings
- **Shopify optimization:** Review your product data in Shopify Admin
- **Integration support:** Contact your development team
