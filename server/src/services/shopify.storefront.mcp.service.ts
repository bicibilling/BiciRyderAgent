import fetch from 'node-fetch';
import { logger } from '../utils/logger';
import { getShopifyStorefrontMCPConfig } from '../config/shopify.storefront.config';
import { redisService } from './redis.service';

type Json = any;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: number | string;
  params?: Record<string, any>;
}

interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: any };
}

export class ShopifyStorefrontMCPService {
  private endpoint: string | null;

  constructor() {
    const cfg = getShopifyStorefrontMCPConfig();
    this.endpoint = cfg.enabled ? cfg.endpoint : null;
  }

  isEnabled() {
    return !!this.endpoint;
  }

  async listTools(signal?: AbortSignal): Promise<Json> {
    this.ensureConfigured();
    const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'tools/list', id: Date.now() };
    return this.send<Json>(req, signal);
  }

  async callTool(name: string, args: Record<string, any> = {}, signal?: AbortSignal): Promise<Json> {
    this.ensureConfigured();
    
    // Create cache key from tool name and arguments
    const cacheKey = JSON.stringify({ name, args });
    
    // Check cache first (only for specific tools that benefit from caching)
    const cacheableTools = ['search_shop_catalog', 'get_product_details', 'search_shop_policies_and_faqs'];
    if (cacheableTools.includes(name)) {
      try {
        const cachedResult = await redisService.getCachedMCPResult(name, cacheKey);
        if (cachedResult) {
          logger.debug(`MCP cache hit for ${name}`, { 
            tool: name, 
            cacheAge: cachedResult._cache?.age 
          });
          return cachedResult;
        }
      } catch (cacheError) {
        logger.warn('MCP cache read error, proceeding with API call:', cacheError);
      }
    }
    
    // Make API call
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now(),
      params: { name, arguments: args },
    };
    
    const result = await this.send<Json>(req, signal);
    
    // Cache successful results (only for cacheable tools)
    if (cacheableTools.includes(name) && result && !result.error) {
      try {
        await redisService.cacheMCPResult(name, cacheKey, result);
        logger.debug(`MCP result cached for ${name}`);
        
        // Add cache metadata to result
        const resultWithCache = {
          ...result,
          _cache: {
            hit: false,
            age: 0,
            tool: name,
            query: cacheKey
          }
        };
        return resultWithCache;
      } catch (cacheError) {
        logger.warn('MCP cache write error, returning result anyway:', cacheError);
      }
    }
    
    return result;
  }

  private ensureConfigured() {
    if (!this.endpoint) {
      throw new Error('Shopify Storefront MCP endpoint not configured');
    }
  }

  private async send<T>(body: JsonRpcRequest, signal?: AbortSignal): Promise<T> {
    const endpoint = this.endpoint!;
    const started = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      const text = await res.text();
      if (!res.ok) {
        logger.error('Shopify MCP request failed', { status: res.status, text });
        throw new Error(`MCP HTTP ${res.status}`);
      }
      const parsed = JSON.parse(text) as JsonRpcResponse<T>;
      if (parsed.error) {
        throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
      }
      return parsed.result as T;
    } catch (err) {
      logger.error('Shopify MCP request error', {
        endpoint,
        method: body.method,
        duration_ms: Date.now() - started,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}

export function normalizeCatalogResult(result: any) {
  try {
    const blocks = result?.content || [];
    // Some servers wrap JSON in a text block; attempt to parse
    let payload: any = null;
    for (const b of blocks) {
      if (typeof b?.text === 'string') {
        try { payload = JSON.parse(b.text); break; } catch {}
      }
    }
    const products = payload?.products || [];
    const normalized = products.slice(0, 10).map((p: any) => ({
      product_id: p.product_id,
      title: p.title,
      url: p.url,
      image_url: p.image_url,
      price_min: p.price_range?.min,
      price_max: p.price_range?.max,
      currency: p.price_range?.currency,
      in_stock: Array.isArray(p.variants) ? p.variants.some((v: any) => v.available) : undefined,
    }));
    return {
      products: normalized,
      total: products.length,
      more_available: products.length > normalized.length,
    };
  } catch {
    return { products: [], total: 0, more_available: false };
  }
}

