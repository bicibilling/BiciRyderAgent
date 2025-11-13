# BICI Inventory Search - How It Works

## For Client: Inventory Search System Explanation

### Overview

Your AI voice agent (Ryder) can search your Shopify store's inventory in real-time using the **Shopify Public Products API**. This allows customers to ask about products during phone calls and get accurate, up-to-date information.

---

## How the Search Works

### Step 1: Data Source

**API Endpoint Used:**
```
https://la-bicicletta-vancouver.myshopify.com/products.json?limit=250
```

This is Shopify's **PUBLIC REST API** that returns:
- All published products (up to 250 items)
- Product titles, descriptions, prices
- Product types, vendors, tags
- Variants (sizes, colors, SKUs)
- Availability status

**Important:** No authentication required - this is publicly accessible product data.

---

### Step 2: Search Algorithm

When a customer asks "Do you have Trek mountain bikes?", here's what happens:

#### 2.1 Customer Query Processing
```javascript
Query: "trek mountain bikes"
Context: "Customer is beginner rider looking for entry-level options"
```

#### 2.2 Keyword Extraction
```javascript
Search terms: ["trek", "mountain", "bikes"]
Context terms: ["beginner", "rider", "entry-level"]
```

#### 2.3 Scoring System
Each product is scored based on keyword matches:

```javascript
For each product:
  searchText = title + product_type + vendor + tags

  Scoring:
  - Match in ANY field: +10 points
  - Match in TITLE: +20 points (extra important)
  - Match in CONTEXT: +5 bonus points
```

**Example:**
```
Product: "Trek Marlin 5 Mountain Bike"
- "trek" in title: +20
- "mountain" in title: +20
- "mountain" in product_type: +10
- "bikes" in title: +20
Total: 70 points

Product: "Cannondale Trail 8"
- "mountain" in product_type: +10
Total: 10 points
```

#### 2.4 Result Ranking
- Products sorted by score (highest first)
- Top 3 results returned (configurable via `limit` parameter)
- Zero-score products are filtered out

---

### Step 3: What Gets Returned

**For each matching product:**

```json
{
  "product_id": "gid://shopify/Product/1234567890",
  "product_handle": "trek-marlin-5",
  "title": "Trek Marlin 5 Mountain Bike",
  "description": "Perfect for beginner mountain bikers...",
  "price": {
    "amount": "899.99",
    "currencyCode": "CAD"
  },
  "available": true,
  "vendor": "Trek",
  "product_type": "Bikes",
  "tags": ["mountain", "hardtail", "beginner"],
  "url": "https://bici.cc/products/trek-marlin-5",
  "variants": [
    {
      "id": "gid://shopify/ProductVariant/9876543210",
      "title": "Small",
      "price": "899.99",
      "available": true
    },
    {
      "id": "gid://shopify/ProductVariant/9876543211",
      "title": "Medium",
      "price": "899.99",
      "available": true
    }
  ]
}
```

---

## What the AI Agent Can Do

### ✅ Capabilities

**1. Product Search**
- Natural language queries: "mountain bikes", "road bikes under $2000"
- Brand-specific: "Cannondale bikes", "Trek FX series"
- Category search: "bike helmets", "cycling shoes"
- Price-filtered: "bikes under $1000"

**2. Product Details**
- Full specifications
- All available sizes/variants
- Current prices
- Stock availability
- Product images and URLs

**3. Store Policies**
- Store hours and location
- Return and exchange policies
- Payment options and financing
- Shipping information
- Warranty details

### ❌ Limitations

**What the Agent CANNOT Do:**
- Add items to shopping cart (requires Shopify Storefront API authentication)
- Process payments
- Create real checkout sessions
- Track order status
- Access customer account information

**Why:** The system uses **public API access only** - no authentication tokens for cart/checkout operations.

---

## Search Quality Factors

### What Makes Search Work Well

✅ **Good Product Data in Shopify:**
- Descriptive product titles: "Trek FX 3 Disc Hybrid Bike" (not just "FX 3")
- Accurate product types: "Bikes", "Helmets", "Accessories"
- Comprehensive tags: "mountain", "beginner", "hardtail", "29er"
- Detailed vendor names: "Trek", "Cannondale", "Shimano"

✅ **Good Customer Queries:**
- Specific: "Cannondale mountain bikes under $1500"
- Natural language: "road bikes for beginners"
- With context: "I'm 5'10" looking for a hybrid bike for commuting"

❌ **What Reduces Search Quality:**
- Vague queries: "bikes" (returns too many results)
- Misspellings: "Cannondail" (won't match "Cannondale")
- Very specific model numbers not in title/tags
- Products with minimal metadata in Shopify

---

## Example Search Scenarios

### Scenario 1: General Category Search

**Customer says:** "Do you have mountain bikes?"

**Behind the scenes:**
```
1. search_shop_catalog(query: "mountain bikes", context: "")
2. Fetch all 250 products from Shopify
3. Score products with "mountain" or "bikes" in title/type/tags
4. Return top 3 matches
```

**Agent responds:**
"We have several great mountain bikes! The Trek Marlin 5 at $899 is perfect for beginners, the Cannondale Trail 8 at $1,299 offers excellent value, and the Trek X-Caliber 8 at $2,099 is great for more serious riders. Which experience level are you looking for?"

---

### Scenario 2: Brand + Price Filter

**Customer says:** "Show me Cannondale bikes under $1,500"

**Behind the scenes:**
```
1. search_shop_catalog(query: "cannondale bikes under 1500", context: "Budget $1,500")
2. Score products matching "cannondale"
3. Filter by price <= $1500 in scoring
4. Return top 3
```

**Agent responds:**
"For Cannondale bikes under $1,500, we have the Quick 4 hybrid at $1,050 and the Trail 5 mountain bike at $1,199. The Quick 4 is great for city riding, while the Trail 5 handles both trails and streets. What type of riding are you planning?"

---

### Scenario 3: Size Inquiry

**Customer says:** "What sizes does the Trek FX 3 come in?"

**Behind the scenes:**
```
1. search_shop_catalog(query: "trek fx 3")
2. Get product_id from results
3. get_product_details(product_id: "gid://shopify/Product/12345")
4. Return all variants with sizes
```

**Agent responds:**
"The Trek FX 3 is available in Small, Medium, Large, and X-Large, all at $1,299. What's your height? That helps me recommend the right frame size."

---

## Technical Implementation Details

### API Request Flow

```
Customer Phone Call
       ↓
ElevenLabs AI Agent (Ryder)
       ↓
Calls: search_shop_catalog tool
       ↓
Your MCP Server (https://YOUR_DOMAIN/api/mcp)
       ↓
Fetches: https://la-bicicletta-vancouver.myshopify.com/products.json
       ↓
Processes: Keyword matching & scoring
       ↓
Returns: Top 3 products with details
       ↓
ElevenLabs AI Agent
       ↓
Speaks to Customer (natural language)
```

### Performance Considerations

**Response Time:**
- Shopify API call: ~200-500ms
- Scoring algorithm: ~50-100ms
- Total: ~250-600ms per search

**Caching:**
- Currently: No caching (live data every request)
- Potential improvement: Cache products for 5-15 minutes to reduce API calls

**Limits:**
- Fetches up to 250 products per request
- Returns top 3 by default (configurable)
- If your catalog exceeds 250 products, pagination would be needed

---

## Shopify Product Configuration Best Practices

To optimize search results, ensure products in Shopify have:

### 1. Descriptive Titles
❌ Bad: "FX 3"
✅ Good: "Trek FX 3 Disc Hybrid Bike"

### 2. Accurate Product Types
❌ Bad: "Products" or blank
✅ Good: "Bikes", "Helmets", "Shoes - Road", "Accessories - Lights"

### 3. Comprehensive Tags
❌ Bad: "trek", "bike"
✅ Good: "trek", "hybrid", "disc-brake", "beginner-friendly", "commuter", "fitness"

### 4. Complete Variants
- Add all size options (S, M, L, XL)
- Include color variants if applicable
- Mark out-of-stock variants as unavailable
- Use consistent naming (not "Med" and "Medium" mixed)

### 5. Vendor Names
- Use brand names as vendors: "Trek", "Cannondale", "Shimano"
- Consistent capitalization

---

## Integration Details

### Tools Available to AI Agent

**Tool 1: search_shop_catalog**
```
Purpose: Search store inventory
Parameters:
  - query (required): Natural language search terms
  - context (required): Customer context (budget, experience, etc.)
  - limit (optional): Number of results (default: 3)

Returns:
  - List of matching products with prices, variants, URLs
  - Total count of matches
  - Store contact information
```

**Tool 2: get_product_details**
```
Purpose: Get full details for a specific product
Parameters:
  - product_id (required): From search results
  - options (optional): Variant selection like {"Size": "Medium"}

Returns:
  - Complete product information
  - All variants with availability
  - Price range
  - Full description and images
```

**Tool 3: search_shop_policies_and_faqs**
```
Purpose: Answer policy questions
Parameters:
  - query (required): Question about policies, hours, etc.
  - context (optional): Additional context

Returns:
  - Store hours, location, contact info
  - Policy information (returns, shipping, payments, warranty)
```

---

## What Happens During a Call

### Real Example: Customer Calling About Mountain Bikes

**1. Customer calls:** +1 (604) 670-0262

**2. AI Agent answers:** "Hi, you've reached Bici. It's Wednesday, October 16th, 2:30 PM. We're open until 6 PM today. I'm Ryder, your AI teammate. How can I help you?"

**3. Customer:** "I'm looking for a mountain bike"

**4. AI Agent thinks:**
- Need more context for better search
- Should ask about experience and budget

**5. AI Agent responds:** "Great! What's your experience level with mountain biking, and do you have a budget in mind?"

**6. Customer:** "I'm a beginner, looking to spend around $1,000"

**7. AI Agent executes tool:**
```javascript
search_shop_catalog(
  query: "mountain bikes beginner under 1000",
  context: "Beginner rider, $1,000 budget, looking for mountain bike"
)
```

**8. Tool returns:**
```json
{
  "products": [
    {
      "title": "Trek Marlin 5",
      "price": {"amount": "899.99"},
      "product_type": "Bikes",
      "available": true
    },
    {
      "title": "Trek Marlin 6",
      "price": {"amount": "1,099.99"},
      "product_type": "Bikes",
      "available": true
    }
  ]
}
```

**9. AI Agent responds:** "Perfect! For beginner mountain biking at that budget, I'd recommend the Trek Marlin 5 at $899. It's got great components for learning trails, and we have it in stock. Would you like to know what sizes we have available?"

**10. Customer:** "Yes, what sizes do you have?"

**11. AI Agent executes:**
```javascript
get_product_details(
  product_id: "gid://shopify/Product/1234567890"
)
```

**12. Tool returns all variants:**
```json
{
  "available_sizes": ["Small", "Medium", "Large", "X-Large"]
}
```

**13. AI Agent responds:** "The Trek Marlin 5 is available in Small, Medium, Large, and X-Large. What's your height? That helps me recommend the right frame size."

---

## Cart & Checkout Limitation

**Current Status:** The MCP server has `get_cart` and `update_cart` tools, BUT they use **in-memory storage only**.

**What this means:**
- Cart is NOT connected to real Shopify cart system
- Checkout URLs generated won't work: `https://bici.cc/cart/cart_abc123`
- Data is lost when server restarts

**Recommendation for Client:**
When customers want to purchase, the AI agent should:
1. ✅ Provide the direct product URL: `https://bici.cc/products/trek-marlin-5`
2. ✅ Offer to transfer to human agent for purchase assistance
3. ✅ Or say: "You can add this to your cart on our website at bici.cc"

**NOT:** Try to add items to a non-functional cart

---

## Summary for Client

### What Works ✅
- **Real-time inventory search** from your Shopify store
- **Product details** with sizes, prices, availability
- **Natural language queries** from customers
- **Store policy information**
- **Smart keyword matching** for relevant results

### What Doesn't Work ❌
- Adding items to real Shopify cart
- Creating working checkout sessions
- Processing payments
- Order tracking

### Recommended Customer Journey
1. Customer calls and asks about products
2. AI searches and presents options
3. AI provides product details and answers questions
4. AI gives product URL or transfers to human for purchase

This provides excellent **pre-sale support** while keeping actual transactions on your website or with human staff.

---

## Questions?

**For technical implementation details:** Check `server/src/routes/mcp.js` in your codebase
**For AI agent configuration:** See your ElevenLabs agent prompt settings
**For Shopify product optimization:** Review your product titles, types, tags, and vendors in Shopify admin
