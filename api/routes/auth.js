/**
 * Authentication Routes
 * JWT-based authentication endpoints
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validation');
const rateLimitConfig = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc User login
 * @access Public
 */
router.post('/login',
  rateLimitConfig.auth,
  validateBody('login'),
  asyncHandler(async (req, res) => {
    console.log(`🚀 [AUTH ROUTE] Login request received`);
    console.log(`📨 [AUTH ROUTE] Request body:`, JSON.stringify(req.body));
    console.log(`🌐 [AUTH ROUTE] Request headers:`, JSON.stringify(req.headers));
    
    const { email, password, organizationId } = req.body;
    
    console.log(`🔑 [AUTH ROUTE] Extracted credentials:`, { 
      email, 
      hasPassword: !!password,
      organizationId 
    });
    
    try {
      console.log(`📞 [AUTH ROUTE] Calling authMiddleware.authenticateUser`);
      const authResult = await authMiddleware.authenticateUser(email, password, organizationId);
      
      console.log(`✅ [AUTH ROUTE] Authentication successful:`, {
        userId: authResult.user.id,
        userEmail: authResult.user.email,
        userRole: authResult.user.role,
        hasAccessToken: !!authResult.accessToken,
        hasRefreshToken: !!authResult.refreshToken
      });
      
      const response = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: authResult.user.id,
            email: authResult.user.email,
            role: authResult.user.role,
            organizationId: authResult.user.organizationId,
            permissions: authResult.user.permissions
          },
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          tokenType: 'Bearer',
          expiresIn: process.env.JWT_EXPIRY || '24h'
        }
      };
      
      console.log(`📤 [AUTH ROUTE] Sending success response`);
      res.json(response);
      
    } catch (error) {
      console.error(`❌ [AUTH ROUTE] Authentication failed:`, {
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      const errorResponse = {
        success: false,
        error: 'Authentication failed',
        message: error.message,
        code: 'AUTH_FAILED'
      };
      
      console.log(`📤 [AUTH ROUTE] Sending error response:`, errorResponse);
      res.status(401).json(errorResponse);
    }
  })
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh',
  rateLimitConfig.auth,
  validateBody('refreshToken'),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    try {
      const newAccessToken = await authMiddleware.refreshToken(refreshToken);
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          tokenType: 'Bearer',
          expiresIn: process.env.JWT_EXPIRY || '24h'
        }
      });
      
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        message: error.message,
        code: 'REFRESH_FAILED'
      });
    }
  })
);

/**
 * @route GET /api/auth/verify
 * @desc Verify token validity
 * @access Private
 */
router.get('/verify',
  authMiddleware.verifyToken,
  (req, res) => {
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
          organizationId: req.user.organizationId,
          permissions: req.user.permissions
        },
        tokenValid: true
      }
    });
  }
);

/**
 * @route POST /api/auth/logout
 * @desc User logout (client-side token removal)
 * @access Private
 */
router.post('/logout',
  authMiddleware.verifyToken,
  (req, res) => {
    // In a more advanced implementation, you might:
    // - Add token to blacklist
    // - Update user's last logout time
    // - Log logout event for security
    
    res.json({
      success: true,
      message: 'Logged out successfully',
      data: {
        loggedOut: true,
        timestamp: new Date().toISOString()
      }
    });
  }
);

/**
 * @route GET /api/auth/permissions
 * @desc Get user permissions
 * @access Private
 */
router.get('/permissions',
  authMiddleware.verifyToken,
  (req, res) => {
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        role: req.user.role,
        permissions: req.user.permissions,
        organizationId: req.user.organizationId
      }
    });
  }
);

/**
 * @route GET /api/auth/profile
 * @desc Get user profile
 * @access Private
 */
router.get('/profile',
  authMiddleware.verifyToken,
  asyncHandler(async (req, res) => {
    // In production, fetch from database
    const userProfile = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      organizationId: req.user.organizationId,
      permissions: req.user.permissions,
      lastLogin: new Date().toISOString(),
      settings: {
        theme: 'light',
        language: 'en',
        notifications: {
          email: true,
          sms: false,
          push: true
        }
      }
    };
    
    res.json({
      success: true,
      data: userProfile
    });
  })
);

/**
 * @route PATCH /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.patch('/profile',
  authMiddleware.verifyToken,
  // Add validation for profile update
  asyncHandler(async (req, res) => {
    const allowedFields = ['firstName', 'lastName', 'settings'];
    const updates = {};
    
    // Filter allowed fields
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    // In production, update in database
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        userId: req.user.id,
        updatedFields: Object.keys(updates),
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password',
  authMiddleware.verifyToken,
  rateLimitConfig.auth,
  // Add password validation
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'All password fields are required',
        code: 'MISSING_PASSWORD_FIELDS'
      });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New passwords do not match',
        code: 'PASSWORD_MISMATCH'
      });
    }
    
    // In production, verify current password and update
    res.json({
      success: true,
      message: 'Password changed successfully',
      data: {
        userId: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/auth/forgot-password
 * @desc Request password reset
 * @access Public
 */
router.post('/forgot-password',
  rateLimitConfig.auth,
  validateBody('email'),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    // In production, generate reset token and send email
    res.json({
      success: true,
      message: 'Password reset instructions sent to email',
      data: {
        email: email,
        resetRequestId: `reset_${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post('/reset-password',
  rateLimitConfig.auth,
  asyncHandler(async (req, res) => {
    const { resetToken, newPassword, confirmPassword } = req.body;
    
    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Reset token and password fields are required',
        code: 'MISSING_RESET_FIELDS'
      });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match',
        code: 'PASSWORD_MISMATCH'
      });
    }
    
    // In production, verify reset token and update password
    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        resetToken: resetToken,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route GET /api/auth/sessions
 * @desc Get active user sessions
 * @access Private
 */
router.get('/sessions',
  authMiddleware.verifyToken,
  asyncHandler(async (req, res) => {
    // In production, fetch from session store
    const mockSessions = [
      {
        id: 'session_current',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        lastActive: new Date().toISOString(),
        current: true,
        location: 'Unknown'
      }
    ];
    
    res.json({
      success: true,
      data: {
        sessions: mockSessions,
        totalSessions: mockSessions.length
      }
    });
  })
);

/**
 * @route DELETE /api/auth/sessions/:sessionId
 * @desc Revoke a specific session
 * @access Private
 */
router.delete('/sessions/:sessionId',
  authMiddleware.verifyToken,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    // In production, revoke session
    res.json({
      success: true,
      message: 'Session revoked successfully',
      data: {
        sessionId: sessionId,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route DELETE /api/auth/sessions
 * @desc Revoke all other sessions
 * @access Private
 */
router.delete('/sessions',
  authMiddleware.verifyToken,
  asyncHandler(async (req, res) => {
    // In production, revoke all other sessions
    res.json({
      success: true,
      message: 'All other sessions revoked successfully',
      data: {
        userId: req.user.id,
        revokedSessions: 0, // Count of revoked sessions
        timestamp: new Date().toISOString()
      }
    });
  })
);

module.exports = router;