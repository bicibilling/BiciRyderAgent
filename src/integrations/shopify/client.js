const Shopify = require('shopify-api-node');
const { integrationLogger } = require('../../config/logger');
const { normalizePhoneNumber, validateEmail } = require('../../utils/validation');

class ShopifyClient {
  constructor() {
    this.client = new Shopify({
      shopName: process.env.SHOPIFY_SHOP_DOMAIN.replace('.myshopify.com', ''),
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
      apiVersion: '2023-10'
    });

    this.logger = integrationLogger.child({ integration: 'shopify' });
  }

  /**
   * Search for customer orders by phone, email, or order number
   */
  async searchOrders(identifier, identifierType) {
    try {
      this.logger.info('Searching orders', { identifier: identifier.substring(0, 4) + '***', identifierType });

      let orders = [];
      
      switch (identifierType) {
        case 'phone':
          const normalizedPhone = normalizePhoneNumber(identifier);
          // Search by phone in customer data and billing/shipping addresses
          const customersByPhone = await this.client.customer.search({
            query: `phone:${normalizedPhone}`
          });
          
          if (customersByPhone.length > 0) {
            const customerIds = customersByPhone.map(c => c.id);
            for (const customerId of customerIds) {
              const customerOrders = await this.client.order.list({
                customer_id: customerId,
                status: 'any',
                limit: 50
              });
              orders.push(...customerOrders);
            }
          }
          break;

        case 'email':
          const { isValid, normalized } = validateEmail(identifier);
          if (!isValid) {
            throw new Error('Invalid email format');
          }
          
          orders = await this.client.order.list({
            email: normalized,
            status: 'any',
            limit: 50
          });
          break;

        case 'order_number':
          // Remove # if present and search by order number
          const orderNumber = identifier.replace('#', '');
          try {
            const order = await this.client.order.get(orderNumber);
            orders = [order];
          } catch (error) {
            if (error.statusCode === 404) {
              orders = [];
            } else {
              throw error;
            }
          }
          break;

        default:
          throw new Error('Invalid identifier type. Must be phone, email, or order_number');
      }

      // Transform orders for response
      const transformedOrders = orders.map(order => this.transformOrderData(order));

      this.logger.info('Orders search completed', { 
        identifier: identifier.substring(0, 4) + '***',
        identifierType,
        ordersFound: transformedOrders.length 
      });

      return {
        success: true,
        orders: transformedOrders,
        total: transformedOrders.length
      };

    } catch (error) {
      this.logger.error('Order search failed', { 
        identifier: identifier.substring(0, 4) + '***',
        identifierType,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to search orders: ${error.message}`,
        orders: [],
        total: 0
      };
    }
  }

  /**
   * Get specific order details by order ID
   */
  async getOrderDetails(orderId) {
    try {
      this.logger.info('Fetching order details', { orderId });

      const order = await this.client.order.get(orderId);
      const transformedOrder = this.transformOrderData(order, true); // Include detailed info

      this.logger.info('Order details retrieved', { orderId, orderNumber: order.order_number });

      return {
        success: true,
        order: transformedOrder
      };

    } catch (error) {
      this.logger.error('Order details fetch failed', { orderId, error: error.message });
      
      return {
        success: false,
        error: `Unable to fetch order details: ${error.message}`
      };
    }
  }

  /**
   * Check product availability and inventory
   */
  async checkProductAvailability(productHandle, variantOptions = {}) {
    try {
      this.logger.info('Checking product availability', { productHandle, variantOptions });

      // Get product by handle
      const products = await this.client.product.list({
        handle: productHandle,
        limit: 1
      });

      if (products.length === 0) {
        return {
          success: false,
          error: 'Product not found',
          available: false
        };
      }

      const product = products[0];
      let targetVariants = product.variants;

      // Filter variants by options if provided
      if (Object.keys(variantOptions).length > 0) {
        targetVariants = product.variants.filter(variant => {
          return Object.entries(variantOptions).every(([optionName, optionValue]) => {
            const optionIndex = product.options.findIndex(opt => 
              opt.name.toLowerCase() === optionName.toLowerCase()
            );
            if (optionIndex === -1) return false;
            
            const variantOptionValue = [variant.option1, variant.option2, variant.option3][optionIndex];
            return variantOptionValue && variantOptionValue.toLowerCase() === optionValue.toLowerCase();
          });
        });
      }

      // Get inventory levels for variants
      const variantInventory = await Promise.all(
        targetVariants.map(async (variant) => {
          try {
            const inventoryLevels = await this.client.inventoryLevel.list({
              inventory_item_ids: variant.inventory_item_id
            });

            const totalQuantity = inventoryLevels.reduce((sum, level) => sum + level.available, 0);

            return {
              variant_id: variant.id,
              title: variant.title,
              price: variant.price,
              sku: variant.sku,
              available_quantity: totalQuantity,
              inventory_policy: variant.inventory_policy,
              available: totalQuantity > 0 || variant.inventory_policy === 'continue'
            };
          } catch (inventoryError) {
            this.logger.warn('Inventory check failed for variant', { 
              variantId: variant.id, 
              error: inventoryError.message 
            });
            
            return {
              variant_id: variant.id,
              title: variant.title,
              price: variant.price,
              sku: variant.sku,
              available_quantity: 0,
              inventory_policy: variant.inventory_policy,
              available: variant.inventory_policy === 'continue'
            };
          }
        })
      );

      const availableVariants = variantInventory.filter(v => v.available);

      this.logger.info('Product availability checked', { 
        productHandle,
        totalVariants: variantInventory.length,
        availableVariants: availableVariants.length
      });

      return {
        success: true,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          product_type: product.product_type,
          vendor: product.vendor,
          tags: product.tags,
          available: availableVariants.length > 0
        },
        variants: variantInventory,
        available_variants: availableVariants,
        total_available: availableVariants.length
      };

    } catch (error) {
      this.logger.error('Product availability check failed', { 
        productHandle, 
        variantOptions,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to check product availability: ${error.message}`,
        available: false
      };
    }
  }

  /**
   * Get product recommendations based on customer profile
   */
  async getProductRecommendations(customerProfile, budgetRange = null) {
    try {
      this.logger.info('Getting product recommendations', { customerProfile, budgetRange });

      let query = '';
      const filters = [];

      // Build search query based on customer profile
      if (customerProfile.bike_type) {
        filters.push(`product_type:${customerProfile.bike_type}`);
      }

      if (customerProfile.intended_use) {
        // Map intended use to tags or product types
        const useTagMap = {
          'commuting': 'commuter',
          'recreational': 'recreational',
          'racing': 'performance',
          'mountain': 'mountain',
          'road': 'road'
        };
        
        const tag = useTagMap[customerProfile.intended_use.toLowerCase()];
        if (tag) {
          filters.push(`tag:${tag}`);
        }
      }

      // Apply budget filter if provided
      if (budgetRange && budgetRange.min !== undefined) {
        filters.push(`variants.price:>=${budgetRange.min}`);
      }
      if (budgetRange && budgetRange.max !== undefined) {
        filters.push(`variants.price:<=${budgetRange.max}`);
      }

      query = filters.join(' AND ');

      // Search products
      const products = await this.client.product.list({
        limit: 20,
        published_status: 'published',
        ...(query && { query })
      });

      // Transform and score products
      const recommendations = products.map(product => {
        const matchScore = this.calculateMatchScore(product, customerProfile);
        return {
          ...this.transformProductData(product),
          match_score: matchScore,
          recommendation_reason: this.generateRecommendationReason(product, customerProfile)
        };
      });

      // Sort by match score
      recommendations.sort((a, b) => b.match_score - a.match_score);

      this.logger.info('Product recommendations generated', { 
        customerProfile,
        recommendationsCount: recommendations.length 
      });

      return {
        success: true,
        recommendations: recommendations.slice(0, 10), // Top 10 recommendations
        total: recommendations.length
      };

    } catch (error) {
      this.logger.error('Product recommendations failed', { 
        customerProfile,
        error: error.message 
      });
      
      return {
        success: false,
        error: `Unable to generate product recommendations: ${error.message}`,
        recommendations: []
      };
    }
  }

  /**
   * Transform order data for consistent API response
   */
  transformOrderData(order, includeDetails = false) {
    const baseData = {
      id: order.id,
      order_number: order.order_number,
      name: order.name,
      email: order.email,
      phone: order.phone,
      total_price: order.total_price,
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer: {
        id: order.customer?.id,
        first_name: order.customer?.first_name,
        last_name: order.customer?.last_name,
        email: order.customer?.email,
        phone: order.customer?.phone
      }
    };

    if (includeDetails) {
      baseData.line_items = order.line_items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        variant_title: item.variant_title,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        total_discount: item.total_discount
      }));

      baseData.shipping_address = order.shipping_address;
      baseData.billing_address = order.billing_address;
      baseData.fulfillments = order.fulfillments?.map(fulfillment => ({
        id: fulfillment.id,
        status: fulfillment.status,
        tracking_company: fulfillment.tracking_company,
        tracking_number: fulfillment.tracking_number,
        tracking_url: fulfillment.tracking_url,
        created_at: fulfillment.created_at
      }));
    }

    return baseData;
  }

  /**
   * Transform product data for consistent API response
   */
  transformProductData(product) {
    const lowestPrice = Math.min(...product.variants.map(v => parseFloat(v.price)));
    const highestPrice = Math.max(...product.variants.map(v => parseFloat(v.price)));

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      vendor: product.vendor,
      tags: product.tags ? product.tags.split(', ') : [],
      price_range: {
        min: lowestPrice.toFixed(2),
        max: highestPrice.toFixed(2),
        formatted: lowestPrice === highestPrice 
          ? `$${lowestPrice.toFixed(2)}` 
          : `$${lowestPrice.toFixed(2)} - $${highestPrice.toFixed(2)}`
      },
      variants_count: product.variants.length,
      images: product.images?.map(img => ({
        id: img.id,
        src: img.src,
        alt: img.alt
      })) || [],
      published_at: product.published_at
    };
  }

  /**
   * Calculate match score for product recommendations
   */
  calculateMatchScore(product, customerProfile) {
    let score = 0;

    // Product type match
    if (customerProfile.bike_type && 
        product.product_type.toLowerCase().includes(customerProfile.bike_type.toLowerCase())) {
      score += 50;
    }

    // Tags match
    if (product.tags && customerProfile.intended_use) {
      const tags = product.tags.toLowerCase().split(', ');
      if (tags.some(tag => tag.includes(customerProfile.intended_use.toLowerCase()))) {
        score += 30;
      }
    }

    // Vendor preference
    if (customerProfile.preferred_brand && 
        product.vendor.toLowerCase() === customerProfile.preferred_brand.toLowerCase()) {
      score += 20;
    }

    return score;
  }

  /**
   * Generate recommendation reason
   */
  generateRecommendationReason(product, customerProfile) {
    const reasons = [];

    if (customerProfile.bike_type && 
        product.product_type.toLowerCase().includes(customerProfile.bike_type.toLowerCase())) {
      reasons.push(`Perfect match for ${customerProfile.bike_type} bikes`);
    }

    if (customerProfile.intended_use && product.tags) {
      const tags = product.tags.toLowerCase().split(', ');
      if (tags.some(tag => tag.includes(customerProfile.intended_use.toLowerCase()))) {
        reasons.push(`Ideal for ${customerProfile.intended_use}`);
      }
    }

    if (reasons.length === 0) {
      reasons.push('Popular choice among our customers');
    }

    return reasons.join(', ');
  }
}

module.exports = ShopifyClient;