import { logger } from '../utils/logger';

export interface ShopifyStorefrontMCPConfig {
  domain: string;
  endpoint: string;
  enabled: boolean;
}

export function getShopifyStorefrontMCPConfig(): ShopifyStorefrontMCPConfig {
  const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN?.trim() || '';
  const override = process.env.SHOPIFY_STOREFRONT_MCP_ENDPOINT?.trim();
  const enabled = !!domain || !!override;

  if (!enabled) {
    logger.warn('Shopify Storefront MCP not configured (set SHOPIFY_STOREFRONT_DOMAIN)');
    return { domain: '', endpoint: '', enabled: false };
  }

  const endpoint = override || `https://${domain}/api/mcp`;
  return { domain, endpoint, enabled: true };
}

