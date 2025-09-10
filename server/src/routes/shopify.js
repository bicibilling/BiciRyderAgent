const express = require('express');
const router = express.Router();

// Import the MCP client
const { setupShopifyMCP } = require('../services/shopifyMCP');

let mcpClient = null;

// Initialize MCP client
async function initializeMCP() {
  try {
    if (!mcpClient) {
      console.log('🔧 Initializing Shopify MCP client...');
      mcpClient = await setupShopifyMCP();
      console.log('✅ Shopify MCP client initialized successfully');
    }
    return mcpClient;
  } catch (error) {
    console.error('❌ Failed to initialize Shopify MCP client:', error);
    throw error;
  }
}

// Search shop catalog endpoint
router.post('/search', async (req, res) => {
  try {
    const { query, context, limit = 3 } = req.body;
    
    console.log('🔍 Shopify search request:', { query, context, limit });
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    // Check if we have Shopify credentials
    if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_ACCESS_TOKEN) {
      console.log('❌ Missing Shopify credentials, returning fallback response');
      return res.json({
        success: true,
        data: {
          query,
          results: [{
            title: 'Shopify Integration Not Configured',
            description: `For product information about "${query}", please call us at 778-719-3080 or visit our store at 1497 Adanac Street, Vancouver.`,
            price: { min: 'N/A', max: 'N/A', currency: 'CAD' },
            url: 'https://bici.cc',
            available: true
          }],
          context: context || '',
          total: 1
        }
      });
    }

    // Initialize MCP client if needed
    let client;
    try {
      client = await initializeMCP();
    } catch (mcpError) {
      console.error('❌ MCP initialization failed, returning fallback:', mcpError.message);
      return res.json({
        success: true,
        data: {
          query,
          results: [{
            title: 'Product Search Available',
            description: `For information about "${query}", please call us at 778-719-3080. We have a full range of bikes and accessories in stock.`,
            price: { min: 'Call for pricing', max: 'Call for pricing', currency: 'CAD' },
            url: 'https://bici.cc',
            available: true
          }],
          context: context || '',
          total: 1
        }
      });
    }
    
    console.log(`🔍 Shopify catalog search: "${query}" (limit: ${limit})`);
    
    // Call the MCP search tool
    const result = await client.callTool('search_products', {
      query: query,
      limit: limit
    });

    if (result.isError) {
      console.error('MCP search error:', result.content);
      return res.status(500).json({
        success: false,
        error: 'Search failed',
        message: result.content?.[0]?.text || 'Unknown error'
      });
    }

    // Parse the result
    let searchResults = [];
    try {
      if (result.content && result.content[0] && result.content[0].text) {
        const resultText = result.content[0].text;
        
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(resultText);
          searchResults = parsed.products || parsed.results || [];
        } catch (parseError) {
          // If not JSON, treat as formatted text
          searchResults = [{
            title: 'Search Results',
            description: resultText,
            handle: 'search-results'
          }];
        }
      }
    } catch (parseError) {
      console.error('Error parsing search results:', parseError);
      searchResults = [];
    }

    console.log(`✅ Found ${searchResults.length} products for query: "${query}"`);

    res.json({
      success: true,
      data: {
        query,
        results: searchResults.slice(0, limit),
        context: context || '',
        total: searchResults.length
      }
    });

  } catch (error) {
    console.error('Shopify search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

// Search shop policies endpoint
router.post('/policies', async (req, res) => {
  try {
    const { query } = req.body;
    
    console.log('📋 Shopify policies request:', { query });
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    // Provide fallback policy information
    let policyResponse = '';
    const queryLower = query.toLowerCase();

    if (queryLower.includes('return') || queryLower.includes('refund')) {
      policyResponse = 'For returns and refunds, please contact our store directly at 778-719-3080 or visit us at 1497 Adanac Street, Vancouver. We work with you to ensure satisfaction with your bike purchase.';
    } else if (queryLower.includes('shipping') || queryLower.includes('delivery')) {
      policyResponse = 'For shipping information, please contact our store at 778-719-3080. We offer local delivery in Vancouver and can arrange shipping for bikes and accessories.';
    } else if (queryLower.includes('payment') || queryLower.includes('pay')) {
      policyResponse = 'We accept major credit cards, Affirm financing, Shop Pay, and RBC PayPlan for bike purchases. Contact us at 778-719-3080 for payment options.';
    } else if (queryLower.includes('warranty')) {
      policyResponse = 'Bike warranties vary by manufacturer. We provide full warranty support for all bikes we sell. Contact us at 778-719-3080 for specific warranty information.';
    } else {
      policyResponse = `**Store Information:**
- **Location:** 1497 Adanac Street, Vancouver, BC
- **Phone:** 778-719-3080
- **Hours:** 8am-6pm Mon-Fri, 9am-4:30pm Sat-Sun
- **Website:** bici.cc

**Payment:** We accept credit cards, Affirm, Shop Pay, and RBC PayPlan
**Returns:** Contact us for return policy details
**Shipping:** Local delivery available, shipping arrangements for bikes
**Warranty:** Full manufacturer warranty support`;
    }

    console.log(`✅ Providing policy information for: "${query}"`);

    return res.json({
      success: true,
      data: {
        query,
        policy_info: policyResponse,
        formatted_response: policyResponse
      }
    });

    // The MCP integration can be added later when Shopify credentials are configured
    // Initialize MCP client if needed
    // const client = await initializeMCP();
    
    console.log(`📋 Shopify policies search: "${query}"`);
    
    // Call the MCP policies tool
    const result = await client.callTool('get_shop_policies', {
      query: query
    });

    if (result.isError) {
      console.error('MCP policies error:', result.content);
      return res.status(500).json({
        success: false,
        error: 'Policies search failed',
        message: result.content?.[0]?.text || 'Unknown error'
      });
    }

    // Parse the result
    let policyInfo = '';
    try {
      if (result.content && result.content[0] && result.content[0].text) {
        policyInfo = result.content[0].text;
      }
    } catch (parseError) {
      console.error('Error parsing policy results:', parseError);
      policyInfo = 'Unable to retrieve policy information.';
    }

    console.log(`✅ Retrieved policy information for: "${query}"`);

    res.json({
      success: true,
      data: {
        query,
        policy_info: policyInfo,
        formatted_response: policyInfo
      }
    });

  } catch (error) {
    console.error('Shopify policies error:', error);
    res.status(500).json({
      success: false,
      error: 'Policies search failed',
      message: error.message
    });
  }
});

module.exports = router;