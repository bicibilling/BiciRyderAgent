/**
 * BICI AI Voice System - Customer Service
 * Customer identification, context lookup, and lead management
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config');
const { normalizePhoneNumber } = require('../utils/phone');
const { ConversationStateManager } = require('./conversation-state');

class CustomerService {
  constructor(organizationId = 'bici-main') {
    this.organizationId = organizationId;
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceRoleKey
    );
    this.stateManager = new ConversationStateManager();
  }

  /**
   * Multi-source customer identification (SOW requirement)
   * Searches Supabase, HubSpot, and Shopify for customer data
   */
  async identifyCustomer(phoneNumber, organizationId = this.organizationId) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      console.log(`🔍 Identifying customer: ${normalizedPhone}`);

      // Check cache first for recent lookups
      const cachedCustomer = await this.stateManager.getCachedCustomerContext(
        normalizedPhone, 
        organizationId
      );
      
      if (cachedCustomer && this.isCacheValid(cachedCustomer.cached_at)) {
        console.log(`💾 Using cached customer data for ${normalizedPhone}`);
        return cachedCustomer;
      }

      // Primary: Supabase leads table
      let customer = await this.searchSupabaseCustomer(normalizedPhone, organizationId);
      
      if (!customer) {
        // Secondary: HubSpot CRM lookup (if configured)
        if (config.integrations.hubspot.accessToken) {
          customer = await this.searchHubSpotCustomer(normalizedPhone, organizationId);
        }
      }

      if (!customer) {
        // Tertiary: Shopify customer lookup (if configured)
        if (config.integrations.shopify.accessToken) {
          customer = await this.searchShopifyCustomer(normalizedPhone, organizationId);
        }
      }

      // Cache the result for future lookups
      if (customer) {
        await this.stateManager.cacheCustomerContext(normalizedPhone, organizationId, customer);
      }

      console.log(`${customer ? '✅' : '❌'} Customer identification ${customer ? 'found' : 'not found'}: ${normalizedPhone}`);
      return customer;

    } catch (error) {
      console.error('❌ Customer identification error:', error);
      return null;
    }
  }

  /**
   * Search customer in Supabase leads table
   */
  async searchSupabaseCustomer(phoneNumber, organizationId) {
    try {
      const { data, error } = await this.supabase
        .from('leads')
        .select(`
          *,
          conversations!inner(
            call_classification,
            call_duration,
            timestamp,
            content
          )
        `)
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      if (data) {
        // Build comprehensive customer context
        return {
          id: data.id,
          customer_name: data.customer_name,
          phone_number: data.phone_number_normalized,
          email: data.email,
          lead_status: data.lead_status,
          lead_source: data.lead_source,
          lead_quality_score: data.lead_quality_score,
          
          // Bike interest data
          bike_interest: data.bike_interest || {},
          purchase_history: data.purchase_history || [],
          customer_tier: data.customer_tier || 'Regular',
          
          // Communication preferences
          contact_preferences: data.contact_preferences || {},
          preferred_language: data.contact_preferences?.language || 'en',
          
          // Conversation history
          interaction_count: data.interaction_count || 0,
          last_contact_date: data.last_contact_date,
          previous_summary: data.previous_summary,
          
          // Recent conversations for context
          recent_conversations: data.conversations?.slice(0, 3) || [],
          
          // Metadata
          created_at: data.created_at,
          updated_at: data.updated_at,
          source: 'supabase'
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Supabase customer search error:', error);
      return null;
    }
  }

  /**
   * Search customer in HubSpot CRM
   */
  async searchHubSpotCustomer(phoneNumber, organizationId) {
    try {
      const searchQuery = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'phone',
                operator: 'EQ',
                value: phoneNumber
              }
            ]
          }
        ],
        properties: [
          'email', 'phone', 'firstname', 'lastname', 'company',
          'lifecycle_stage', 'lead_status', 'last_activity_date',
          'bike_interest', 'budget_range', 'preferred_language'
        ]
      };

      const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.integrations.hubspot.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchQuery)
      });

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const contact = data.results[0];
        
        // Create lead in Supabase for future quick access
        const leadData = await this.createLeadFromHubSpot(contact, organizationId);
        
        return {
          id: leadData.id,
          customer_name: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim(),
          phone_number: phoneNumber,
          email: contact.properties.email,
          lead_status: contact.properties.lead_status || 'imported',
          lead_source: 'hubspot_import',
          
          // HubSpot specific data
          hubspot_contact_id: contact.id,
          company: contact.properties.company,
          lifecycle_stage: contact.properties.lifecycle_stage,
          last_activity_date: contact.properties.last_activity_date,
          
          // Preferences
          preferred_language: contact.properties.preferred_language || 'en',
          bike_interest: this.parseHubSpotBikeInterest(contact.properties.bike_interest),
          
          source: 'hubspot'
        };
      }

      return null;
    } catch (error) {
      console.error('❌ HubSpot customer search error:', error);
      return null;
    }
  }

  /**
   * Search customer in Shopify
   */
  async searchShopifyCustomer(phoneNumber, organizationId) {
    try {
      const response = await fetch(
        `https://${config.integrations.shopify.shopDomain}/admin/api/2023-10/customers/search.json?query=phone:${encodeURIComponent(phoneNumber)}`,
        {
          headers: {
            'X-Shopify-Access-Token': config.integrations.shopify.accessToken
          }
        }
      );

      const data = await response.json();

      if (data.customers && data.customers.length > 0) {
        const customer = data.customers[0];
        
        // Get order history
        const ordersResponse = await fetch(
          `https://${config.integrations.shopify.shopDomain}/admin/api/2023-10/customers/${customer.id}/orders.json`,
          {
            headers: {
              'X-Shopify-Access-Token': config.integrations.shopify.accessToken
            }
          }
        );
        
        const ordersData = await ordersResponse.json();
        
        // Create lead in Supabase for future quick access
        const leadData = await this.createLeadFromShopify(customer, ordersData.orders, organizationId);
        
        return {
          id: leadData.id,
          customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          phone_number: phoneNumber,
          email: customer.email,
          lead_status: 'existing_customer',
          lead_source: 'shopify_import',
          customer_tier: this.determineCustomerTier(ordersData.orders),
          
          // Shopify specific data
          shopify_customer_id: customer.id,
          purchase_history: this.formatShopifyOrders(ordersData.orders),
          total_spent: customer.total_spent,
          orders_count: customer.orders_count,
          
          // Address information
          default_address: customer.default_address,
          
          source: 'shopify'
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Shopify customer search error:', error);
      return null;
    }
  }

  /**
   * Create new lead from phone number
   */
  async createLeadFromPhone(phoneNumber, additionalData = {}) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      // Generate unique lead ID
      const leadId = await this.generateLeadId(additionalData.organization_id || this.organizationId, normalizedPhone);
      
      const leadData = {
        id: leadId,
        organization_id: additionalData.organization_id || this.organizationId,
        phone_number_normalized: normalizedPhone,
        lead_status: 'new',
        lead_source: additionalData.lead_source || 'inbound_call',
        lead_quality_score: 50, // Default medium score
        interaction_count: 1,
        last_contact_date: new Date().toISOString(),
        
        // Call context if provided
        ...(additionalData.call_sid && { 
          metadata: { initial_call_sid: additionalData.call_sid }
        }),
        ...(additionalData.conversation_id && {
          metadata: { 
            ...additionalData.metadata,
            initial_conversation_id: additionalData.conversation_id 
          }
        })
      };

      const { data, error } = await this.supabase
        .from('leads')
        .insert(leadData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ Created new lead: ${leadId} for ${normalizedPhone}`);
      return data;

    } catch (error) {
      console.error('❌ Failed to create lead from phone:', error);
      return null;
    }
  }

  /**
   * Create lead from HubSpot contact
   */
  async createLeadFromHubSpot(hubspotContact, organizationId) {
    const phoneNumber = normalizePhoneNumber(hubspotContact.properties.phone);
    const leadId = await this.generateLeadId(organizationId, phoneNumber);

    const leadData = {
      id: leadId,
      organization_id: organizationId,
      customer_name: `${hubspotContact.properties.firstname || ''} ${hubspotContact.properties.lastname || ''}`.trim(),
      phone_number_normalized: phoneNumber,
      email: hubspotContact.properties.email,
      lead_status: 'imported',
      lead_source: 'hubspot_import',
      lead_quality_score: 70, // Existing CRM contact gets higher score
      
      // HubSpot data mapping
      bike_interest: this.parseHubSpotBikeInterest(hubspotContact.properties.bike_interest),
      contact_preferences: {
        language: hubspotContact.properties.preferred_language || 'en'
      },
      
      // Metadata
      metadata: {
        hubspot_contact_id: hubspotContact.id,
        imported_from: 'hubspot',
        import_date: new Date().toISOString()
      }
    };

    const { data, error } = await this.supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create lead from HubSpot:', error);
      return null;
    }

    return data;
  }

  /**
   * Create lead from Shopify customer
   */
  async createLeadFromShopify(shopifyCustomer, orders, organizationId) {
    const phoneNumber = normalizePhoneNumber(shopifyCustomer.phone);
    const leadId = await this.generateLeadId(organizationId, phoneNumber);

    const leadData = {
      id: leadId,
      organization_id: organizationId,
      customer_name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim(),
      phone_number_normalized: phoneNumber,
      email: shopifyCustomer.email,
      lead_status: 'existing_customer',
      lead_source: 'shopify_import',
      lead_quality_score: 85, // Existing customer gets high score
      customer_tier: this.determineCustomerTier(orders),
      
      // Purchase history
      purchase_history: this.formatShopifyOrders(orders),
      
      // Contact preferences
      contact_preferences: {
        email: !!shopifyCustomer.email,
        sms: !!shopifyCustomer.phone,
        language: 'en' // Default, could be enhanced with customer tags
      },
      
      // Metadata
      metadata: {
        shopify_customer_id: shopifyCustomer.id,
        total_spent: shopifyCustomer.total_spent,
        orders_count: shopifyCustomer.orders_count,
        imported_from: 'shopify',
        import_date: new Date().toISOString()
      }
    };

    const { data, error } = await this.supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create lead from Shopify:', error);
      return null;
    }

    return data;
  }

  /**
   * Update lead interaction data
   */
  async updateLeadInteraction(leadId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from('leads')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ Updated lead interaction: ${leadId}`);
      return data;

    } catch (error) {
      console.error('❌ Failed to update lead interaction:', error);
      return null;
    }
  }

  /**
   * Update lead after call completion
   */
  async updateLeadCallCompletion(leadId, callData) {
    try {
      // Get current lead data to update interaction count
      const { data: currentLead } = await this.supabase
        .from('leads')
        .select('interaction_count, lead_quality_score')
        .eq('id', leadId)
        .single();

      const qualityScoreAdjustment = this.calculateQualityScoreAdjustment(callData);
      
      const updateData = {
        interaction_count: (currentLead?.interaction_count || 0) + 1,
        last_contact_date: callData.call_completed_at,
        lead_quality_score: Math.min(100, (currentLead?.lead_quality_score || 50) + qualityScoreAdjustment),
        
        // Update previous summary if call duration was significant
        ...(callData.call_duration > 30 && callData.conversation_summary && {
          previous_summary: callData.conversation_summary
        }),
        
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ Updated lead call completion: ${leadId}`);
      return data;

    } catch (error) {
      console.error('❌ Failed to update lead call completion:', error);
      return null;
    }
  }

  /**
   * Utility Methods
   */

  async generateLeadId(organizationId, phoneNumber) {
    // Format: org_phone_timestamp
    const orgPrefix = organizationId.replace(/-/g, '').substring(0, 8);
    const phoneDigits = phoneNumber.replace(/\D/g, '').slice(-10); // Last 10 digits
    const timestamp = Date.now();
    
    return `${orgPrefix}_${phoneDigits}_${timestamp}`;
  }

  isCacheValid(cachedAt, maxAgeMinutes = 30) {
    const cacheTime = new Date(cachedAt);
    const now = new Date();
    const ageMinutes = (now - cacheTime) / (1000 * 60);
    
    return ageMinutes < maxAgeMinutes;
  }

  parseHubSpotBikeInterest(bikeInterestString) {
    try {
      return bikeInterestString ? JSON.parse(bikeInterestString) : {};
    } catch {
      return { notes: bikeInterestString };
    }
  }

  determineCustomerTier(orders) {
    if (!orders || orders.length === 0) return 'New';
    
    const totalSpent = orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);
    const orderCount = orders.length;

    if (totalSpent > 2000 || orderCount > 5) return 'VIP';
    if (totalSpent > 500 || orderCount > 2) return 'Premium';
    return 'Regular';
  }

  formatShopifyOrders(orders) {
    return orders.slice(0, 5).map(order => ({
      order_id: order.id,
      order_number: order.order_number,
      total_price: order.total_price,
      currency: order.currency,
      created_at: order.created_at,
      line_items: order.line_items?.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price
      })) || []
    }));
  }

  calculateQualityScoreAdjustment(callData) {
    let adjustment = 0;
    
    // Longer calls typically indicate more engagement
    if (callData.call_duration > 120) adjustment += 10;
    else if (callData.call_duration > 60) adjustment += 5;
    
    // Successful outcomes increase score
    if (callData.result === 'appointment_booked') adjustment += 15;
    else if (callData.result === 'information_provided') adjustment += 5;
    
    // Failed calls decrease score
    if (callData.call_status === 'failed') adjustment -= 5;
    
    return adjustment;
  }
}

module.exports = { CustomerService };