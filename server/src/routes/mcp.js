const express = require('express');
const router = express.Router();

// MCP server endpoint - implements JSON-RPC 2.0 for ElevenLabs agents
router.post('/', async (req, res) => {
  try {
    const { jsonrpc, method, id, params } = req.body;
    
    console.log(`🔧 MCP request: ${method}`, params);
    
    // Validate JSON-RPC 2.0 format
    if (jsonrpc !== '2.0') {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }

    let result;
    
    switch (method) {
      case 'tools/list':
        result = await handleToolsList();
        break;
      case 'tools/call':
        result = await handleToolCall(params);
        break;
      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' }
        });
    }
    
    res.json({
      jsonrpc: '2.0',
      id,
      result
    });
    
  } catch (error) {
    console.error('MCP error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: { 
        code: -32603, 
        message: 'Internal error',
        data: error.message 
      }
    });
  }
});

async function handleToolsList() {
  return {
    tools: [
      {
        name: 'search_shop_catalog',
        description: 'Search for products from the BICI bike store.\n\nThis tool helps customers find bikes, accessories, and components. Use natural language queries for best results.\n\nBest practices:\n- Use descriptive search terms like "trek mountain bike", "road bike under 2000", "bike helmet"\n- Include customer context when available\n- Results are limited for better experience\n- For voice calls, keep responses brief and focused',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'A natural language search query for bikes, accessories, or components'
            },
            context: {
              type: 'string', 
              description: 'Additional customer context like experience level, riding type, budget range, etc.'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of products to return. Defaults to 3 for voice calls.',
              default: 3
            }
          },
          required: ['query', 'context']
        }
      },
      {
        name: 'search_shop_policies_and_faqs',
        description: 'Get information about BICI store policies, services, and frequently asked questions.\n\nUse this for questions about:\n- Store hours and location\n- Return and exchange policies\n- Payment methods and financing\n- Shipping and delivery\n- Warranty information\n- General store policies',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'A question about store policies, hours, services, or general information'
            },
            context: {
              type: 'string',
              description: 'Additional context about the customer inquiry'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_product_details',
        description: 'Get detailed information about a specific product by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The product ID from a search result'
            },
            options: {
              type: 'object',
              description: 'Optional variant options like size, color, etc.'
            }
          },
          required: ['product_id']
        }
      },
      {
        name: 'get_cart',
        description: 'Retrieves the current contents of a cart, including item details and checkout URL.',
        inputSchema: {
          type: 'object',
          properties: {
            cart_id: { type: 'string', description: 'ID of an existing cart' }
          },
          required: ['cart_id']
        }
      },
      {
        name: 'update_cart',
        description: 'Perform updates to a cart, including adding/removing/updating line items, buyer information, shipping details, discount codes, gift cards and notes in one consolidated call. Shipping options become available after adding items and delivery address. When creating a new cart, only addItems is required.',
        inputSchema: {
          type: 'object',
          properties: {
            cart_id: { type: 'string', description: 'Identifier for the cart being updated. If not provided, a new cart will be created.' },
            add_items: {
              type: 'array',
              description: 'Items to add to the cart. Required when creating a new cart.',
              items: {
                type: 'object',
                properties: {
                  product_variant_id: { type: 'string', description: 'Shopify product variant ID' },
                  quantity: { type: 'integer', description: 'Quantity to add' }
                },
                required: ['product_variant_id', 'quantity']
              }
            },
            update_items: {
              type: 'array',
              description: 'Existing cart line items to update quantities for. Use quantity 0 to remove an item.',
              items: {
                type: 'object',
                properties: {
                  line_item_id: { type: 'string', description: 'Cart line item ID' },
                  quantity: { type: 'integer', description: 'New quantity (0 to remove)' }
                },
                required: ['line_item_id', 'quantity']
              }
            },
            remove_line_ids: {
              type: 'array',
              description: 'List of line item IDs to remove explicitly.',
              items: { type: 'string' }
            },
            note: { type: 'string', description: 'A note or special instructions for the cart.' }
          }
        }
      }
    ]
  };
}

async function handleToolCall(params) {
  const { name, arguments: args } = params;
  
  switch (name) {
    case 'search_shop_catalog':
      return await searchShopCatalog(args);
    case 'search_shop_policies_and_faqs':
      return await searchShopPolicies(args);
    case 'get_product_details':
      return await getProductDetails(args);
    case 'get_cart':
      return await getCartInfo(args);
    case 'update_cart':
      return await updateCart(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function searchShopCatalog(args) {
  const { query, context, limit = 3 } = args;
  
  console.log(`🔍 Product search: "${query}" (context: ${context})`);
  
  // For now, return helpful fallback responses
  // TODO: Integrate with actual Shopify when credentials are available
  
  const fallbackProducts = [
    {
      product_id: 'gid://shopify/Product/example1',
      title: 'Trek Mountain Bike',
      description: `Great mountain bike perfect for ${context || 'trail riding'}. We have several Trek models in stock.`,
      price: {
        amount: '2499.00',
        currencyCode: 'CAD'
      },
      available: true,
      vendor: 'Trek',
      product_type: 'Mountain Bike',
      tags: ['mountain', 'trek', 'bikes'],
      url: 'https://bici.cc'
    },
    {
      product_id: 'gid://shopify/Product/example2', 
      title: 'Road Bike Selection',
      description: `We carry a wide range of road bikes. For specific models and pricing for "${query}", please call us at 778-719-3080.`,
      price: {
        amount: '1899.00',
        currencyCode: 'CAD'
      },
      available: true,
      vendor: 'Various',
      product_type: 'Road Bike',
      tags: ['road', 'bikes'],
      url: 'https://bici.cc'
    },
    {
      product_id: 'gid://shopify/Product/example3',
      title: 'Bike Accessories',
      description: `We have a full range of bike accessories. Visit our store to see our complete selection.`,
      price: {
        amount: '49.99',
        currencyCode: 'CAD'
      },
      available: true,
      vendor: 'Various',
      product_type: 'Accessories',
      tags: ['accessories'],
      url: 'https://bici.cc'
    }
  ];
  
  // Filter and limit results
  const results = fallbackProducts
    .filter(product => 
      product.title.toLowerCase().includes(query.toLowerCase()) ||
      product.description.toLowerCase().includes(query.toLowerCase()) ||
      product.tags.some(tag => query.toLowerCase().includes(tag))
    )
    .slice(0, limit);
  
  if (results.length === 0) {
    results.push({
      product_id: 'gid://shopify/Product/general',
      title: `Search Results for "${query}"`,
      description: `We likely have what you're looking for! For specific information about "${query}", please call us at 778-719-3080 or visit our store at 1497 Adanac Street, Vancouver.`,
      price: {
        amount: 'Call for pricing',
        currencyCode: 'CAD'
      },
      available: true,
      vendor: 'BICI',
      product_type: 'Various',
      tags: ['general'],
      url: 'https://bici.cc'
    });
  }
  
  return {
    products: results,
    total_count: results.length,
    query,
    context: context || '',
    store_info: {
      name: 'BICI Bike Store',
      phone: '778-719-3080',
      address: '1497 Adanac Street, Vancouver, BC',
      website: 'https://bici.cc'
    }
  };
}

async function searchShopPolicies(args) {
  const { query, context } = args;
  
  console.log(`📋 Policy search: "${query}"`);
  
  const queryLower = query.toLowerCase();
  let policyInfo = '';
  
  if (queryLower.includes('hour') || queryLower.includes('open') || queryLower.includes('close')) {
    policyInfo = `**Store Hours:**
• Monday-Friday: 8:00 AM - 6:00 PM
• Saturday-Sunday: 9:00 AM - 4:30 PM

📍 **Location:** 1497 Adanac Street, Vancouver, BC
📞 **Phone:** 778-719-3080`;
  } else if (queryLower.includes('return') || queryLower.includes('refund') || queryLower.includes('exchange')) {
    policyInfo = `**Return Policy:**
We work with you to ensure satisfaction with your bike purchase. Return policies vary by product type and manufacturer.

For specific return information:
📞 Call us at 778-719-3080
🏪 Visit us at 1497 Adanac Street, Vancouver`;
  } else if (queryLower.includes('shipping') || queryLower.includes('delivery')) {
    policyInfo = `**Shipping & Delivery:**
• Local delivery available in Vancouver area
• Shipping arrangements for bikes and accessories
• Contact us for specific shipping costs and timelines

📞 Call 778-719-3080 for shipping information`;
  } else if (queryLower.includes('payment') || queryLower.includes('financing') || queryLower.includes('pay')) {
    policyInfo = `**Payment Options:**
• Major credit cards accepted
• Affirm financing available
• Shop Pay installments
• RBC PayPlan for bike purchases

💳 Ask about financing options in-store or call 778-719-3080`;
  } else if (queryLower.includes('warranty') || queryLower.includes('guarantee')) {
    policyInfo = `**Warranty Information:**
• Full manufacturer warranty support on all bikes
• Warranty terms vary by brand and product
• We handle all warranty claims and service

🔧 Contact us at 778-719-3080 for specific warranty details`;
  } else if (queryLower.includes('location') || queryLower.includes('address') || queryLower.includes('where')) {
    policyInfo = `**Store Location:**
📍 1497 Adanac Street, Vancouver, BC
📞 778-719-3080
🌐 bici.cc

🚗 Free parking available
🚌 Transit accessible`;
  } else {
    policyInfo = `**BICI Bike Store Information:**

📍 **Location:** 1497 Adanac Street, Vancouver, BC
📞 **Phone:** 778-719-3080
🌐 **Website:** bici.cc

⏰ **Hours:**
• Monday-Friday: 8:00 AM - 6:00 PM  
• Saturday-Sunday: 9:00 AM - 4:30 PM

💳 **Payment:** Credit cards, Affirm, Shop Pay, RBC PayPlan
🚚 **Delivery:** Local delivery and shipping available
🛡️ **Warranty:** Full manufacturer warranty support
↩️ **Returns:** Customer satisfaction guaranteed

For specific questions, call us at 778-719-3080!`;
  }
  
  return {
    query,
    policy_information: policyInfo,
    store_contact: {
      phone: '778-719-3080',
      address: '1497 Adanac Street, Vancouver, BC',
      website: 'https://bici.cc',
      hours: 'Mon-Fri: 8AM-6PM, Sat-Sun: 9AM-4:30PM'
    }
  };
}

async function getProductDetails(args) {
  const { product_id, options } = args;
  
  console.log(`📦 Product details: ${product_id}`);
  
  // Return helpful response for product details
  return {
    product_id,
    message: `For detailed product information, specifications, and current availability, please call us at 778-719-3080 or visit our store at 1497 Adanac Street, Vancouver.`,
    store_contact: {
      phone: '778-719-3080',
      address: '1497 Adanac Street, Vancouver, BC',
      website: 'https://bici.cc'
    },
    options: options || {}
  };
}

// In-memory cart storage (replace with database in production)
const carts = new Map();

function ensureCart(sessionId, { allowCreate = true } = {}) {
  if (!carts.has(sessionId)) {
    if (!allowCreate) throw new Error('Cart not found');
    carts.set(sessionId, {
      id: sessionId,
      items: [],
      currency: 'CAD',
      created: new Date().toISOString()
    });
  }
  return carts.get(sessionId);
}

function computeSubtotal(cart) {
  return cart.items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
}

async function getCartInfo(args) {
  const { cart_id } = args;
  if (!cart_id) throw new Error('cart_id is required');
  const cart = ensureCart(cart_id);
  return {
    cart: {
      id: cart.id,
      currency: cart.currency,
      lines: cart.items.map((item, index) => ({
        id: `line_${index}`,
        merchandise_id: item.variant_id || item.product_id,
        quantity: item.quantity,
        product: {
          id: item.product_id,
          title: item.title,
          handle: item.product_id
        }
      })),
      subtotal: computeSubtotal(cart),
      checkout_url: `https://bici.cc/cart/${cart.id}`
    }
  };
}

async function updateCart(args) {
  const { cart_id, add_items, update_items, remove_line_ids, note } = args;

  // Create new cart if no cart_id provided
  const id = cart_id || `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const cart = ensureCart(id, { allowCreate: true });

  // Add new items
  if (add_items && Array.isArray(add_items)) {
    for (const item of add_items) {
      const { product_variant_id, quantity } = item;

      const existing = cart.items.find(cartItem =>
        (cartItem.variant_id || cartItem.product_id) === product_variant_id
      );

      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.items.push({
          product_id: product_variant_id,
          variant_id: product_variant_id,
          quantity: quantity,
          title: `Product ${product_variant_id}`,
          price: 0 // Will be updated with real price from product search
        });
      }
    }
  }

  // Update existing items
  if (update_items && Array.isArray(update_items)) {
    for (const item of update_items) {
      const { line_item_id, quantity } = item;
      const lineIndex = parseInt(line_item_id.replace('line_', ''));

      if (lineIndex >= 0 && lineIndex < cart.items.length) {
        if (quantity === 0) {
          cart.items.splice(lineIndex, 1);
        } else {
          cart.items[lineIndex].quantity = quantity;
        }
      }
    }
  }

  // Remove specific line items
  if (remove_line_ids && Array.isArray(remove_line_ids)) {
    for (const lineId of remove_line_ids) {
      const lineIndex = parseInt(lineId.replace('line_', ''));
      if (lineIndex >= 0 && lineIndex < cart.items.length) {
        cart.items.splice(lineIndex, 1);
      }
    }
  }

  // Add note if provided
  if (note) {
    cart.note = note;
  }

  return {
    cart: {
      id: cart.id,
      currency: cart.currency,
      lines: cart.items.map((item, index) => ({
        id: `line_${index}`,
        merchandise_id: item.variant_id || item.product_id,
        quantity: item.quantity,
        product: {
          id: item.product_id,
          title: item.title,
          handle: item.product_id
        }
      })),
      subtotal: computeSubtotal(cart),
      checkout_url: `https://bici.cc/cart/${cart.id}`,
      note: cart.note || null
    }
  };
}

module.exports = router;