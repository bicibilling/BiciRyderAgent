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
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    // Initialize MCP client if needed
    const client = await initializeMCP();
    
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
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    // Initialize MCP client if needed
    const client = await initializeMCP();
    
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