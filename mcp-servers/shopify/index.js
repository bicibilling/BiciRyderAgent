#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const axios = require('axios');

class ShopifyMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'bici-shopify-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!this.shopifyDomain || !this.accessToken) {
      console.error('Missing required Shopify credentials:');
      console.error('- SHOPIFY_STORE_DOMAIN:', !!this.shopifyDomain);
      console.error('- SHOPIFY_ACCESS_TOKEN:', !!this.accessToken);
      throw new Error('Missing Shopify credentials');
    }

    this.setupTools();
  }

  setupTools() {
    // Product search tool
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'search_products',
            description: 'Search for products in the BICI Shopify store',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for products'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 5
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_shop_policies',
            description: 'Get store policies including returns, shipping, and payment information',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Specific policy type to query (return, shipping, payment, etc.)'
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    // Tool call handler
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'search_products') {
          return await this.searchProducts(args.query, args.limit || 5);
        } else if (name === 'get_shop_policies') {
          return await this.getShopPolicies(args.query);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Tool ${name} error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async searchProducts(query, limit = 5) {
    try {
      console.log(`🔍 Searching for products: "${query}" (limit: ${limit})`);

      // Shopify GraphQL query for product search
      const graphqlQuery = `
        query ($query: String!, $first: Int!) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
                productType
                vendor
                tags
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      availableForSale
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        `https://${this.shopifyDomain}/admin/api/2023-10/graphql.json`,
        {
          query: graphqlQuery,
          variables: {
            query: query,
            first: limit
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.errors) {
        throw new Error(`Shopify API error: ${JSON.stringify(response.data.errors)}`);
      }

      const products = response.data.data.products.edges.map(edge => {
        const product = edge.node;
        const variant = product.variants.edges[0]?.node;
        const image = product.images.edges[0]?.node;

        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          description: product.description?.substring(0, 200) + (product.description?.length > 200 ? '...' : ''),
          type: product.productType,
          vendor: product.vendor,
          tags: product.tags,
          price: {
            min: product.priceRange.minVariantPrice.amount,
            max: product.priceRange.maxVariantPrice.amount,
            currency: product.priceRange.minVariantPrice.currencyCode
          },
          image: image?.url,
          available: variant?.availableForSale || false,
          inventory: variant?.inventoryQuantity || 0,
          url: `https://${this.shopifyDomain.replace('.myshopify.com', '')}.com/products/${product.handle}`
        };
      });

      console.log(`✅ Found ${products.length} products for query: "${query}"`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query,
              products,
              total: products.length
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      console.error('Product search error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to search products: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async getShopPolicies(query) {
    try {
      console.log(`📋 Getting shop policies for: "${query}"`);

      // Get shop information including policies
      const graphqlQuery = `
        query {
          shop {
            name
            description
            url
            returnPolicy {
              title
              body
              url
            }
            shippingPolicy {
              title
              body
              url
            }
            privacyPolicy {
              title
              body
              url
            }
            termsOfService {
              title
              body
              url
            }
          }
        }
      `;

      const response = await axios.post(
        `https://${this.shopifyDomain}/admin/api/2023-10/graphql.json`,
        { query: graphqlQuery },
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.errors) {
        throw new Error(`Shopify API error: ${JSON.stringify(response.data.errors)}`);
      }

      const shop = response.data.data.shop;
      
      // Build policy response based on query
      let policyResponse = '';
      const queryLower = query.toLowerCase();

      if (queryLower.includes('return') || queryLower.includes('refund')) {
        if (shop.returnPolicy) {
          policyResponse = `**Return Policy:**\n${shop.returnPolicy.body || 'Please contact us for return information.'}`;
        } else {
          policyResponse = 'For returns and refunds, please contact our store directly at 778-719-3080 or visit us at 1497 Adanac Street, Vancouver.';
        }
      } else if (queryLower.includes('shipping') || queryLower.includes('delivery')) {
        if (shop.shippingPolicy) {
          policyResponse = `**Shipping Policy:**\n${shop.shippingPolicy.body || 'Please contact us for shipping information.'}`;
        } else {
          policyResponse = 'For shipping information, please contact our store at 778-719-3080. We offer local delivery and can arrange shipping for bikes and accessories.';
        }
      } else if (queryLower.includes('payment') || queryLower.includes('pay')) {
        policyResponse = 'We accept major credit cards, Affirm financing, Shop Pay, and RBC PayPlan for bike purchases. Contact us at 778-719-3080 for payment options.';
      } else if (queryLower.includes('warranty')) {
        policyResponse = 'Bike warranties vary by manufacturer. We provide full warranty support for all bikes we sell. Contact us at 778-719-3080 for specific warranty information.';
      } else {
        // General policies
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

      console.log(`✅ Retrieved policy information for: "${query}"`);

      return {
        content: [
          {
            type: 'text',
            text: policyResponse
          }
        ]
      };

    } catch (error) {
      console.error('Policy lookup error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get policies: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🚀 Shopify MCP Server running');
  }
}

// Start the server
if (require.main === module) {
  const server = new ShopifyMCPServer();
  server.run().catch(console.error);
}

module.exports = ShopifyMCPServer;