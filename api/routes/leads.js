/**
 * Leads Management API Routes
 * Handle lead creation, retrieval, updates, and management
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateParams, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Mock database - replace with actual Supabase integration
let leadsDatabase = new Map();

// Helper function to normalize phone numbers
function normalizePhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^\d+]/g, '');
}

// Helper function to generate lead ID
function generateLeadId() {
  return 'lead_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * @route GET /api/leads
 * @desc Get all leads for organization with filtering and sorting
 * @access Private (leads:read)
 */
router.get('/',
  authMiddleware.requirePermission('leads:read'),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req;
    const { 
      search = '',
      status = 'all',
      source = 'all',
      sortBy = 'recent',
      limit = 100,
      offset = 0
    } = req.query;

    try {
      // Filter leads by organization
      let organizationLeads = Array.from(leadsDatabase.values()).filter(
        lead => lead.organizationId === organizationId
      );

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        organizationLeads = organizationLeads.filter(lead =>
          lead.customerName.toLowerCase().includes(searchLower) ||
          lead.phoneNumber.includes(search) ||
          (lead.email && lead.email.toLowerCase().includes(searchLower))
        );
      }

      // Apply status filter
      if (status !== 'all') {
        organizationLeads = organizationLeads.filter(lead => lead.leadStatus === status);
      }

      // Apply source filter
      if (source !== 'all') {
        organizationLeads = organizationLeads.filter(lead => lead.leadSource === source);
      }

      // Apply sorting
      organizationLeads.sort((a, b) => {
        switch (sortBy) {
          case 'score':
            return (b.leadScore || 0) - (a.leadScore || 0);
          case 'name':
            return a.customerName.localeCompare(b.customerName);
          case 'status':
            return a.leadStatus.localeCompare(b.leadStatus);
          case 'recent':
          default:
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        }
      });

      // Apply pagination
      const paginatedLeads = organizationLeads.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      console.log(`📋 Retrieved ${paginatedLeads.length} leads for organization ${organizationId}`);

      res.json({
        success: true,
        data: paginatedLeads,
        pagination: {
          total: organizationLeads.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < organizationLeads.length
        }
      });

    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch leads',
        code: 'LEADS_FETCH_ERROR'
      });
    }
  })
);

/**
 * @route GET /api/leads/:id
 * @desc Get single lead by ID
 * @access Private (leads:read)
 */
router.get('/:id',
  authMiddleware.requirePermission('leads:read'),
  validateParams({ id: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { organizationId } = req;
    const { id } = req.params;

    try {
      const lead = leadsDatabase.get(id);

      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found',
          code: 'LEAD_NOT_FOUND'
        });
      }

      // Check organization access
      if (lead.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this lead',
          code: 'LEAD_ACCESS_DENIED'
        });
      }

      res.json({
        success: true,
        data: lead
      });

    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch lead',
        code: 'LEAD_FETCH_ERROR'
      });
    }
  })
);

/**
 * @route POST /api/leads
 * @desc Create new lead
 * @access Private (leads:write)
 */
router.post('/',
  authMiddleware.requirePermission('leads:write'),
  validateBody('lead'),
  rateLimitConfig.communications,
  asyncHandler(async (req, res) => {
    const { organizationId, id: userId, email: userEmail } = req;
    const leadData = req.body;

    try {
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(leadData.phoneNumber);

      // Check if lead with this phone number already exists
      const existingLead = Array.from(leadsDatabase.values()).find(
        lead => lead.organizationId === organizationId && 
                normalizePhoneNumber(lead.phoneNumber) === normalizedPhone
      );

      if (existingLead) {
        return res.status(409).json({
          success: false,
          error: 'Lead with this phone number already exists',
          code: 'LEAD_ALREADY_EXISTS',
          data: existingLead
        });
      }

      // Create new lead
      const newLead = {
        id: generateLeadId(),
        customerName: leadData.customerName,
        phoneNumber: leadData.phoneNumber,
        email: leadData.email,
        leadStatus: leadData.leadStatus || 'new',
        leadSource: leadData.leadSource || 'manual_entry',
        organizationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conversationCount: 0,
        leadScore: leadData.leadScore || Math.floor(Math.random() * 40) + 30, // Random initial score 30-70
        sentiment: leadData.sentiment || 'neutral',
        bikeInterest: leadData.bikeInterest || {},
        contactPreferences: {
          sms: true,
          email: true,
          call: true,
          preferredTime: 'business_hours',
          language: 'en',
          ...leadData.contactPreferences
        },
        notes: leadData.notes || '',
        createdBy: userEmail
      };

      // Store in database
      leadsDatabase.set(newLead.id, newLead);

      console.log(`👤 Created new lead: ${newLead.customerName} (${newLead.phoneNumber}) for organization ${organizationId}`);

      res.status(201).json({
        success: true,
        message: 'Lead created successfully',
        data: newLead
      });

    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create lead',
        code: 'LEAD_CREATE_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route PUT /api/leads/:id
 * @desc Update existing lead
 * @access Private (leads:write)
 */
router.put('/:id',
  authMiddleware.requirePermission('leads:write'),
  validateParams({ id: require('../middleware/validation').schemas.uuid }),
  validateBody('lead'),
  asyncHandler(async (req, res) => {
    const { organizationId, email: userEmail } = req;
    const { id } = req.params;
    const updateData = req.body;

    try {
      const existingLead = leadsDatabase.get(id);

      if (!existingLead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found',
          code: 'LEAD_NOT_FOUND'
        });
      }

      // Check organization access
      if (existingLead.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this lead',
          code: 'LEAD_ACCESS_DENIED'
        });
      }

      // Update lead
      const updatedLead = {
        ...existingLead,
        ...updateData,
        id, // Preserve ID
        organizationId, // Preserve organization
        createdAt: existingLead.createdAt, // Preserve creation date
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail
      };

      leadsDatabase.set(id, updatedLead);

      console.log(`👤 Updated lead: ${updatedLead.customerName} (${updatedLead.phoneNumber})`);

      res.json({
        success: true,
        message: 'Lead updated successfully',
        data: updatedLead
      });

    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update lead',
        code: 'LEAD_UPDATE_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route DELETE /api/leads/:id
 * @desc Delete lead
 * @access Private (leads:delete or admin)
 */
router.delete('/:id',
  authMiddleware.requireRole(['admin', 'manager']),
  validateParams({ id: require('../middleware/validation').schemas.uuid }),
  asyncHandler(async (req, res) => {
    const { organizationId } = req;
    const { id } = req.params;

    try {
      const existingLead = leadsDatabase.get(id);

      if (!existingLead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found',
          code: 'LEAD_NOT_FOUND'
        });
      }

      // Check organization access
      if (existingLead.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this lead',
          code: 'LEAD_ACCESS_DENIED'
        });
      }

      // Delete lead
      leadsDatabase.delete(id);

      console.log(`🗑️ Deleted lead: ${existingLead.customerName} (${existingLead.phoneNumber})`);

      res.json({
        success: true,
        message: 'Lead deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete lead',
        code: 'LEAD_DELETE_ERROR',
        details: error.message
      });
    }
  })
);

/**
 * @route POST /api/leads/:id/notes
 * @desc Add or update notes for a lead
 * @access Private (leads:write)
 */
router.post('/:id/notes',
  authMiddleware.requirePermission('leads:write'),
  validateParams({ id: require('../middleware/validation').schemas.uuid }),
  validateBody('conversationNotes'),
  asyncHandler(async (req, res) => {
    const { organizationId, email: userEmail } = req;
    const { id } = req.params;
    const { notes } = req.body;

    try {
      const existingLead = leadsDatabase.get(id);

      if (!existingLead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found',
          code: 'LEAD_NOT_FOUND'
        });
      }

      // Check organization access
      if (existingLead.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this lead',
          code: 'LEAD_ACCESS_DENIED'
        });
      }

      // Update notes
      const updatedLead = {
        ...existingLead,
        notes,
        updatedAt: new Date().toISOString(),
        notesUpdatedBy: userEmail
      };

      leadsDatabase.set(id, updatedLead);

      res.json({
        success: true,
        message: 'Lead notes updated successfully',
        data: {
          id,
          notes,
          updatedAt: updatedLead.updatedAt
        }
      });

    } catch (error) {
      console.error('Error updating lead notes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update lead notes',
        code: 'LEAD_NOTES_UPDATE_ERROR'
      });
    }
  })
);

// Start with empty database - no mock data
console.log('🗄️ Leads database initialized (empty - ready for real data)');

module.exports = router;