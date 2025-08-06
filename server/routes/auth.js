const express = require('express');
const { AuthMiddleware } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Login endpoint - generates JWT token
 * In production, this would integrate with your actual auth system
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, organizationId } = req.body;
    
    // TODO: Replace with actual authentication logic
    // This is a mock implementation for development
    if (!email || !password || !organizationId) {
      return res.status(400).json({
        error: 'Email, password, and organizationId are required'
      });
    }
    
    // Mock user validation (replace with real auth)
    const mockUser = {
      id: `user_${Date.now()}`,
      email: email,
      organizationId: organizationId,
      role: 'agent',
      permissions: ['dashboard:read', 'conversations:manage', 'analytics:read']
    };
    
    const token = AuthMiddleware.generateToken(mockUser);
    
    logger.info('User logged in', {
      userId: mockUser.id,
      email: mockUser.email,
      organizationId: mockUser.organizationId
    });
    
    res.json({
      success: true,
      token: token,
      user: {
        id: mockUser.id,
        email: mockUser.email,
        organizationId: mockUser.organizationId,
        role: mockUser.role,
        permissions: mockUser.permissions
      },
      expiresIn: process.env.JWT_EXPIRY || '24h'
    });
    
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

/**
 * Token refresh endpoint
 */
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: 'Token is required'
      });
    }
    
    const newToken = AuthMiddleware.refreshToken(token);
    
    res.json({
      success: true,
      token: newToken,
      expiresIn: process.env.JWT_EXPIRY || '24h'
    });
    
  } catch (error) {
    logger.error('Token refresh error', { error: error.message });
    res.status(401).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

/**
 * Validate token endpoint
 */
router.get('/validate', AuthMiddleware.verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    valid: true
  });
});

/**
 * Logout endpoint (client-side token removal)
 */
router.post('/logout', AuthMiddleware.verifyToken, (req, res) => {
  logger.info('User logged out', {
    userId: req.user.id,
    organizationId: req.user.organizationId
  });
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;