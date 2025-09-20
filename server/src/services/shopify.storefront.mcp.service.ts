import fetch from 'node-fetch';
import { logger } from '../utils/logger';
import { getShopifyStorefrontMCPConfig } from '../config/shopify.storefront.config';

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
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now(),
      params: { name, arguments: args },
    };
    return this.send<Json>(req, signal);
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
    const normalized = products.map((p: any) => ({
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

