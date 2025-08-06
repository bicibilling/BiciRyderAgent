/**
 * Shopify Integration
 * Handles order status checks, inventory management, and customer data
 */

import fetch from 'node-fetch';

export class ShopifyIntegration {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.shopifyDomain = process.env.SHOPIFY_DOMAIN; // e.g., bici-bikes.myshopify.com
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.baseURL = `https://${this.shopifyDomain}/admin/api/2023-10`;
    this.rateLimitDelay = 500; // ms between requests
    this.maxRetries = 3;
  }

  /**
   * Look up customer orders by phone, email, or order number
   */
  async lookupOrderStatus(identifier, identifierType) {
    try {
      console.log(`🔍 Looking up Shopify order: ${identifier} (${identifierType})`);
      
      let orders = [];
      
      switch (identifierType) {
        case 'order_number':
          orders = await this.getOrderByNumber(identifier);
          break;
        case 'email':
          orders = await this.getOrdersByEmail(identifier);
          break;
        case 'phone':
          orders = await this.getOrdersByPhone(identifier);
          break;
        default:
          throw new Error(`Invalid identifier type: ${identifierType}`);
      }
      
      if (orders.length === 0) {
        return {
          success: true,
          found: false,
          message: 'No orders found for the provided information'
        };
      }
      
      // Format order data for AI response
      const formattedOrders = orders.map(order => this.formatOrderData(order));
      
      return {
        success: true,
        found: true,
        orders: formattedOrders,
        total_orders: orders.length,
        message: `Found ${orders.length} order(s)`
      };
      
    } catch (error) {
      console.error('Shopify order lookup error:', error);
      return {
        success: false,
        found: false,
        error: error.message,
        message: 'Unable to lookup order information at this time'
      };
    }
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber) {
    try {
      // Try direct order lookup first
      const response = await this.makeRequest(`/orders.json?name=${encodeURIComponent(orderNumber)}`);
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.orders || [];
      
    } catch (error) {
      console.error('Error getting order by number:', error);
      return [];
    }
  }

  /**
   * Get orders by customer email
   */
  async getOrdersByEmail(email) {
    try {
      // First find customer by email
      const customerResponse = await this.makeRequest(`/customers/search.json?query=email:${encodeURIComponent(email)}`);
      
      if (!customerResponse.ok) {
        throw new Error(`Customer search error: ${customerResponse.status}`);
      }
      
      const customerData = await customerResponse.json();
      
      if (!customerData.customers || customerData.customers.length === 0) {
        return [];
      }
      
      const customerId = customerData.customers[0].id;
      
      // Get orders for this customer
      const ordersResponse = await this.makeRequest(`/orders.json?customer_id=${customerId}&status=any&limit=10`);
      
      if (!ordersResponse.ok) {
        throw new Error(`Orders lookup error: ${ordersResponse.status}`);
      }
      
      const ordersData = await ordersResponse.json();
      return ordersData.orders || [];
      
    } catch (error) {
      console.error('Error getting orders by email:', error);
      return [];
    }
  }

  /**
   * Get orders by customer phone number
   */
  async getOrdersByPhone(phone) {
    try {
      // Normalize phone number for search
      const normalizedPhone = this.normalizePhoneNumber(phone);
      
      // Search customers by phone
      const customerResponse = await this.makeRequest(`/customers/search.json?query=phone:${encodeURIComponent(normalizedPhone)}`);
      
      if (!customerResponse.ok) {
        throw new Error(`Customer search error: ${customerResponse.status}`);
      }
      
      const customerData = await customerResponse.json();
      
      if (!customerData.customers || customerData.customers.length === 0) {
        return [];
      }
      
      const customerId = customerData.customers[0].id;
      
      // Get orders for this customer
      const ordersResponse = await this.makeRequest(`/orders.json?customer_id=${customerId}&status=any&limit=10`);
      
      if (!ordersResponse.ok) {
        throw new Error(`Orders lookup error: ${ordersResponse.status}`);
      }
      
      const ordersData = await ordersResponse.json();
      return ordersData.orders || [];
      
    } catch (error) {
      console.error('Error getting orders by phone:', error);
      return [];
    }
  }

  /**
   * Check product availability and inventory
   */
  async checkProductAvailability(productHandle, variantOptions = {}) {
    try {
      console.log(`📦 Checking inventory for product: ${productHandle}`);
      
      // Get product by handle
      const productResponse = await this.makeRequest(`/products.json?handle=${encodeURIComponent(productHandle)}`);
      
      if (!productResponse.ok) {
        throw new Error(`Product lookup error: ${productResponse.status}`);
      }
      
      const productData = await productResponse.json();
      
      if (!productData.products || productData.products.length === 0) {
        return {
          success: true,
          found: false,
          message: 'Product not found'
        };
      }
      
      const product = productData.products[0];
      
      // Get inventory levels for all variants
      const variants = product.variants.map(variant => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        available: variant.inventory_quantity > 0,
        inventory_quantity: variant.inventory_quantity,
        inventory_policy: variant.inventory_policy,
        options: {
          size: variant.option1,
          color: variant.option2,
          material: variant.option3
        }
      }));
      
      // Filter variants based on options if provided
      let filteredVariants = variants;
      if (Object.keys(variantOptions).length > 0) {
        filteredVariants = variants.filter(variant => {
          return Object.entries(variantOptions).every(([key, value]) => {
            return variant.options[key]?.toLowerCase() === value.toLowerCase();
          });
        });
      }
      
      return {
        success: true,
        found: true,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          product_type: product.product_type,
          vendor: product.vendor,
          description: product.body_html?.replace(/<[^>]*>/g, '').substring(0, 200),
          images: product.images.map(img => img.src).slice(0, 3)
        },
        variants: filteredVariants,
        total_variants: variants.length,
        available_variants: filteredVariants.filter(v => v.available).length,
        in_stock: filteredVariants.some(v => v.available)
      };
      
    } catch (error) {
      console.error('Shopify inventory check error:', error);
      return {
        success: false,
        found: false,
        error: error.message,
        message: 'Unable to check product availability'
      };
    }
  }

  /**
   * Get product recommendations based on customer profile
   */
  async getProductRecommendations(customerProfile, budgetRange = {}) {
    try {
      console.log(`🎯 Getting product recommendations for customer profile`);
      
      const { bikeType, usage, experienceLevel } = customerProfile;
      
      // Build search query based on profile
      let query = '';
      if (bikeType) {
        query += `product_type:${bikeType}`;
      }
      
      // Get products matching criteria
      const response = await this.makeRequest(`/products.json?limit=50${query ? `&product_type=${bikeType}` : ''}`);
      
      if (!response.ok) {
        throw new Error(`Product search error: ${response.status}`);
      }
      
      const data = await response.json();
      const products = data.products || [];
      
      // Filter and score products based on customer profile
      const recommendations = products
        .filter(product => this.matchesCustomerProfile(product, customerProfile))
        .filter(product => this.matchesBudget(product, budgetRange))
        .map(product => this.scoreProduct(product, customerProfile))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10) // Top 10 recommendations
        .map(item => this.formatProductRecommendation(item.product, item.score));
      
      return {
        success: true,
        recommendations: recommendations,
        total_found: recommendations.length,
        criteria: {
          bike_type: bikeType,
          usage: usage,
          experience_level: experienceLevel,
          budget_range: budgetRange
        }
      };
      
    } catch (error) {
      console.error('Product recommendations error:', error);
      return {
        success: false,
        error: error.message,
        recommendations: []
      };
    }
  }

  /**
   * Get customer information from Shopify
   */
  async getCustomerInfo(identifier, identifierType) {
    try {
      let customer = null;
      
      switch (identifierType) {
        case 'email':
          const emailResponse = await this.makeRequest(`/customers/search.json?query=email:${encodeURIComponent(identifier)}`);
          if (emailResponse.ok) {
            const data = await emailResponse.json();
            customer = data.customers?.[0];
          }
          break;
          
        case 'phone':
          const normalizedPhone = this.normalizePhoneNumber(identifier);
          const phoneResponse = await this.makeRequest(`/customers/search.json?query=phone:${encodeURIComponent(normalizedPhone)}`);
          if (phoneResponse.ok) {
            const data = await phoneResponse.json();
            customer = data.customers?.[0];
          }
          break;
          
        default:
          throw new Error(`Invalid identifier type: ${identifierType}`);
      }
      
      if (!customer) {
        return {
          success: true,
          found: false,
          message: 'Customer not found in Shopify'
        };
      }
      
      // Get customer's order history
      const ordersResponse = await this.makeRequest(`/orders.json?customer_id=${customer.id}&status=any&limit=20`);
      let orders = [];
      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        orders = ordersData.orders || [];
      }
      
      const formattedCustomer = {
        id: customer.id,
        email: customer.email,
        phone: customer.phone,
        first_name: customer.first_name,
        last_name: customer.last_name,
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        total_spent: parseFloat(customer.total_spent || 0),
        orders_count: customer.orders_count || 0,
        created_at: customer.created_at,
        last_order_date: orders.length > 0 ? orders[0].created_at : null,
        customer_since: customer.created_at,
        tags: customer.tags ? customer.tags.split(', ') : [],
        addresses: customer.addresses || [],
        recent_orders: orders.slice(0, 5).map(order => this.formatOrderData(order))
      };
      
      return {
        success: true,
        found: true,
        customer: formattedCustomer
      };
      
    } catch (error) {
      console.error('Customer lookup error:', error);
      return {
        success: false,
        found: false,
        error: error.message
      };
    }
  }

  /**
   * Get current promotions and sales
   */
  async getCurrentPromotions() {
    try {
      // Get active discount codes
      const discountsResponse = await this.makeRequest('/discounts.json');
      
      let promotions = [];
      
      if (discountsResponse.ok) {
        const discountsData = await discountsResponse.json();
        
        promotions = discountsData.discounts
          ?.filter(discount => {
            const now = new Date();
            const startDate = discount.starts_at ? new Date(discount.starts_at) : null;
            const endDate = discount.ends_at ? new Date(discount.ends_at) : null;
            
            return (!startDate || now >= startDate) && (!endDate || now <= endDate);
          })
          .map(discount => ({
            code: discount.code,
            description: discount.description || discount.code,
            value: discount.value,
            type: discount.value_type, // 'percentage' or 'fixed_amount'
            minimum_amount: discount.minimum_order_amount,
            usage_limit: discount.usage_limit,
            starts_at: discount.starts_at,
            ends_at: discount.ends_at
          })) || [];
      }
      
      return {
        success: true,
        promotions: promotions,
        active_count: promotions.length
      };
      
    } catch (error) {
      console.error('Promotions lookup error:', error);
      return {
        success: false,
        promotions: [],
        error: error.message
      };
    }
  }

  /**
   * Helper methods
   */
  formatOrderData(order) {
    return {
      id: order.id,
      order_number: order.name || order.order_number,
      status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      total_price: parseFloat(order.total_price || 0),
      currency: order.currency,
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer: {
        name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
        email: order.customer?.email,
        phone: order.customer?.phone
      },
      shipping_address: order.shipping_address ? {
        address1: order.shipping_address.address1,
        city: order.shipping_address.city,
        province: order.shipping_address.province,
        zip: order.shipping_address.zip,
        country: order.shipping_address.country
      } : null,
      line_items: order.line_items?.map(item => ({
        title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        price: parseFloat(item.price || 0),
        sku: item.sku,
        fulfillment_status: item.fulfillment_status
      })) || [],
      tracking_info: this.getTrackingInfo(order)
    };
  }

  getTrackingInfo(order) {
    const fulfillments = order.fulfillments || [];
    if (fulfillments.length === 0) return null;
    
    const latestFulfillment = fulfillments[fulfillments.length - 1];
    
    return {
      tracking_number: latestFulfillment.tracking_number,
      tracking_url: latestFulfillment.tracking_url,
      carrier: latestFulfillment.tracking_company,
      status: latestFulfillment.status,
      updated_at: latestFulfillment.updated_at
    };
  }

  matchesCustomerProfile(product, profile) {
    const { bikeType, usage, experienceLevel } = profile;
    
    // Basic product type matching
    if (bikeType && product.product_type) {
      const productType = product.product_type.toLowerCase();
      const targetType = bikeType.toLowerCase();
      
      if (!productType.includes(targetType) && !targetType.includes(productType)) {
        return false;
      }
    }
    
    // Usage-based filtering
    if (usage) {
      const tags = product.tags ? product.tags.toLowerCase() : '';
      const title = product.title.toLowerCase();
      
      switch (usage.toLowerCase()) {
        case 'commuting':
          if (!tags.includes('commuter') && !title.includes('commuter') && !title.includes('hybrid')) {
            return false;
          }
          break;
        case 'racing':
          if (!tags.includes('race') && !title.includes('race') && !title.includes('road')) {
            return false;
          }
          break;
        case 'mountain':
          if (!tags.includes('mountain') && !title.includes('mountain') && !title.includes('trail')) {
            return false;
          }
          break;
      }
    }
    
    return true;
  }

  matchesBudget(product, budgetRange) {
    if (!budgetRange.min && !budgetRange.max) return true;
    
    const variants = product.variants || [];
    if (variants.length === 0) return true;
    
    // Check if any variant falls within budget
    return variants.some(variant => {
      const price = parseFloat(variant.price || 0);
      const minOk = !budgetRange.min || price >= budgetRange.min;
      const maxOk = !budgetRange.max || price <= budgetRange.max;
      return minOk && maxOk;
    });
  }

  scoreProduct(product, profile) {
    let score = 0;
    
    // Base score
    score += 10;
    
    // Availability boost
    if (product.variants?.some(v => v.inventory_quantity > 0)) {
      score += 20;
    }
    
    // Popular product boost (based on tags)
    if (product.tags?.includes('bestseller') || product.tags?.includes('popular')) {
      score += 15;
    }
    
    // Experience level matching
    if (profile.experienceLevel) {
      const level = profile.experienceLevel.toLowerCase();
      const title = product.title.toLowerCase();
      const tags = product.tags?.toLowerCase() || '';
      
      if (level === 'beginner' && (title.includes('entry') || tags.includes('beginner'))) {
        score += 25;
      } else if (level === 'intermediate' && (title.includes('sport') || tags.includes('intermediate'))) {
        score += 25;
      } else if (level === 'advanced' && (title.includes('pro') || tags.includes('advanced'))) {
        score += 25;
      }
    }
    
    return { product, score };
  }

  formatProductRecommendation(product, score) {
    const minPrice = Math.min(...product.variants.map(v => parseFloat(v.price || 0)));
    const maxPrice = Math.max(...product.variants.map(v => parseFloat(v.price || 0)));
    
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      vendor: product.vendor,
      price_range: minPrice === maxPrice ? `$${minPrice}` : `$${minPrice} - $${maxPrice}`,
      min_price: minPrice,
      max_price: maxPrice,
      available: product.variants.some(v => v.inventory_quantity > 0),
      image: product.images?.[0]?.src,
      description: product.body_html?.replace(/<[^>]*>/g, '').substring(0, 150),
      recommendation_score: score,
      variants_count: product.variants.length
    };
  }

  normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Add country code if needed
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return phone;
  }

  /**
   * Make authenticated request to Shopify API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultHeaders = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };
    
    const requestOptions = {
      headers: { ...defaultHeaders, ...options.headers },
      ...options
    };
    
    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        const response = await fetch(url, requestOptions);
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after') || 1;
          console.log(`Shopify rate limited, waiting ${retryAfter} seconds...`);
          await this.delay(retryAfter * 1000);
          attempt++;
          continue;
        }
        
        return response;
        
      } catch (error) {
        attempt++;
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate Shopify configuration
   */
  async validateConfiguration() {
    try {
      const response = await this.makeRequest('/shop.json');
      
      if (response.ok) {
        const shop = await response.json();
        return {
          valid: true,
          message: 'Shopify configuration valid',
          shop_name: shop.shop.name,
          domain: shop.shop.domain
        };
      }
      
      return {
        valid: false,
        message: 'Invalid Shopify configuration'
      };
      
    } catch (error) {
      return {
        valid: false,
        message: `Shopify configuration error: ${error.message}`
      };
    }
  }
}

export default ShopifyIntegration;