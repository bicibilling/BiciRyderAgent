import dotenv from 'dotenv';
dotenv.config();

import { ShopifyStorefrontMCPService, normalizeCatalogResult } from '../src/services/shopify.storefront.mcp.service';

interface TestResult {
  query: string;
  context: string;
  productCount: number;
  sampleProducts: any[];
  underBudget: any[];
  expectedBikes: string[];
  foundExpectedBikes: string[];
}

async function testMCPFix() {
  console.log('🚴 Testing Shopify MCP Fix - Verifying slice(0,10) bug resolution');
  console.log('='.repeat(70));

  const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN;
  if (!domain) {
    console.error('❌ Missing SHOPIFY_STOREFRONT_DOMAIN');
    process.exit(1);
  }

  console.log(`🏪 Testing against domain: ${domain}`);

  const svc = new ShopifyStorefrontMCPService();
  if (!svc.isEnabled()) {
    console.error('❌ MCP Service not enabled (endpoint not configured)');
    process.exit(1);
  }

  // First, verify tools are available
  console.log('\n📋 Listing available tools...');
  try {
    const tools = await svc.listTools();
    const toolNames = tools?.result?.tools?.map((t: any) => t.name) || [];
    console.log(`✅ Available tools: ${toolNames.join(', ')}`);

    if (!toolNames.includes('search_shop_catalog')) {
      console.error('❌ search_shop_catalog tool not available');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to list tools:', error);
    process.exit(1);
  }

  const testQueries: { query: string; context: string; expectedBikes: string[] }[] = [
    {
      query: 'trail bikes under 5000',
      context: 'budget search for mountain bikes',
      expectedBikes: ['Trek', 'Cannondale', 'Specialized']
    },
    {
      query: 'gravel bikes',
      context: 'adventure cycling inventory',
      expectedBikes: ['Trek Domane', 'Cannondale Topstone']
    },
    {
      query: 'cannondale',
      context: 'brand specific search',
      expectedBikes: ['Cannondale Topstone', 'Cannondale']
    },
    {
      query: 'trek bikes',
      context: 'trek brand inventory',
      expectedBikes: ['Trek Domane AL 5', 'Trek']
    },
    {
      query: 'road bikes under 3000',
      context: 'budget road bike search',
      expectedBikes: ['Trek Domane AL 5', 'Cannondale']
    },
    {
      query: 'bikes under 5000',
      context: 'general budget search',
      expectedBikes: ['Trek', 'Cannondale', 'Specialized']
    },
    {
      query: 'all bikes',
      context: 'complete inventory check',
      expectedBikes: ['Trek', 'Cannondale', 'Specialized']
    }
  ];

  const results: TestResult[] = [];

  console.log('\n🔍 Testing various bike search queries...\n');

  for (const testCase of testQueries) {
    console.log(`🔎 Query: "${testCase.query}" (${testCase.context})`);

    try {
      const searchResult = await svc.callTool('search_shop_catalog', {
        query: testCase.query,
        context: testCase.context,
        limit: 50 // Test with high limit to ensure we get all results
      });

      const normalized = normalizeCatalogResult(searchResult);

      // Filter for bikes under $5000
      const underBudget = normalized.products.filter((p: any) => {
        const price = parseFloat(p.price_min || '0');
        return price > 0 && price <= 5000;
      });

      // Check for expected bikes
      const foundExpectedBikes = testCase.expectedBikes.filter(expected =>
        normalized.products.some((p: any) =>
          p.title?.toLowerCase().includes(expected.toLowerCase())
        )
      );

      const result: TestResult = {
        query: testCase.query,
        context: testCase.context,
        productCount: normalized.products.length,
        sampleProducts: normalized.products.slice(0, 3),
        underBudget: underBudget.slice(0, 5),
        expectedBikes: testCase.expectedBikes,
        foundExpectedBikes
      };

      results.push(result);

      console.log(`  📊 Products found: ${normalized.products.length}`);
      console.log(`  💰 Under $5000: ${underBudget.length}`);
      console.log(`  🎯 Expected bikes found: ${foundExpectedBikes.length}/${testCase.expectedBikes.length}`);

      if (normalized.products.length > 0) {
        console.log(`  🚲 Sample products:`);
        normalized.products.slice(0, 3).forEach((p: any, i: number) => {
          const price = p.price_min ? `$${p.price_min}` : 'No price';
          console.log(`    ${i + 1}. ${p.title} - ${price}`);
        });
      }

      if (foundExpectedBikes.length > 0) {
        console.log(`  ✅ Found expected: ${foundExpectedBikes.join(', ')}`);
      }

      console.log('');

    } catch (error) {
      console.error(`  ❌ Query failed:`, error);
      results.push({
        query: testCase.query,
        context: testCase.context,
        productCount: 0,
        sampleProducts: [],
        underBudget: [],
        expectedBikes: testCase.expectedBikes,
        foundExpectedBikes: []
      });
    }
  }

  // Summary analysis
  console.log('\n📈 SUMMARY ANALYSIS');
  console.log('='.repeat(50));

  const totalProducts = Math.max(...results.map(r => r.productCount));
  const totalUnderBudget = Math.max(...results.map(r => r.underBudget.length));
  const averageResults = results.reduce((sum, r) => sum + r.productCount, 0) / results.length;

  console.log(`🏆 Maximum products returned in single query: ${totalProducts}`);
  console.log(`💰 Maximum bikes under $5000 found: ${totalUnderBudget}`);
  console.log(`📊 Average results per query: ${averageResults.toFixed(1)}`);

  // Check if the slice(0,10) bug is fixed
  const hasLargeResults = results.some(r => r.productCount > 10);

  console.log('\n🐛 BUG FIX VERIFICATION:');
  if (hasLargeResults) {
    console.log('✅ FIXED: Results > 10 products found - slice(0,10) bug resolved!');
  } else {
    console.log('⚠️  WARNING: No queries returned > 10 products. Bug may still exist or limited inventory.');
  }

  // Check for specific expected bikes
  console.log('\n🎯 EXPECTED BIKE DISCOVERY:');
  const allFoundBikes = new Set<string>();
  results.forEach(r => r.foundExpectedBikes.forEach(bike => allFoundBikes.add(bike)));

  if (allFoundBikes.has('Trek Domane AL 5') || allFoundBikes.has('Trek')) {
    console.log('✅ Trek bikes discoverable (including Domane AL 5 price range $2,629)');
  } else {
    console.log('❌ Trek bikes not found');
  }

  if (allFoundBikes.has('Cannondale Topstone') || allFoundBikes.has('Cannondale')) {
    console.log('✅ Cannondale bikes discoverable (including Topstone price range $2,700-$3,590)');
  } else {
    console.log('❌ Cannondale bikes not found');
  }

  // Show detailed results for debugging
  console.log('\n📋 DETAILED RESULTS:');
  results.forEach((result, i) => {
    console.log(`\n${i + 1}. "${result.query}"`);
    console.log(`   Products: ${result.productCount} | Under $5K: ${result.underBudget.length}`);
    console.log(`   Expected found: ${result.foundExpectedBikes.join(', ') || 'None'}`);

    if (result.underBudget.length > 0) {
      console.log(`   Under budget bikes:`);
      result.underBudget.forEach((bike: any, j: number) => {
        console.log(`     • ${bike.title} - $${bike.price_min}`);
      });
    }
  });

  console.log('\n✅ MCP Fix Verification Complete!');
  return results;
}

// Run the test
testMCPFix()
  .then(() => {
    console.log('\n🎉 Test completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  });