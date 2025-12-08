import { supabase, handleSupabaseError } from '../config/supabase.config';
import { normalizePhoneNumber } from '../config/twilio.config';
import { Lead, Organization } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from './redis.service';

export class LeadService {
  async findOrCreateLead(phoneNumber: string, organizationId: string): Promise<Lead> {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    try {
      // Check Redis cache first
      try {
        const cacheKey = `${normalized}:${organizationId}`;
        const cachedLead = await redisService.getCachedLead(cacheKey);
        if (cachedLead) {
          logger.debug(`Lead cache hit for ${phoneNumber}`);
          return cachedLead;
        }
      } catch (redisError) {
        logger.warn('Redis cache error, continuing with database:', redisError);
      }

      // Check if lead exists in database
      const { data: existingLead, error: findError } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', normalized)
        .single();
      
      if (existingLead && !findError) {
        logger.info('Found existing lead:', { id: existingLead.id, phone: phoneNumber });
        
        // Cache the found lead
        try {
          const cacheKey = `${normalized}:${organizationId}`;
          await redisService.cacheLead(cacheKey, existingLead);
        } catch (redisError) {
          logger.warn('Failed to cache lead, continuing:', redisError);
        }
        
        return existingLead;
      }
      
      // Create new lead
      const newLead = {
        id: uuidv4(),
        organization_id: organizationId,
        phone_number: phoneNumber,
        phone_number_normalized: normalized,
        status: 'new',
        sentiment: 'neutral',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const { data: createdLead, error: createError } = await supabase
        .from('leads')
        .insert(newLead)
        .select()
        .single();
      
      if (createError) {
        handleSupabaseError(createError, 'create lead');
      }
      
      logger.info('Created new lead:', { id: createdLead.id, phone: phoneNumber });
      
      // Cache the newly created lead
      try {
        const cacheKey = `${normalized}:${organizationId}`;
        await redisService.cacheLead(cacheKey, createdLead);
      } catch (redisError) {
        logger.warn('Failed to cache new lead, continuing:', redisError);
      }
      
      return createdLead;
    } catch (error) {
      logger.error('Error in findOrCreateLead:', error);
      throw error;
    }
  }
  
  async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead> {
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...updates,
          updated_at: new Date()
        })
        .eq('id', leadId)
        .select()
        .single();
      
      if (error) {
        handleSupabaseError(error, 'update lead');
      }
      
      logger.info('Updated lead:', { id: leadId, updates });
      
      // Invalidate cache for this lead after update
      if (data && data.phone_number_normalized) {
        try {
          const cacheKey = `${data.phone_number_normalized}:${data.organization_id}`;
          await redisService.invalidateLeadCache(cacheKey);
          // Also clear all related cache entries for this lead
          await redisService.clearLeadCache(leadId, data.phone_number_normalized);
          // IMPORTANT: Also invalidate the dashboard leads cache so UI refreshes with updated data
          await redisService.invalidateDashboardCache(data.organization_id);
          logger.debug('Invalidated dashboard cache after lead update');
        } catch (redisError) {
          logger.warn('Failed to invalidate lead cache after update:', redisError);
        }
      }
      
      return data;
    } catch (error) {
      logger.error('Error updating lead:', error);
      throw error;
    }
  }
  
  async getLead(leadId: string): Promise<Lead | null> {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // Not found error
        handleSupabaseError(error, 'get lead');
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting lead:', error);
      throw error;
    }
  }
  
  async findLeadByPhone(phoneNumber: string, organizationId: string): Promise<Lead | null> {
    try {
      const normalized = phoneNumber.replace(/\D/g, '');
      
      // Check cache first
      try {
        const cacheKey = `${normalized}:${organizationId}`;
        const cachedLead = await redisService.getCachedLead(cacheKey);
        if (cachedLead) {
          logger.debug(`Lead cache hit for findLeadByPhone ${phoneNumber}`);
          return cachedLead;
        }
      } catch (redisError) {
        logger.warn('Redis cache error in findLeadByPhone, continuing with database:', redisError);
      }
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_number_normalized', normalized)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'find lead by phone');
      }
      
      // Cache the result if found
      if (data) {
        try {
          const cacheKey = `${normalized}:${organizationId}`;
          await redisService.cacheLead(cacheKey, data);
        } catch (redisError) {
          logger.warn('Failed to cache lead in findLeadByPhone:', redisError);
        }
      }
      
      return data;
    } catch (error) {
      logger.error('Error finding lead by phone:', error);
      return null;
    }
  }

  async getOrganizationByPhone(phoneNumber: string): Promise<Organization | null> {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    try {
      logger.info('Getting organization by phone', { phoneNumber, normalized });
      
      // Check Redis cache first
      try {
        const cachedOrg = await redisService.getCachedOrganization(phoneNumber);
        if (cachedOrg) {
          logger.debug(`Organization cache hit for ${phoneNumber}`);
          return cachedOrg;
        }
      } catch (redisError) {
        logger.warn('Redis organization cache error, continuing with database:', redisError);
      }
      
      // First try exact match
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();
      
      let foundOrg: Organization | null = null;
      
      // Also try normalized phone
      if (error && normalized !== phoneNumber) {
        logger.info('Trying normalized phone number', normalized);
        const { data: normalizedData, error: normalizedError } = await supabase
          .from('organizations')
          .select('*')
          .eq('phone_number', normalized)
          .single();
          
        if (!normalizedError && normalizedData) {
          logger.info('Found organization with normalized phone');
          foundOrg = normalizedData;
        }
      } else if (!error && data) {
        foundOrg = data;
      }
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'get organization by phone');
      }
      
      // If not found by exact or normalized match, return default organization
      if (!foundOrg) {
        const { data: defaultOrg, error: defaultError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', 'b0c1b1c1-0000-0000-0000-000000000001')
          .single();
        
        if (defaultError) {
          handleSupabaseError(defaultError, 'get default organization');
        }
        
        foundOrg = defaultOrg;
      }
      
      // Cache the result (including default org)
      if (foundOrg) {
        try {
          await redisService.cacheOrganization(phoneNumber, foundOrg);
        } catch (redisError) {
          logger.warn('Failed to cache organization, continuing:', redisError);
        }
      }
      
      return foundOrg;
    } catch (error) {
      logger.error('Error getting organization:', error);
      throw error;
    }
  }
  
  async classifyLead(leadId: string, classification: any): Promise<Lead> {
    const updates: Partial<Lead> = {
      status: this.determineStatus(classification) as Lead['status'],
      qualification_data: {
        ready_to_buy: classification.purchaseIntent > 0.7,
        timeline: classification.timeline,
        purchase_intent: classification.purchaseIntent || 0,
        contact_preference: 'phone'
      }
    };
    
    // updateLead() will handle cache invalidation
    return this.updateLead(leadId, updates);
  }
  
  private determineStatus(classification: any): Lead['status'] {
    if (classification.purchaseIntent > 0.8) return 'hot';
    if (classification.appointmentScheduled) return 'qualified';
    if (classification.engaged) return 'contacted';
    return 'new';
  }
  
  /**
   * Invalidate all caches related to a lead and phone number
   */
  async invalidateLeadCaches(leadId: string, phoneNumber: string, organizationId: string): Promise<void> {
    try {
      const normalized = normalizePhoneNumber(phoneNumber);
      const leadCacheKey = `${normalized}:${organizationId}`;
      
      // Clear lead cache
      await redisService.invalidateLeadCache(leadCacheKey);
      
      // Clear all related caches for this lead
      await redisService.clearLeadCache(leadId, normalized);
      
      logger.debug(`Invalidated all caches for lead ${leadId}`);
    } catch (error) {
      logger.warn('Error invalidating lead caches:', error);
    }
  }
  
  /**
   * Invalidate organization cache for a phone number
   */
  async invalidateOrganizationCache(phoneNumber: string): Promise<void> {
    try {
      // Use the original phone format for the org cache key
      await redisService.cacheOrganization(phoneNumber, null);
      logger.debug(`Invalidated organization cache for ${phoneNumber}`);
    } catch (error) {
      logger.warn('Error invalidating organization cache:', error);
    }
  }
  
  /**
   * Get cache status and hit rates (for debugging)
   */
  getCacheStatus(): { enabled: boolean; connected: boolean } {
    return redisService.getStatus();
  }
}