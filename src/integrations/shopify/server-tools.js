const ShopifyClient = require('./client');
const { serverToolLogger } = require('../../config/logger');

class ShopifyServerTools {
  constructor() {
    this.client = new ShopifyClient();
    this.logger = serverToolLogger.child({ service: 'shopify-server-tools' });
  }

  /**
   * Server tool configuration for ElevenLabs
   */
  getServerToolsConfig() {
    return [
      {
        name: "check_order_status",
        description: "Look up customer order status and tracking information using phone number, email, or order number",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/shopify/orders/lookup`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          identifier: {
            type: "string",
            description: "Phone number (+1234567890), email address, or order number",
            required: true
          },
          identifier_type: {
            type: "string", 
            description: "Type of identifier being used",
            enum: ["phone", "email", "order_number"],
            required: true
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            orders: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  order_number: { type: "string" },
                  total_price: { type: "string" },
                  financial_status: { type: "string" },
                  fulfillment_status: { type: "string" },
                  created_at: { type: "string" },
                  customer: { type: "object" }
                }
              }
            },
            total: { type: "integer" }
          }
        }
      },
      {
        name: "check_product_availability",
        description: "Check real-time inventory levels and availability for specific bikes and accessories",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/shopify/inventory/check`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          product_handle: {
            type: "string",
            description: "Shopify product handle (URL slug) or SKU of the bike/product",
            required: true
          },
          variant_options: {
            type: "object",
            description: "Specific variant options like size, color, etc.",
            properties: {
              size: { type: "string" },
              color: { type: "string" },
              style: { type: "string" }
            },
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            product: { type: "object" },
            variants: { type: "array" },
            available_variants: { type: "array" },
            total_available: { type: "integer" }
          }
        }
      },
      {
        name: "get_product_recommendations",
        description: "Get personalized bike and accessory recommendations based on customer profile and preferences",
        method: "POST",
        url: `${process.env.BASE_URL || 'https://yourdomain.com'}/api/server-tools/shopify/recommendations`,
        authentication: {
          type: "bearer_token",
          token: process.env.SERVER_TOOLS_API_KEY
        },
        parameters: {
          customer_profile: {
            type: "object",
            description: "Customer preferences and requirements gathered during conversation",
            properties: {
              bike_type: { 
                type: "string", 
                enum: ["road", "mountain", "hybrid", "electric", "commuter"],
                description: "Type of bike the customer is interested in"
              },
              intended_use: { 
                type: "string",
                enum: ["commuting", "recreational", "racing", "mountain", "touring"],
                description: "How the customer plans to use the bike"
              },
              experience_level: { 
                type: "string",
                enum: ["beginner", "intermediate", "advanced"],
                description: "Customer's cycling experience level"
              },
              preferred_brand: { 
                type: "string",
                description: "Any brand preferences mentioned by customer"
              }
            },
            required: true
          },
          budget_range: {
            type: "object",
            description: "Customer's budget constraints",
            properties: {
              min: { type: "number", description: "Minimum budget in dollars" },
              max: { type: "number", description: "Maximum budget in dollars" }
            },
            required: false
          }
        },
        response_schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  price_range: { type: "object" },
                  match_score: { type: "number" },
                  recommendation_reason: { type: "string" }
                }
              }
            },
            total: { type: "integer" }
          }
        }
      }
    ];
  }

  /**
   * Handle order lookup server tool request
   */
  async handleOrderLookup(req, res) {
    try {
      const { identifier, identifier_type } = req.body;

      this.logger.info('Processing order lookup request', { 
        identifier: identifier.substring(0, 4) + '***',
        identifier_type 
      });

      const result = await this.client.searchOrders(identifier, identifier_type);

      this.logger.info('Order lookup completed', { 
        identifier: identifier.substring(0, 4) + '***',
        identifier_type,
        success: result.success,
        ordersFound: result.total 
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Order lookup error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during order lookup',
        orders: [],
        total: 0
      });
    }
  }

  /**
   * Handle product availability check server tool request
   */
  async handleAvailabilityCheck(req, res) {
    try {
      const { product_handle, variant_options = {} } = req.body;

      this.logger.info('Processing availability check request', { 
        product_handle,
        variant_options 
      });

      const result = await this.client.checkProductAvailability(product_handle, variant_options);

      this.logger.info('Availability check completed', { 
        product_handle,
        success: result.success,
        available: result.available || false
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Availability check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during availability check',
        available: false
      });
    }
  }

  /**
   * Handle product recommendations server tool request
   */
  async handleProductRecommendations(req, res) {
    try {
      const { customer_profile, budget_range } = req.body;

      this.logger.info('Processing product recommendations request', { 
        customer_profile,
        budget_range 
      });

      const result = await this.client.getProductRecommendations(customer_profile, budget_range);

      this.logger.info('Product recommendations completed', { 
        customer_profile,
        success: result.success,
        recommendationsCount: result.recommendations?.length || 0
      });

      res.json(result);

    } catch (error) {
      this.logger.error('Product recommendations error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error during product recommendations',
        recommendations: []
      });
    }
  }

  /**
   * Test Shopify connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing Shopify connection');
      
      // Test by getting shop info
      const shop = await this.client.client.shop.get();
      
      this.logger.info('Shopify connection test successful', { 
        shopName: shop.name,
        domain: shop.domain 
      });

      return {
        success: true,
        message: 'Shopify connection successful',
        shop_info: {
          name: shop.name,
          domain: shop.domain,
          currency: shop.currency,
          timezone: shop.timezone
        }
      };

    } catch (error) {
      this.logger.error('Shopify connection test failed', { error: error.message });
      
      return {
        success: false,
        error: `Shopify connection failed: ${error.message}`
      };
    }
  }
}

module.exports = ShopifyServerTools;