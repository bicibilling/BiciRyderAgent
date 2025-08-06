/**
 * Authentication and Authorization Middleware
 * JWT-based authentication with role and permission checks
 */

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

class AuthMiddleware {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateFallbackSecret();
    this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
    
    // Initialize Supabase client for user management
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  
  /**
   * Generate fallback secret if none provided
   */
  generateFallbackSecret() {
    console.warn('⚠️  No JWT_SECRET provided, generating temporary secret');
    return crypto.randomBytes(64).toString('hex');
  }
  
  /**
   * Generate JWT token
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId || user.organization_id,
      role: user.role || 'agent',
      permissions: user.permissions || this.getDefaultPermissions(user.role),
      tokenType: 'access'
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry,
      issuer: 'bici-ai-system',
      audience: 'bici-dashboard'
    });
  }
  
  /**
   * Generate refresh token
   */
  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      tokenType: 'refresh'
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'bici-ai-system',
      audience: 'bici-dashboard'
    });
  }
  
  /**
   * Verify JWT token
   */
  verifyToken(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization token required',
          code: 'MISSING_TOKEN'
        });
      }
      
      const token = authHeader.split(' ')[1];
      
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'bici-ai-system',
        audience: 'bici-dashboard'
      });
      
      if (decoded.tokenType !== 'access') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE'
        });
      }
      
      // Add user info to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role,
        permissions: decoded.permissions
      };
      
      next();
      
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Token verification failed',
        code: 'TOKEN_VERIFICATION_ERROR'
      });
    }
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        issuer: 'bici-ai-system',
        audience: 'bici-dashboard'
      });
      
      if (decoded.tokenType !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Get user data from database
      const { data: user, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .single();
      
      if (error || !user) {
        throw new Error('User not found');
      }
      
      // Generate new access token
      return this.generateToken(user);
      
    } catch (error) {
      throw new Error('Refresh token invalid or expired');
    }
  }
  
  /**
   * Require specific role
   */
  requireRole(requiredRole) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      if (req.user.role !== requiredRole && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: `Role '${requiredRole}' required`,
          code: 'INSUFFICIENT_ROLE'
        });
      }
      
      next();
    };
  }
  
  /**
   * Require specific permission
   */
  requirePermission(requiredPermission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const userPermissions = req.user.permissions || [];
      
      if (!userPermissions.includes(requiredPermission) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: `Permission '${requiredPermission}' required`,
          code: 'INSUFFICIENT_PERMISSION'
        });
      }
      
      next();
    };
  }
  
  /**
   * Require multiple permissions (all must be present)
   */
  requirePermissions(requiredPermissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const userPermissions = req.user.permissions || [];
      
      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }
      
      const missingPermissions = requiredPermissions.filter(
        permission => !userPermissions.includes(permission)
      );
      
      if (missingPermissions.length > 0) {
        return res.status(403).json({
          success: false,
          error: `Missing permissions: ${missingPermissions.join(', ')}`,
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }
      
      next();
    };
  }
  
  /**
   * Verify organization access
   */
  requireOrganization(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const requestedOrgId = req.params.organizationId || req.headers['x-organization-id'];
    
    if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to organization',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }
    
    next();
  }
  
  /**
   * Authenticate user with email and password
   */
  async authenticateUser(email, password, organizationId) {
    try {
      // In production, integrate with your auth system
      // This is a development implementation
      
      if (!email || !password) {
        throw new Error('Email and password required');
      }
      
      // Use default organization if none provided
      organizationId = organizationId || '00000000-0000-0000-0000-000000000001';
      
      // Mock authentication - replace with real auth when Supabase is configured
      const mockUsers = [
        {
          id: 'user_admin',
          email: 'admin@bici.com',
          password: 'BiciAI2024!',
          role: 'admin',
          organizationId: '00000000-0000-0000-0000-000000000001',
          permissions: this.getDefaultPermissions('admin')
        },
        {
          id: 'user_agent',
          email: 'agent@bici.com',
          password: 'BiciAI2024!',
          role: 'agent', 
          organizationId: '00000000-0000-0000-0000-000000000001',
          permissions: this.getDefaultPermissions('agent')
        },
        {
          id: 'user_manager',
          email: 'manager@bici.com',
          password: 'BiciAI2024!',
          role: 'manager',
          organizationId: '00000000-0000-0000-0000-000000000001',
          permissions: this.getDefaultPermissions('manager')
        }
      ];
      
      const user = mockUsers.find(u => u.email === email);
      
      if (!user) {
        throw new Error('Invalid credentials');
      }
      
      // In production: verify password hash
      if (password !== user.password) {
        throw new Error('Invalid credentials');
      }
      
      return {
        user,
        accessToken: this.generateToken(user),
        refreshToken: this.generateRefreshToken(user)
      };
      
    } catch (error) {
      throw new Error('Authentication failed: ' + error.message);
    }
  }
  
  /**
   * Get default permissions for role
   */
  getDefaultPermissions(role) {
    const permissions = {
      admin: [
        'dashboard:read',
        'dashboard:write',
        'conversations:read',
        'conversations:write',
        'conversations:manage',
        'analytics:read',
        'analytics:write',
        'integrations:read',
        'integrations:write',
        'integrations:manage',
        'users:read',
        'users:write',
        'users:manage',
        'system:read',
        'system:write',
        'system:manage'
      ],
      manager: [
        'dashboard:read',
        'dashboard:write',
        'conversations:read',
        'conversations:write',
        'conversations:manage',
        'analytics:read',
        'integrations:read',
        'users:read'
      ],
      agent: [
        'dashboard:read',
        'conversations:read',
        'conversations:write',
        'analytics:read'
      ],
      viewer: [
        'dashboard:read',
        'conversations:read',
        'analytics:read'
      ]
    };
    
    return permissions[role] || permissions.viewer;
  }
  
  /**
   * Verify webhook signature (for external webhooks)
   */
  verifyWebhookSignature(secret, headerName = 'x-signature') {
    return (req, res, next) => {
      try {
        const signature = req.headers[headerName.toLowerCase()];
        
        if (!signature) {
          return res.status(401).json({
            success: false,
            error: 'Webhook signature required',
            code: 'MISSING_SIGNATURE'
          });
        }
        
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest('hex');
        
        const providedSignature = signature.replace('sha256=', '');
        
        if (expectedSignature !== providedSignature) {
          return res.status(401).json({
            success: false,
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE'
          });
        }
        
        next();
        
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Signature verification failed',
          code: 'SIGNATURE_VERIFICATION_ERROR'
        });
      }
    };
  }
  
  /**
   * Rate limiting for authentication endpoints
   */
  getAuthRateLimit() {
    const rateLimit = require('express-rate-limit');
    
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting in development
        return process.env.NODE_ENV === 'development';
      }
    });
  }
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

module.exports = {
  verifyToken: authMiddleware.verifyToken.bind(authMiddleware),
  requireRole: authMiddleware.requireRole.bind(authMiddleware),
  requirePermission: authMiddleware.requirePermission.bind(authMiddleware),
  requirePermissions: authMiddleware.requirePermissions.bind(authMiddleware),
  requireOrganization: authMiddleware.requireOrganization.bind(authMiddleware),
  generateToken: authMiddleware.generateToken.bind(authMiddleware),
  generateRefreshToken: authMiddleware.generateRefreshToken.bind(authMiddleware),
  refreshToken: authMiddleware.refreshToken.bind(authMiddleware),
  authenticateUser: authMiddleware.authenticateUser.bind(authMiddleware),
  verifyWebhookSignature: authMiddleware.verifyWebhookSignature.bind(authMiddleware),
  getAuthRateLimit: authMiddleware.getAuthRateLimit.bind(authMiddleware),
  getDefaultPermissions: authMiddleware.getDefaultPermissions.bind(authMiddleware)
};