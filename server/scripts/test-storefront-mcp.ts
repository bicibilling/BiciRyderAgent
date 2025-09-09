import dotenv from 'dotenv';
dotenv.config();

import { ShopifyStorefrontMCPService, normalizeCatalogResult } from '../src/services/shopify.storefront.mcp.service';

async function main() {
  const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN;
  if (!domain) {
    console.error('Missing SHOPIFY_STOREFRONT_DOMAIN');
    process.exit(1);
  }
  console.log('Testing Storefront MCP endpoint for domain:', domain);
  const svc = new ShopifyStorefrontMCPService();
  if (!svc.isEnabled()) {
    console.error('Service not enabled (endpoint not configured)');
    process.exit(1);
  }
  const tools = await svc.listTools();
  console.log('tools/list OK. Tool names:', tools?.result?.tools?.map((t: any) => t.name));

  const search = await svc.callTool('search_shop_catalog', { query: 'road bike', context: 'inventory check', limit: 5 });
  const normalized = normalizeCatalogResult(search);
  console.log('search_shop_catalog OK. Product count (normalized):', normalized.products.length);
  console.log('Sample:', normalized.products[0]);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

