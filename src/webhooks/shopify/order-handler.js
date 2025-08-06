const { webhookLogger } = require('../../config/logger');
const database = require('../../config/database');

class ShopifyOrderHandler {
  constructor() {
    this.logger = webhookLogger.child({ webhook: 'shopify-orders' });
    this.redis = database.getRedis();
    this.supabase = database.getSupabase();
  }

  /**
   * Handle Shopify order webhook events
   */
  async handleOrderWebhook(req, res) {
    try {
      const topic = req.get('X-Shopify-Topic');
      const shopDomain = req.get('X-Shopify-Shop-Domain');
      const order = req.body;

      this.logger.info('Processing Shopify order webhook', {
        topic,
        shop_domain: shopDomain,
        order_id: order.id,
        order_number: order.order_number
      });

      // Process based on webhook topic
      switch (topic) {
        case 'orders/create':
          await this.handleOrderCreated(order);
          break;
          
        case 'orders/updated':
          await this.handleOrderUpdated(order);
          break;
          
        case 'orders/paid':
          await this.handleOrderPaid(order);
          break;
          
        case 'orders/cancelled':
          await this.handleOrderCancelled(order);
          break;
          
        case 'orders/fulfilled':
          await this.handleOrderFulfilled(order);
          break;
          
        case 'orders/partially_fulfilled':
          await this.handleOrderPartiallyFulfilled(order);
          break;
          
        default:
          this.logger.warn('Unknown Shopify webhook topic', {
            topic,
            order_id: order.id
          });
      }

      // Store webhook event
      await this.storeWebhookEvent({
        source: 'shopify',
        topic,
        shop_domain: shopDomain,
        order_id: order.id,
        order_number: order.order_number,
        data: order,
        processed_at: new Date().toISOString()
      });

      res.status(200).json({
        success: true,
        message: 'Shopify webhook processed successfully'
      });

    } catch (error) {
      this.logger.error('Shopify webhook processing failed', {
        error: error.message,
        topic: req.get('X-Shopify-Topic'),
        order_id: req.body?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  }

  /**
   * Handle new order created
   */
  async handleOrderCreated(order) {
    try {
      this.logger.info('New order created', {
        order_id: order.id,
        order_number: order.order_number,
        customer_email: order.email,
        total_price: order.total_price
      });

      // Extract customer information
      const customerData = {
        shopify_customer_id: order.customer?.id,
        email: order.email,
        phone: order.phone || order.customer?.phone,
        first_name: order.customer?.first_name || order.billing_address?.first_name,
        last_name: order.customer?.last_name || order.billing_address?.last_name,
        order_count: order.customer?.orders_count || 1
      };

      // Create or update lead in CRM
      await this.createOrUpdateLead(customerData, order);

      // Cache order data for quick lookup
      await this.cacheOrderData(order);

      // Send notifications if configured
      await this.sendOrderNotifications(order, 'created');

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_created',
        order_id: order.id,
        order_number: order.order_number,
        customer: customerData,
        total_price: order.total_price,
        items_count: order.line_items.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle order creation', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Handle order updated
   */
  async handleOrderUpdated(order) {
    try {
      this.logger.info('Order updated', {
        order_id: order.id,
        order_number: order.order_number,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status
      });

      // Update cached order data
      await this.cacheOrderData(order);

      // Check if status changes require notifications
      const statusChanged = await this.checkStatusChanges(order);
      if (statusChanged) {
        await this.sendOrderNotifications(order, 'updated');
      }

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_updated',
        order_id: order.id,
        order_number: order.order_number,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle order update', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Handle order paid
   */
  async handleOrderPaid(order) {
    try {
      this.logger.info('Order paid', {
        order_id: order.id,
        order_number: order.order_number,
        total_price: order.total_price
      });

      // Update lead status to paying customer
      await this.updateLeadStatus(order, 'paying_customer');

      // Send payment confirmation
      await this.sendOrderNotifications(order, 'paid');

      // Trigger fulfillment process if auto-fulfillment is enabled
      await this.triggerFulfillmentProcess(order);

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_paid',
        order_id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle order payment', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Handle order cancelled
   */
  async handleOrderCancelled(order) {
    try {
      this.logger.info('Order cancelled', {
        order_id: order.id,
        order_number: order.order_number,
        cancel_reason: order.cancel_reason
      });

      // Send cancellation notification
      await this.sendOrderNotifications(order, 'cancelled');

      // Create support ticket if cancellation reason indicates issue
      if (this.shouldCreateSupportTicket(order.cancel_reason)) {
        await this.createCancellationSupportTicket(order);
      }

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_cancelled',
        order_id: order.id,
        order_number: order.order_number,
        cancel_reason: order.cancel_reason,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle order cancellation', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Handle order fulfilled
   */
  async handleOrderFulfilled(order) {
    try {
      this.logger.info('Order fulfilled', {
        order_id: order.id,
        order_number: order.order_number
      });

      // Get fulfillment details
      const fulfillment = order.fulfillments?.[order.fulfillments.length - 1];
      
      // Send shipping notification
      await this.sendShippingNotification(order, fulfillment);

      // Schedule delivery follow-up
      await this.scheduleDeliveryFollowUp(order, fulfillment);

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_fulfilled',
        order_id: order.id,
        order_number: order.order_number,
        tracking_number: fulfillment?.tracking_number,
        tracking_company: fulfillment?.tracking_company,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle order fulfillment', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Handle partially fulfilled order
   */
  async handleOrderPartiallyFulfilled(order) {
    try {
      this.logger.info('Order partially fulfilled', {
        order_id: order.id,
        order_number: order.order_number,
        fulfillments_count: order.fulfillments?.length || 0
      });

      // Send partial shipment notification
      const latestFulfillment = order.fulfillments?.[order.fulfillments.length - 1];
      await this.sendPartialShipmentNotification(order, latestFulfillment);

      // Broadcast to dashboard
      await this.broadcastOrderUpdate({
        type: 'order_partially_fulfilled',
        order_id: order.id,
        order_number: order.order_number,
        fulfillments_count: order.fulfillments?.length || 0,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle partial fulfillment', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Create or update customer lead
   */
  async createOrUpdateLead(customerData, order) {
    try {
      if (!customerData.email && !customerData.phone) {
        this.logger.warn('No contact information for lead creation', {
          order_id: order.id
        });
        return;
      }

      // Check if lead already exists
      let { data: existingLead } = await this.supabase
        .from('leads')
        .select('*')
        .or(`email.eq.${customerData.email},phone_number_normalized.eq.${customerData.phone}`)
        .single();

      const leadData = {
        customer_name: `${customerData.first_name} ${customerData.last_name}`.trim(),
        phone_number_normalized: customerData.phone,
        email: customerData.email,
        organization_id: process.env.DEFAULT_ORGANIZATION_ID,
        lead_status: order.financial_status === 'paid' ? 'paying_customer' : 'prospect',
        lead_source: 'shopify_order',
        metadata: {
          shopify_customer_id: customerData.shopify_customer_id,
          order_count: customerData.order_count,
          last_order_id: order.id,
          last_order_value: order.total_price
        }
      };

      if (existingLead) {
        // Update existing lead
        await this.supabase
          .from('leads')
          .update({
            ...leadData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingLead.id);
          
        this.logger.info('Lead updated from Shopify order', {
          lead_id: existingLead.id,
          order_id: order.id
        });
      } else {
        // Create new lead
        leadData.id = `shopify_${order.id}_${Date.now()}`;
        leadData.created_at = new Date().toISOString();
        
        await this.supabase
          .from('leads')
          .insert(leadData);
          
        this.logger.info('New lead created from Shopify order', {
          lead_id: leadData.id,
          order_id: order.id
        });
      }

    } catch (error) {
      this.logger.error('Failed to create/update lead', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Cache order data for quick lookup
   */
  async cacheOrderData(order) {
    try {
      const cacheData = {
        id: order.id,
        order_number: order.order_number,
        email: order.email,
        phone: order.phone,
        total_price: order.total_price,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        customer: order.customer,
        line_items: order.line_items?.map(item => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          price: item.price
        })),
        cached_at: new Date().toISOString()
      };

      // Cache by order ID
      await this.redis.setex(
        `shopify_order:${order.id}`,
        86400, // 24 hours
        JSON.stringify(cacheData)
      );

      // Cache by order number for easy lookup
      await this.redis.setex(
        `shopify_order_number:${order.order_number}`,
        86400, // 24 hours
        JSON.stringify(cacheData)
      );

      // If customer has email, cache by email
      if (order.email) {
        await this.redis.setex(
          `shopify_customer_orders:${order.email}`,
          3600, // 1 hour
          JSON.stringify([cacheData]) // In a real implementation, this would be an array of orders
        );
      }

    } catch (error) {
      this.logger.warn('Failed to cache order data', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  /**
   * Check if order status changes require notifications
   */
  async checkStatusChanges(order) {
    try {
      const cached = await this.redis.get(`shopify_order:${order.id}`);
      if (!cached) return true; // First time seeing this order
      
      const cachedOrder = JSON.parse(cached);
      
      return (
        cachedOrder.financial_status !== order.financial_status ||
        cachedOrder.fulfillment_status !== order.fulfillment_status
      );
    } catch (error) {
      return true; // Default to sending notifications on error
    }
  }

  /**
   * Send order notifications (placeholder - would integrate with email/SMS service)
   */
  async sendOrderNotifications(order, type) {
    try {
      this.logger.info('Sending order notification', {
        order_id: order.id,
        type,
        customer_email: order.email
      });

      // This would integrate with your email/SMS service
      // For now, we'll just log the notification
      
      const notificationData = {
        order_id: order.id,
        order_number: order.order_number,
        type,
        customer_email: order.email,
        customer_phone: order.phone,
        sent_at: new Date().toISOString()
      };

      // Store notification record
      await this.supabase
        .from('notifications')
        .insert({
          type: 'order_notification',
          recipient: order.email || order.phone,
          data: notificationData,
          status: 'sent',
          created_at: new Date().toISOString()
        });

    } catch (error) {
      this.logger.error('Failed to send order notification', {
        order_id: order.id,
        type,
        error: error.message
      });
    }
  }

  /**
   * Update lead status based on order
   */
  async updateLeadStatus(order, status) {
    try {
      await this.supabase
        .from('leads')
        .update({ 
          lead_status: status,
          updated_at: new Date().toISOString()
        })
        .or(`email.eq.${order.email},phone_number_normalized.eq.${order.phone}`);
        
    } catch (error) {
      this.logger.warn('Failed to update lead status', {
        order_id: order.id,
        status,
        error: error.message
      });
    }
  }

  /**
   * Utility methods
   */
  shouldCreateSupportTicket(cancelReason) {
    const supportReasons = [
      'customer', 'inventory', 'fraud', 'declined', 'other'
    ];
    return supportReasons.includes(cancelReason);
  }

  async createCancellationSupportTicket(order) {
    try {
      // This would integrate with HubSpot to create a support ticket
      this.logger.info('Creating support ticket for cancellation', {
        order_id: order.id,
        cancel_reason: order.cancel_reason
      });
    } catch (error) {
      this.logger.error('Failed to create cancellation support ticket', {
        order_id: order.id,
        error: error.message
      });
    }
  }

  async sendShippingNotification(order, fulfillment) {
    // Implementation for shipping notifications
    this.logger.info('Sending shipping notification', {
      order_id: order.id,
      tracking_number: fulfillment?.tracking_number
    });
  }

  async sendPartialShipmentNotification(order, fulfillment) {
    // Implementation for partial shipment notifications
    this.logger.info('Sending partial shipment notification', {
      order_id: order.id,
      tracking_number: fulfillment?.tracking_number
    });
  }

  async scheduleDeliveryFollowUp(order, fulfillment) {
    // Schedule follow-up communication after delivery
    this.logger.info('Scheduling delivery follow-up', {
      order_id: order.id
    });
  }

  async triggerFulfillmentProcess(order) {
    // Trigger automated fulfillment if configured
    this.logger.info('Triggering fulfillment process', {
      order_id: order.id
    });
  }

  async broadcastOrderUpdate(data) {
    try {
      await this.redis.lpush(
        'order_updates',
        JSON.stringify(data)
      );
      
      await this.redis.ltrim('order_updates', 0, 99);
    } catch (error) {
      this.logger.warn('Failed to broadcast order update', {
        error: error.message
      });
    }
  }

  async storeWebhookEvent(event) {
    try {
      await this.supabase
        .from('webhook_events')
        .insert({
          source: event.source,
          event_type: event.topic,
          data: event,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      this.logger.warn('Failed to store webhook event', {
        error: error.message
      });
    }
  }
}

module.exports = ShopifyOrderHandler;