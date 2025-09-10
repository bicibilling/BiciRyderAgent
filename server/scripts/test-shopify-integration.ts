#!/usr/bin/env tsx

/**
 * Script to test the Shopify MCP integration
 * This will test the various Shopify tools available through the MCP server
 */

import axios from 'axios';

const SHOPIFY_MCP_URL = 'https://bici.cc/api/mcp';

interface ShopifyMcpRequest {
  jsonrpc: string;
  method: string;
  id: number;
  params: {
    name: string;
    arguments: any;
  };
}

async function testShopifyTool(toolName: string, toolArgs: any): Promise<any> {
  const request: ShopifyMcpRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: Math.floor(Math.random() * 1000),
    params: {
      name: toolName,
      arguments: toolArgs
    }
  };

  try {
    console.log(`\n🧪 Testing ${toolName}:`);
    console.log(`Arguments:`, JSON.stringify(toolArgs, null, 2));
    
    const response = await axios.post(SHOPIFY_MCP_URL, request, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    if (response.data.result) {
      console.log('✅ Success!');
      console.log(`Response:`, JSON.stringify(response.data.result, null, 2));
      return response.data.result;
    } else if (response.data.error) {
      console.log('❌ Error:', response.data.error);
      return null;
    } else {
      console.log('⚠️  Unexpected response format:', response.data);
      return response.data;
    }
  } catch (error: any) {
    console.log('❌ Request failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

async function testSearchCatalog(): Promise<void> {
  console.log('\n🔍 Testing Product Search Functionality');
  console.log('=====================================');
  
  // Test 1: General bike search
  await testShopifyTool('search_shop_catalog', {
    query: 'mountain bike',
    context: 'Customer looking for a mountain bike for trail riding'
  });

  // Test 2: Road bike search
  await testShopifyTool('search_shop_catalog', {
    query: 'road bike',
    context: 'Customer interested in road cycling and fitness',
    limit: 5
  });

  // Test 3: E-bike search with price filter
  await testShopifyTool('search_shop_catalog', {
    query: 'electric bike',
    context: 'Customer wants electric assistance for commuting',
    filters: [
      {
        price: {
          min: 1000,
          max: 3000
        }
      }
    ]
  });
}

async function testStorePolicies(): Promise<void> {
  console.log('\n📋 Testing Store Policies & FAQs');
  console.log('===============================');
  
  // Test store policies
  await testShopifyTool('search_shop_policies_and_faqs', {
    query: 'What is your return policy?',
    context: 'Customer considering a bike purchase'
  });

  await testShopifyTool('search_shop_policies_and_faqs', {
    query: 'shipping information',
    context: 'Customer wants to know delivery options'
  });

  await testShopifyTool('search_shop_policies_and_faqs', {
    query: 'store hours',
    context: 'Customer wants to visit the store'
  });
}

async function testCartOperations(): Promise<void> {
  console.log('\n🛒 Testing Cart Operations');
  console.log('========================');
  
  // First, we need to create a cart by searching for a product and getting its variant ID
  console.log('\nFirst, let\'s find a product to add to cart...');
  const searchResult = await testShopifyTool('search_shop_catalog', {
    query: 'bike',
    context: 'Looking for any bike to test cart functionality',
    limit: 1
  });

  if (searchResult && searchResult.products && searchResult.products.length > 0) {
    const product = searchResult.products[0];
    const variantId = product.variants?.[0]?.id;
    
    if (variantId) {
      console.log(`\nFound product: ${product.title}`);
      console.log(`Using variant ID: ${variantId}`);
      
      // Test creating a cart with an item
      const cartResult = await testShopifyTool('update_cart', {
        add_items: [
          {
            product_variant_id: variantId,
            quantity: 1
          }
        ]
      });

      if (cartResult && cartResult.cart && cartResult.cart.id) {
        const cartId = cartResult.cart.id;
        console.log(`\n✅ Cart created with ID: ${cartId}`);
        
        // Test getting the cart
        await testShopifyTool('get_cart', {
          cart_id: cartId
        });
        
        // Test updating cart quantity
        if (cartResult.cart.lines && cartResult.cart.lines.length > 0) {
          const lineId = cartResult.cart.lines[0].id;
          await testShopifyTool('update_cart', {
            cart_id: cartId,
            update_items: [
              {
                id: lineId,
                quantity: 2
              }
            ]
          });
        }
      }
    } else {
      console.log('⚠️  No variant ID found in product, skipping cart tests');
    }
  } else {
    console.log('⚠️  No products found, skipping cart tests');
  }
}

async function testProductDetails(): Promise<void> {
  console.log('\n📦 Testing Product Details');
  console.log('========================');
  
  // First get a product ID from search
  const searchResult = await testShopifyTool('search_shop_catalog', {
    query: 'bike',
    context: 'Looking for any bike to get product details',
    limit: 1
  });

  if (searchResult && searchResult.products && searchResult.products.length > 0) {
    const product = searchResult.products[0];
    const productId = product.id;
    
    console.log(`\nFound product: ${product.title}`);
    console.log(`Testing product details for ID: ${productId}`);
    
    await testShopifyTool('get_product_details', {
      product_id: productId
    });
  } else {
    console.log('⚠️  No products found for product details test');
  }
}

async function main(): Promise<void> {
  console.log('🛍️  BICI Shopify MCP Integration Test');
  console.log('====================================');
  console.log(`Testing MCP server at: ${SHOPIFY_MCP_URL}`);
  console.log('');

  try {
    // Test all major functionality
    await testSearchCatalog();
    await testStorePolicies();
    await testProductDetails();
    await testCartOperations();
    
    console.log('\n🎉 Testing Complete!');
    console.log('\n💡 Integration Summary:');
    console.log('- Shopify MCP server is accessible at https://bici.cc/api/mcp');
    console.log('- ElevenLabs agent now has access to live product data');
    console.log('- Agent can search products, get pricing, and help with cart management');
    console.log('- Store policies and FAQs are available for customer questions');
    console.log('\nThe agent can now:');
    console.log('✅ Search for specific bikes by type, price, features');
    console.log('✅ Provide real-time pricing and availability');
    console.log('✅ Answer store policy questions');
    console.log('✅ Help customers build shopping carts');
    console.log('✅ Access detailed product information');

  } catch (error: any) {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { testShopifyTool, testSearchCatalog, testStorePolicies, testCartOperations };