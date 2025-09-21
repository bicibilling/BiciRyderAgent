import dotenv from 'dotenv';
dotenv.config();

import { ShopifyStorefrontMCPService, normalizeCatalogResult } from '../src/services/shopify.storefront.mcp.service';

async function debugMCPResponse() {
  console.log('🔍 Debugging MCP Raw Responses');
  console.log('='.repeat(50));

  const svc = new ShopifyStorefrontMCPService();
  if (!svc.isEnabled()) {
    console.error('❌ Service not enabled');
    process.exit(1);
  }

  // Test 1: List tools with full response
  console.log('\n📋 Testing tools/list...');
  try {
    const toolsResponse = await svc.listTools();
    console.log('Raw tools response:', JSON.stringify(toolsResponse, null, 2));
  } catch (error) {
    console.error('Tools error:', error);
  }

  // Test 2: Search with different queries
  const queries = [
    'road bike',
    'trail bike',
    'mountain bike',
    'gravel bike',
    'cannondale',
    'trek',
    'bike',
    'bikes',
    'bicycle',
    'cycling'
  ];

  for (const query of queries) {
    console.log(`\n🔎 Testing query: "${query}"`);
    try {
      const rawResponse = await svc.callTool('search_shop_catalog', {
        query,
        context: 'inventory check',
        limit: 50
      });

      console.log('Raw response structure:', {
        hasContent: !!rawResponse?.content,
        contentLength: rawResponse?.content?.length || 0,
        contentTypes: rawResponse?.content?.map((c: any) => c.type) || []
      });

      // Parse the response
      const normalized = normalizeCatalogResult(rawResponse);
      console.log(`Products found: ${normalized.products.length}`);
      console.log(`Total reported: ${normalized.total}`);
      console.log(`More available: ${normalized.more_available}`);

      if (normalized.products.length > 0) {
        console.log('First 3 products:');
        normalized.products.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`  ${i + 1}. ${p.title} - $${p.price_min} - ID: ${p.product_id}`);
        });

        // Check if we have actual bikes vs accessories
        const actualBikes = normalized.products.filter((p: any) => {
          const title = (p.title || '').toLowerCase();
          return title.includes('bike') &&
                 !title.includes('helmet') &&
                 !title.includes('light') &&
                 !title.includes('lock') &&
                 !title.includes('bag') &&
                 !title.includes('bottle') &&
                 !title.includes('pump');
        });
        console.log(`Actual bikes (not accessories): ${actualBikes.length}`);

        if (actualBikes.length > 0) {
          console.log('Actual bikes found:');
          actualBikes.slice(0, 5).forEach((bike: any, i: number) => {
            console.log(`  🚲 ${bike.title} - $${bike.price_min}`);
          });
        }
      }

      // Show raw content for debugging
      if (rawResponse?.content?.[0]?.text) {
        try {
          const parsedContent = JSON.parse(rawResponse.content[0].text);
          console.log(`Raw product count before normalization: ${parsedContent.products?.length || 0}`);
        } catch (e) {
          console.log('Could not parse raw content');
        }
      }

    } catch (error) {
      console.error(`Query "${query}" failed:`, error);
    }
  }

  // Test 3: Check for specific products we expect based on website
  console.log('\n🎯 Testing for specific expected products...');
  const specificSearches = [
    'Trek Domane AL 5',
    'Cannondale Topstone',
    'mountain bike under 5000',
    'gravel bike under 4000'
  ];

  for (const search of specificSearches) {
    console.log(`\n🔍 Searching for: "${search}"`);
    try {
      const response = await svc.callTool('search_shop_catalog', {
        query: search,
        context: 'specific product search',
        limit: 100
      });

      const normalized = normalizeCatalogResult(response);
      console.log(`Found ${normalized.products.length} products`);

      // Look for exact matches or close matches
      const matches = normalized.products.filter((p: any) => {
        const title = (p.title || '').toLowerCase();
        const searchLower = search.toLowerCase();

        if (searchLower.includes('trek domane')) {
          return title.includes('trek') && title.includes('domane');
        }
        if (searchLower.includes('cannondale topstone')) {
          return title.includes('cannondale') && title.includes('topstone');
        }
        return title.includes(searchLower.split(' ')[0]);
      });

      console.log(`Relevant matches: ${matches.length}`);
      matches.forEach((match: any) => {
        console.log(`  ✅ ${match.title} - $${match.price_min}`);
      });

    } catch (error) {
      console.error(`Search "${search}" failed:`, error);
    }
  }
}

debugMCPResponse()
  .then(() => console.log('\n✅ Debug complete'))
  .catch(err => console.error('\n❌ Debug failed:', err));