import { supabase, handleSupabaseError } from '../config/supabase.config';
import { normalizePhoneNumber } from '../config/twilio.config';
import { Lead, Organization } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class LeadService {
  async findOrCreateLead(phoneNumber: string, organizationId: string): Promise<Lead> {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    try {
      // Check if lead exists
      const { data: existingLead, error: findError } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_normalized', normalized)
        .single();
      
      if (existingLead && !findError) {
        logger.info('Found existing lead:', { id: existingLead.id, phone: phoneNumber });
        return existingLead;
      }
      
      // Create new lead
      const newLead = {
        id: uuidv4(),
        organization_id: organizationId,
        phone_number: phoneNumber,
        phone_normalized: normalized,
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
  
  async getOrganizationByPhone(phoneNumber: string): Promise<Organization | null> {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    try {
      logger.info('Getting organization by phone', { phoneNumber, normalized });
      
      // First try exact match
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();
      
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
          return normalizedData;
        }
      }
      
      if (error && error.code !== 'PGRST116') {
        handleSupabaseError(error, 'get organization by phone');
      }
      
      // If not found by exact match, return default organization
      if (!data) {
        const { data: defaultOrg, error: defaultError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', 'b0c1b1c1-0000-0000-0000-000000000001')
          .single();
        
        if (defaultError) {
          handleSupabaseError(defaultError, 'get default organization');
        }
        
        return defaultOrg;
      }
      
      return data;
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
    
    return this.updateLead(leadId, updates);
  }
  
  private determineStatus(classification: any): Lead['status'] {
    if (classification.purchaseIntent > 0.8) return 'hot';
    if (classification.appointmentScheduled) return 'qualified';
    if (classification.engaged) return 'contacted';
    return 'new';
  }
}