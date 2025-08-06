const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

class AuthMiddleware {
  /**
   * Verify JWT token and extract user information
   */
  static verifyToken(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
      
      if (!token) {
        return res.status(401).json({
          error: 'Access token required',
          code: 'NO_TOKEN'
        });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Add user info to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role || 'user',
        permissions: decoded.permissions || []
      };
      
      logger.debug('Token verified successfully', {
        userId: req.user.id,
        organizationId: req.user.organizationId
      });
      
      next();
    } catch (error) {
      logger.warn('Token verification failed', {
        error: error.message,
        ip: req.ip
      });
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      } else {
        return res.status(401).json({
          error: 'Authentication failed',
          code: 'AUTH_FAILED'
        });
      }
    }
  }
  
  /**
   * Ensure user belongs to specified organization
   */
  static requireOrganization(organizationId) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH'
        });
      }
      
      if (req.user.organizationId !== organizationId) {
        logger.warn('Organization access denied', {
          userId: req.user.id,
          userOrg: req.user.organizationId,
          requestedOrg: organizationId
        });
        
        return res.status(403).json({
          error: 'Access denied to organization',
          code: 'ORG_ACCESS_DENIED'
        });
      }
      
      next();
    };
  }
  
  /**
   * Check if user has required permission
   */
  static requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH'
        });
      }
      
      if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
        logger.warn('Permission denied', {
          userId: req.user.id,
          requiredPermission: permission,
          userPermissions: req.user.permissions
        });
        
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: permission
        });
      }
      
      next();
    };
  }
  
  /**
   * Check if user has required role
   */
  static requireRole(role) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH'
        });
      }
      
      if (req.user.role !== role && req.user.role !== 'admin') {
        logger.warn('Role access denied', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRole: role
        });
        
        return res.status(403).json({
          error: 'Insufficient role',
          code: 'ROLE_DENIED',
          required: role
        });
      }
      
      next();
    };
  }
  
  /**
   * Generate JWT token for user
   */
  static generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      permissions: user.permissions || []
    };
    
    const options = {
      expiresIn: process.env.JWT_EXPIRY || '24h',
      issuer: 'bici-websocket-dashboard',
      audience: 'bici-dashboard-users'
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, options);
  }
  
  /**
   * Refresh token (generate new token with extended expiry)
   */
  static refreshToken(currentToken) {
    try {
      const decoded = jwt.verify(currentToken, process.env.JWT_SECRET, {
        ignoreExpiration: true // Allow expired tokens for refresh
      });
      
      // Remove JWT specific fields
      delete decoded.iat;
      delete decoded.exp;
      delete decoded.iss;
      delete decoded.aud;
      
      return AuthMiddleware.generateToken(decoded);
    } catch (error) {
      throw new Error('Invalid token for refresh');
    }
  }
  
  /**
   * Validate organization access for WebSocket connections
   */
  static validateWebSocketAuth(token, organizationId) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.organizationId !== organizationId) {
        throw new Error('Organization access denied');
      }
      
      return decoded;
    } catch (error) {
      throw new Error(`WebSocket authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Rate limiting middleware
   */
  static rateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
    const requests = new Map();
    
    return (req, res, next) => {
      const key = req.ip + (req.user?.id || '');
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean up old entries
      const userRequests = requests.get(key) || [];
      const validRequests = userRequests.filter(time => time > windowStart);
      
      if (validRequests.length >= maxRequests) {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          requestCount: validRequests.length
        });
        
        return res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      // Add current request
      validRequests.push(now);
      requests.set(key, validRequests);
      
      next();
    };
  }
  
  /**
   * CORS middleware for WebSocket origins
   */
  static corsWebSocket(req, res, next) {
    const allowedOrigins = [
      process.env.DASHBOARD_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'https://localhost:3000'
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  }
}

module.exports = { AuthMiddleware };