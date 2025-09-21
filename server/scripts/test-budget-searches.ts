import dotenv from 'dotenv';
dotenv.config();

import { ShopifyStorefrontMCPService, normalizeCatalogResult } from '../src/services/shopify.storefront.mcp.service';

async function testBudgetSearches() {
  console.log('💰 Testing Budget-Constrained Bike Searches');
  console.log('='.repeat(50));

  const svc = new ShopifyStorefrontMCPService();
  if (!svc.isEnabled()) {
    console.error('❌ Service not enabled');
    process.exit(1);
  }

  // Test price filtering with various budget ranges
  const budgetTests = [
    { query: 'bikes', maxPrice: 3000, label: 'All bikes under $3000' },
    { query: 'bikes', maxPrice: 5000, label: 'All bikes under $5000' },
    { query: 'trek domane', maxPrice: 3000, label: 'Trek Domane under $3000' },
    { query: 'cannondale topstone', maxPrice: 4000, label: 'Cannondale Topstone under $4000' },
    { query: 'gravel bike', maxPrice: 5000, label: 'Gravel bikes under $5000' },
    { query: 'road bike', maxPrice: 4000, label: 'Road bikes under $4000' }
  ];

  for (const test of budgetTests) {
    console.log(`\n🔍 ${test.label}`);

    try {
      // Search with price filter
      const response = await svc.callTool('search_shop_catalog', {
        query: test.query,
        context: `budget search for bikes under $${test.maxPrice}`,
        filters: [{
          price: {
            max: test.maxPrice
          }
        }],
        limit: 100
      });

      const normalized = normalizeCatalogResult(response);

      // Filter for actual bikes (not accessories)
      const actualBikes = normalized.products.filter((p: any) => {
        const title = (p.title || '').toLowerCase();
        return (
          title.includes('bike') ||
          title.includes('domane') ||
          title.includes('topstone') ||
          title.includes('trek ') ||
          title.includes('cannondale ')
        ) &&
        !title.includes('helmet') &&
        !title.includes('light') &&
        !title.includes('lock') &&
        !title.includes('bag') &&
        !title.includes('bottle') &&
        !title.includes('pump') &&
        !title.includes('wash') &&
        !title.includes('cleaner') &&
        !title.includes('stand') &&
        !title.includes('rack') &&
        !title.includes('saddle') &&
        !title.includes('cage') &&
        !title.includes('tool') &&
        !title.includes('tape') &&
        !title.includes('pedal') &&
        !title.includes('tire') &&
        !title.includes('tube');
      });

      // Verify price filtering worked
      const overBudget = actualBikes.filter((p: any) => {
        const price = parseFloat(p.price_min || '0');
        return price > test.maxPrice;
      });

      console.log(`  📊 Total products found: ${normalized.products.length}`);
      console.log(`  🚲 Actual complete bikes: ${actualBikes.length}`);
      console.log(`  ⚠️  Over budget bikes: ${overBudget.length}`);

      if (actualBikes.length > 0) {
        console.log(`  💰 Bikes found under $${test.maxPrice}:`);
        actualBikes.slice(0, 8).forEach((bike: any) => {
          const price = parseFloat(bike.price_min || '0');
          const emoji = price <= test.maxPrice ? '✅' : '❌';
          console.log(`    ${emoji} ${bike.title} - $${bike.price_min}`);
        });
      }

      if (overBudget.length > 0) {
        console.log(`  ❌ Over budget items (should not appear):`);
        overBudget.forEach((bike: any) => {
          console.log(`    • ${bike.title} - $${bike.price_min}`);
        });
      }

    } catch (error) {
      console.error(`  ❌ Search failed:`, error);
    }
  }

  // Test specific high-value bikes vs budget search
  console.log('\n🎯 Testing Specific Expected Bikes vs Budget');
  console.log('-'.repeat(40));

  // Test Trek Domane AL 5 specifically
  try {
    const domaneResponse = await svc.callTool('search_shop_catalog', {
      query: 'Trek Domane AL 5',
      context: 'looking for specific Trek Domane AL 5 model',
      limit: 20
    });

    const domaneNormalized = normalizeCatalogResult(domaneResponse);
    const domaneAL5 = domaneNormalized.products.find((p: any) =>
      p.title?.toLowerCase().includes('trek domane al 5')
    );

    if (domaneAL5) {
      console.log(`✅ Trek Domane AL 5 found: ${domaneAL5.title} - $${domaneAL5.price_min}`);
      console.log(`   Expected: ~$2,629 | Actual: $${domaneAL5.price_min}`);
    } else {
      console.log('❌ Trek Domane AL 5 not found');
    }

  } catch (error) {
    console.error('❌ Trek Domane search failed:', error);
  }

  // Test Cannondale Topstone specifically
  try {
    const topstoneResponse = await svc.callTool('search_shop_catalog', {
      query: 'Cannondale Topstone',
      context: 'looking for Cannondale Topstone models',
      limit: 30
    });

    const topstoneNormalized = normalizeCatalogResult(topstoneResponse);
    const affordableTopstones = topstoneNormalized.products.filter((p: any) => {
      const price = parseFloat(p.price_min || '0');
      return p.title?.toLowerCase().includes('topstone') && price >= 2000 && price <= 4000;
    });

    console.log(`✅ Cannondale Topstone models in $2K-$4K range: ${affordableTopstones.length}`);
    affordableTopstones.slice(0, 5).forEach((bike: any) => {
      console.log(`   • ${bike.title} - $${bike.price_min}`);
    });

  } catch (error) {
    console.error('❌ Cannondale Topstone search failed:', error);
  }

  console.log('\n🎉 Budget search testing complete!');
}

testBudgetSearches()
  .then(() => console.log('\n✅ All tests completed'))
  .catch(err => console.error('\n❌ Test failed:', err));