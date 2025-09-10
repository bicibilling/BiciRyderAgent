const express = require('express');
const router = express.Router();

// Order lookup endpoint
router.post('/lookup', async (req, res) => {
  try {
    const { orderNumber, email, phone } = req.body;
    
    console.log('📦 Order lookup request:', { orderNumber, email, phone: !!phone });

    // For now, provide a helpful response that guides customers
    // In the future, this could integrate with Shopify Orders API
    
    let response = '';
    
    if (orderNumber) {
      response = `I can help you with order #${orderNumber}! `;
    } else {
      response = 'I can help you check your order status! ';
    }
    
    response += `For the most up-to-date order information, I'll transfer you to our team who can access our order system directly. They can check your order status, tracking information, and expected delivery dates.

**Need your order details?**
- Order confirmation email
- Tracking information  
- Delivery updates
- Order modifications

Let me connect you with someone who can help right away!`;

    res.json({
      success: true,
      data: {
        message: response,
        action: 'transfer_to_human',
        order_number: orderNumber || null,
        next_steps: [
          'Transfer to customer service',
          'Provide order number if available',
          'Customer service will check order status',
          'Get tracking and delivery information'
        ]
      }
    });

  } catch (error) {
    console.error('Order lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Order lookup failed',
      message: error.message
    });
  }
});

module.exports = router;