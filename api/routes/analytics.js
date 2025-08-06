/**
 * Analytics Routes
 * Comprehensive analytics and reporting endpoints
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateQuery, validateBody } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route GET /api/analytics/overview
 * @desc Get analytics overview with key metrics
 * @access Private (analytics:read)
 */
router.get('/overview',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { timeframe, startDate, endDate } = req.query;
    
    // Mock analytics data - in production, query from database/analytics service
    const overview = {
      timeframe,
      organizationId,
      generatedAt: new Date().toISOString(),
      
      // Call metrics
      calls: {
        total: 1247,
        answered: 1189,
        missed: 58,
        answerRate: 95.3,
        avgDuration: 242, // seconds
        totalDuration: 287438, // seconds
        
        // Trends
        trend: {
          total: { value: 12.5, direction: 'up' },
          answered: { value: 8.3, direction: 'up' },
          duration: { value: -3.2, direction: 'down' }
        }
      },
      
      // Lead generation
      leads: {
        total: 892,
        qualified: 645,
        converted: 287,
        qualificationRate: 72.3,
        conversionRate: 32.2,
        
        bySource: [
          { source: 'inbound_call', count: 524, percentage: 58.7 },
          { source: 'callback_request', count: 213, percentage: 23.9 },
          { source: 'outbound_call', count: 155, percentage: 17.4 }
        ],
        
        trend: {
          total: { value: 18.7, direction: 'up' },
          qualified: { value: 15.2, direction: 'up' },
          converted: { value: 22.8, direction: 'up' }
        }
      },
      
      // AI Performance
      aiPerformance: {
        accuracy: 94.2,
        customerSatisfaction: 4.3,
        humanTakeoverRate: 12.8,
        avgResponseTime: 1.8, // seconds
        
        intentsRecognized: 1156,
        intentAccuracy: 91.7,
        
        trend: {
          accuracy: { value: 2.1, direction: 'up' },
          satisfaction: { value: 0.3, direction: 'up' },
          takeoverRate: { value: -1.5, direction: 'down' }
        }
      },
      
      // Customer satisfaction
      satisfaction: {
        avgRating: 4.3,
        totalRatings: 567,
        distribution: {
          5: 312,
          4: 178,
          3: 45,
          2: 21,
          1: 11
        },
        
        nps: 68, // Net Promoter Score
        
        trend: {
          rating: { value: 0.2, direction: 'up' },
          nps: { value: 4, direction: 'up' }
        }
      },
      
      // Revenue impact
      revenue: {
        generated: 145670.00,
        avgOrderValue: 507.82,
        salesCalls: 287,
        salesConversionRate: 68.3,
        
        trend: {
          generated: { value: 23.5, direction: 'up' },
          avgOrderValue: { value: 8.7, direction: 'up' }
        }
      }
    };
    
    res.json({
      success: true,
      data: overview
    });
  })
);

/**
 * @route GET /api/analytics/calls
 * @desc Get detailed call analytics
 * @access Private (analytics:read)
 */
router.get('/calls',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { timeframe, groupBy = 'day', metrics } = req.query;
    
    // Mock call analytics
    const callAnalytics = {
      timeframe,
      groupBy,
      organizationId,
      
      // Time series data
      timeSeries: [
        {
          period: '2024-01-01',
          total: 45,
          answered: 43,
          missed: 2,
          avgDuration: 256,
          humanTakeovers: 6,
          satisfaction: 4.2
        },
        {
          period: '2024-01-02',
          total: 52,
          answered: 48,
          missed: 4,
          avgDuration: 234,
          humanTakeovers: 8,
          satisfaction: 4.1
        }
        // More time series data...
      ],
      
      // Call distribution
      distribution: {
        byHour: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          calls: Math.floor(Math.random() * 20) + 5,
          avgDuration: Math.floor(Math.random() * 100) + 180
        })),
        
        byDayOfWeek: [
          { day: 'Monday', calls: 187, percentage: 15.0 },
          { day: 'Tuesday', calls: 195, percentage: 15.6 },
          { day: 'Wednesday', calls: 203, percentage: 16.3 },
          { day: 'Thursday', calls: 198, percentage: 15.9 },
          { day: 'Friday', calls: 234, percentage: 18.8 },
          { day: 'Saturday', calls: 156, percentage: 12.5 },
          { day: 'Sunday', calls: 74, percentage: 5.9 }
        ],
        
        byCallReason: [
          { reason: 'product_inquiry', count: 487, percentage: 39.1 },
          { reason: 'support_request', count: 312, percentage: 25.0 },
          { reason: 'service_booking', count: 198, percentage: 15.9 },
          { reason: 'order_status', count: 156, percentage: 12.5 },
          { reason: 'other', count: 94, percentage: 7.5 }
        ]
      },
      
      // Performance metrics
      performance: {
        avgCallsPerDay: 41.6,
        peakHour: 14, // 2 PM
        peakDayOfWeek: 'Friday',
        avgWaitTime: 8.4, // seconds
        abandonment: {
          rate: 4.7,
          avgWaitTimeBeforeAbandon: 45.2
        }
      },
      
      // Quality metrics
      quality: {
        avgSentiment: 0.23, // -1 to 1
        sentimentDistribution: {
          positive: 68.2,
          neutral: 24.1,
          negative: 7.7
        },
        
        resolutionRate: 87.3,
        firstCallResolution: 79.6,
        callbackRate: 8.4
      }
    };
    
    res.json({
      success: true,
      data: callAnalytics
    });
  })
);

/**
 * @route GET /api/analytics/ai-performance
 * @desc Get AI performance metrics
 * @access Private (analytics:read)
 */
router.get('/ai-performance',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { timeframe } = req.query;
    
    // Mock AI performance data
    const aiPerformance = {
      timeframe,
      organizationId,
      
      // Overall metrics
      overall: {
        accuracy: 94.2,
        confidence: 89.7,
        responseTime: 1.8,
        customerSatisfaction: 4.3,
        humanTakeoverRate: 12.8
      },
      
      // Intent recognition
      intentRecognition: {
        totalIntents: 1156,
        recognizedIntents: 1060,
        accuracy: 91.7,
        
        byIntent: [
          { intent: 'product_inquiry', accuracy: 95.2, confidence: 92.1, count: 487 },
          { intent: 'support_request', accuracy: 88.4, confidence: 85.7, count: 312 },
          { intent: 'service_booking', accuracy: 93.9, confidence: 91.3, count: 198 },
          { intent: 'order_status', accuracy: 96.8, confidence: 94.5, count: 156 }
        ],
        
        commonFailures: [
          { intent: 'complex_technical', failureRate: 23.4, reason: 'insufficient_training_data' },
          { intent: 'warranty_claim', failureRate: 18.7, reason: 'policy_complexity' }
        ]
      },
      
      // Entity extraction
      entityExtraction: {
        totalEntities: 2341,
        extractedEntities: 2189,
        accuracy: 93.5,
        
        byType: [
          { type: 'product_name', accuracy: 96.2, count: 789 },
          { type: 'price_range', accuracy: 91.8, count: 456 },
          { type: 'customer_info', accuracy: 89.4, count: 623 },
          { type: 'date_time', accuracy: 94.7, count: 321 }
        ]
      },
      
      // Response quality
      responseQuality: {
        relevance: 92.3,
        helpfulness: 89.7,
        coherence: 95.1,
        
        commonIssues: [
          { issue: 'repetitive_responses', frequency: 8.2 },
          { issue: 'incomplete_information', frequency: 6.5 },
          { issue: 'context_loss', frequency: 4.1 }
        ]
      },
      
      // Learning and improvement
      learning: {
        newTrainingExamples: 234,
        modelUpdates: 3,
        accuracyImprovement: 2.1,
        
        feedbackLoops: {
          positive: 567,
          negative: 89,
          corrections: 45
        }
      },
      
      // Trends over time
      trends: [
        {
          date: '2024-01-01',
          accuracy: 92.1,
          confidence: 87.3,
          takeoverRate: 15.2,
          satisfaction: 4.1
        },
        {
          date: '2024-01-02',
          accuracy: 93.5,
          confidence: 88.9,
          takeoverRate: 13.7,
          satisfaction: 4.2
        }
        // More trend data...
      ]
    };
    
    res.json({
      success: true,
      data: aiPerformance
    });
  })
);

/**
 * @route GET /api/analytics/customers
 * @desc Get customer analytics and insights
 * @access Private (analytics:read)
 */
router.get('/customers',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { timeframe } = req.query;
    
    // Mock customer analytics
    const customerAnalytics = {
      timeframe,
      organizationId,
      
      // Customer metrics
      customers: {
        total: 1847,
        new: 287,
        returning: 1560,
        churnRate: 12.3,
        retentionRate: 87.7,
        
        bySegment: [
          { segment: 'high_value', count: 234, percentage: 12.7, avgOrderValue: 850.32 },
          { segment: 'regular', count: 1289, percentage: 69.8, avgOrderValue: 425.67 },
          { segment: 'occasional', count: 324, percentage: 17.5, avgOrderValue: 156.90 }
        ]
      },
      
      // Behavior patterns
      behavior: {
        avgCallsPerCustomer: 2.3,
        avgConversationDuration: 242,
        preferredContactTimes: [
          { hour: 9, percentage: 12.4 },
          { hour: 14, percentage: 18.7 },
          { hour: 17, percentage: 15.3 }
        ],
        
        commonJourneys: [
          { journey: 'inquiry_to_purchase', percentage: 34.2 },
          { journey: 'support_to_satisfaction', percentage: 28.9 },
          { journey: 'service_to_upsell', percentage: 15.7 }
        ]
      },
      
      // Satisfaction metrics
      satisfaction: {
        avgRating: 4.3,
        nps: 68,
        
        byInteractionType: [
          { type: 'sales_inquiry', satisfaction: 4.4, nps: 72 },
          { type: 'support_request', satisfaction: 4.1, nps: 58 },
          { type: 'service_booking', satisfaction: 4.5, nps: 78 }
        ],
        
        feedback: {
          positive: ['helpful', 'quick', 'knowledgeable', 'friendly'],
          negative: ['slow', 'confusing', 'unhelpful', 'robotic']
        }
      },
      
      // Geographic distribution
      geography: [
        { region: 'Toronto', customers: 567, percentage: 30.7 },
        { region: 'Montreal', customers: 389, percentage: 21.1 },
        { region: 'Vancouver', customers: 298, percentage: 16.1 },
        { region: 'Other', customers: 593, percentage: 32.1 }
      ],
      
      // Customer lifetime value
      clv: {
        avgLifetimeValue: 1247.83,
        avgLifetimeDuration: 18.3, // months
        
        byAcquisitionChannel: [
          { channel: 'phone_call', clv: 1456.23, customers: 892 },
          { channel: 'web_chat', clv: 987.45, customers: 567 },
          { channel: 'email', clv: 734.56, customers: 388 }
        ]
      }
    };
    
    res.json({
      success: true,
      data: customerAnalytics
    });
  })
);

/**
 * @route GET /api/analytics/revenue
 * @desc Get revenue and sales analytics
 * @access Private (analytics:read)
 */
router.get('/revenue',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.user;
    const { timeframe, groupBy = 'day' } = req.query;
    
    // Mock revenue analytics
    const revenueAnalytics = {
      timeframe,
      groupBy,
      organizationId,
      
      // Revenue metrics
      revenue: {
        total: 145670.00,
        growth: 23.5,
        avgOrderValue: 507.82,
        orders: 287,
        
        bySource: [
          { source: 'phone_sales', revenue: 89456.78, percentage: 61.4 },
          { source: 'service_bookings', revenue: 34567.89, percentage: 23.7 },
          { source: 'accessories', revenue: 21645.33, percentage: 14.9 }
        ]
      },
      
      // Sales funnel
      funnel: {
        leads: 892,
        qualified: 645,
        proposals: 423,
        closed: 287,
        
        conversionRates: {
          leadToQualified: 72.3,
          qualifiedToProposal: 65.6,
          proposalToClosed: 67.8,
          overall: 32.2
        }
      },
      
      // Product performance
      products: [
        {
          category: 'mountain_bikes',
          revenue: 67890.45,
          units: 89,
          avgPrice: 762.70,
          growth: 18.7
        },
        {
          category: 'road_bikes',
          revenue: 45678.90,
          units: 67,
          avgPrice: 681.63,
          growth: 12.3
        },
        {
          category: 'electric_bikes',
          revenue: 32101.23,
          units: 23,
          avgPrice: 1395.71,
          growth: 45.6
        }
      ],
      
      // Time series
      timeSeries: [
        {
          period: '2024-01-01',
          revenue: 4567.89,
          orders: 12,
          avgOrderValue: 380.66
        },
        {
          period: '2024-01-02',
          revenue: 5234.56,
          orders: 15,
          avgOrderValue: 348.97
        }
        // More time series data...
      ],
      
      // ROI metrics
      roi: {
        callCenterInvestment: 25000.00,
        revenueGenerated: 145670.00,
        roi: 482.68, // percentage
        costPerLead: 28.03,
        costPerConversion: 87.11
      }
    };
    
    res.json({
      success: true,
      data: revenueAnalytics
    });
  })
);

/**
 * @route GET /api/analytics/reports/:reportType
 * @desc Generate specific analytics reports
 * @access Private (analytics:read)
 */
router.get('/reports/:reportType',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('analyticsQuery'),
  rateLimitConfig.heavyOperations,
  asyncHandler(async (req, res) => {
    const { reportType } = req.params;
    const { organizationId } = req.user;
    const { timeframe, format = 'json' } = req.query;
    
    const validReports = [
      'daily_summary',
      'weekly_digest',
      'monthly_overview',
      'performance_review',
      'customer_insights',
      'revenue_analysis'
    ];
    
    if (!validReports.includes(reportType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report type',
        validTypes: validReports
      });
    }
    
    // Mock report generation
    const reportId = `report_${Date.now()}`;
    
    res.json({
      success: true,
      message: 'Report generation initiated',
      data: {
        reportId,
        reportType,
        format,
        organizationId,
        status: 'generating',
        estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
        downloadUrl: `/api/analytics/reports/${reportId}/download`
      }
    });
  })
);

/**
 * @route GET /api/analytics/exports
 * @desc Get list of available data exports
 * @access Private (analytics:read)
 */
router.get('/exports',
  authMiddleware.requirePermission('analytics:read'),
  validateQuery('pagination'),
  asyncHandler(async (req, res) => {
    const { organizationId, id: userId } = req.user;
    const { page, limit } = req.query;
    
    // Mock exports list
    const exports = [
      {
        id: 'export_1',
        type: 'conversation_data',
        format: 'csv',
        status: 'completed',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        completedAt: new Date(Date.now() - 3500000).toISOString(),
        fileSize: 2456789,
        downloadUrl: '/api/analytics/exports/export_1/download',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      },
      {
        id: 'export_2',
        type: 'revenue_report',
        format: 'pdf',
        status: 'processing',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        progress: 75,
        estimatedCompletion: new Date(Date.now() + 300000).toISOString()
      }
    ];
    
    const startIndex = (page - 1) * limit;
    const paginatedExports = exports.slice(startIndex, startIndex + limit);
    
    res.json({
      success: true,
      data: {
        exports: paginatedExports,
        summary: {
          total: exports.length,
          completed: exports.filter(e => e.status === 'completed').length,
          processing: exports.filter(e => e.status === 'processing').length,
          failed: exports.filter(e => e.status === 'failed').length
        }
      },
      pagination: {
        page,
        limit,
        total: exports.length,
        pages: Math.ceil(exports.length / limit)
      }
    });
  })
);

/**
 * @route POST /api/analytics/exports
 * @desc Create new data export
 * @access Private (analytics:read)
 */
router.post('/exports',
  authMiddleware.requirePermission('analytics:read'),
  rateLimitConfig.heavyOperations,
  asyncHandler(async (req, res) => {
    const { organizationId, id: userId } = req.user;
    const { dataType, format, dateRange, filters } = req.body;
    
    const exportId = `export_${Date.now()}`;
    
    res.json({
      success: true,
      message: 'Export initiated',
      data: {
        exportId,
        dataType,
        format,
        status: 'queued',
        requestedBy: userId,
        estimatedCompletion: new Date(Date.now() + 300000).toISOString()
      }
    });
  })
);

module.exports = router;