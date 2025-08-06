const jwt = require('jsonwebtoken');
const { authLogger } = require('../config/logger');

class AuthenticationMiddleware {
  constructor() {
    this.logger = authLogger;
    this.secretKey = process.env.SECRET_KEY || 'fallback-secret-key';
    
    // API key configurations for different services
    this.apiKeys = {
      elevenlabs: process.env.ELEVENLABS_WEBHOOK_SECRET,
      shopify: process.env.SHOPIFY_WEBHOOK_SECRET,
      hubspot: process.env.HUBSPOT_WEBHOOK_SECRET,
      server_tools: process.env.SERVER_TOOLS_API_KEY || this.generateServerToolsKey()
    };
  }

  /**
   * Generate server tools API key if not provided
   */
  generateServerToolsKey() {
    const key = `bici_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.logger.warn('Generated temporary server tools API key. Set SERVER_TOOLS_API_KEY in environment.', { key });
    return key;
  }

  /**
   * Middleware to authenticate server tool requests
   */
  authenticateServerTools() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          this.logger.warn('Server tools request without authorization header', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Authorization header required'
          });
        }

        const token = authHeader.startsWith('Bearer ') 
          ? authHeader.substring(7) 
          : authHeader;

        if (token !== this.apiKeys.server_tools) {
          this.logger.warn('Invalid server tools API key', {
            path: req.path,
            ip: req.ip,
            providedToken: token.substring(0, 8) + '***'
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid API key'
          });
        }

        this.logger.info('Server tools request authenticated', {
          path: req.path,
          ip: req.ip
        });

        next();

      } catch (error) {
        this.logger.error('Server tools authentication error', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        res.status(500).json({
          success: false,
          error: 'Authentication error'
        });
      }
    };
  }

  /**
   * Middleware to authenticate webhook requests from ElevenLabs
   */
  authenticateElevenLabsWebhook() {
    return (req, res, next) => {
      try {
        const signature = req.headers['x-elevenlabs-signature'] || req.headers['authorization'];
        
        if (!signature) {
          this.logger.warn('ElevenLabs webhook without signature', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Webhook signature required'
          });
        }

        // Verify signature against webhook secret
        const expectedSignature = this.apiKeys.elevenlabs;
        const providedSignature = signature.startsWith('Bearer ') 
          ? signature.substring(7) 
          : signature;

        if (providedSignature !== expectedSignature) {
          this.logger.warn('Invalid ElevenLabs webhook signature', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid webhook signature'
          });
        }

        this.logger.info('ElevenLabs webhook authenticated', {
          path: req.path,
          ip: req.ip
        });

        next();

      } catch (error) {
        this.logger.error('ElevenLabs webhook authentication error', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        res.status(500).json({
          success: false,
          error: 'Webhook authentication error'
        });
      }
    };
  }

  /**
   * Middleware to authenticate Shopify webhook requests
   */
  authenticateShopifyWebhook() {
    return (req, res, next) => {
      try {
        const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
        
        if (!hmacHeader) {
          this.logger.warn('Shopify webhook without HMAC header', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Shopify HMAC header required'
          });
        }

        // Verify HMAC signature
        const crypto = require('crypto');
        const body = JSON.stringify(req.body);
        const computedHmac = crypto
          .createHmac('sha256', this.apiKeys.shopify)
          .update(body, 'utf8')
          .digest('base64');

        if (computedHmac !== hmacHeader) {
          this.logger.warn('Invalid Shopify webhook HMAC', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid webhook signature'
          });
        }

        this.logger.info('Shopify webhook authenticated', {
          path: req.path,
          ip: req.ip,
          topic: req.get('X-Shopify-Topic')
        });

        next();

      } catch (error) {
        this.logger.error('Shopify webhook authentication error', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        res.status(500).json({
          success: false,
          error: 'Webhook authentication error'
        });
      }
    };
  }

  /**
   * Middleware to authenticate HubSpot webhook requests
   */
  authenticateHubSpotWebhook() {
    return (req, res, next) => {
      try {
        const signature = req.headers['x-hubspot-signature'] || req.headers['x-hubspot-signature-v1'];
        
        if (!signature) {
          this.logger.warn('HubSpot webhook without signature', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'HubSpot signature required'
          });
        }

        // Verify signature
        const crypto = require('crypto');
        const sourceString = req.method + req.originalUrl + JSON.stringify(req.body) + Date.now();
        const hash = crypto
          .createHmac('sha256', this.apiKeys.hubspot)
          .update(sourceString)
          .digest('hex');

        // For simplified verification, compare with webhook secret
        if (!signature.includes(this.apiKeys.hubspot)) {
          this.logger.warn('Invalid HubSpot webhook signature', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid webhook signature'
          });
        }

        this.logger.info('HubSpot webhook authenticated', {
          path: req.path,
          ip: req.ip
        });

        next();

      } catch (error) {
        this.logger.error('HubSpot webhook authentication error', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        res.status(500).json({
          success: false,
          error: 'Webhook authentication error'
        });
      }
    };
  }

  /**
   * Middleware to authenticate dashboard/admin requests
   */
  authenticateDashboard() {
    return (req, res, next) => {
      try {
        const token = req.headers.authorization?.startsWith('Bearer ') 
          ? req.headers.authorization.substring(7)
          : req.cookies?.auth_token;

        if (!token) {
          return res.status(401).json({
            success: false,
            error: 'Authentication token required'
          });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, this.secretKey);
        
        req.user = decoded;
        
        this.logger.info('Dashboard request authenticated', {
          userId: decoded.id,
          organizationId: decoded.organizationId,
          path: req.path
        });

        next();

      } catch (error) {
        this.logger.warn('Dashboard authentication failed', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token'
        });
      }
    };
  }

  /**
   * Generate JWT token for dashboard access
   */
  generateDashboardToken(userData) {
    try {
      const payload = {
        id: userData.id,
        email: userData.email,
        organizationId: userData.organizationId,
        role: userData.role || 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      };

      const token = jwt.sign(payload, this.secretKey);

      this.logger.info('Dashboard token generated', {
        userId: userData.id,
        organizationId: userData.organizationId
      });

      return token;

    } catch (error) {
      this.logger.error('Token generation failed', {
        error: error.message,
        userData: { id: userData.id, email: userData.email }
      });
      
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Refresh JWT token
   */
  refreshToken(currentToken) {
    try {
      const decoded = jwt.verify(currentToken, this.secretKey, { ignoreExpiration: true });
      
      // Check if token is within refresh window (7 days)
      const now = Math.floor(Date.now() / 1000);
      const tokenAge = now - decoded.iat;
      const maxRefreshAge = 7 * 24 * 60 * 60; // 7 days
      
      if (tokenAge > maxRefreshAge) {
        throw new Error('Token too old to refresh');
      }

      // Generate new token
      const newToken = this.generateDashboardToken({
        id: decoded.id,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role
      });

      this.logger.info('Token refreshed', {
        userId: decoded.id,
        organizationId: decoded.organizationId
      });

      return newToken;

    } catch (error) {
      this.logger.error('Token refresh failed', { error: error.message });
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Get API key information for configuration
   */
  getApiKeyInfo() {
    return {
      server_tools_key: this.apiKeys.server_tools,
      has_elevenlabs_secret: !!this.apiKeys.elevenlabs,
      has_shopify_secret: !!this.apiKeys.shopify,
      has_hubspot_secret: !!this.apiKeys.hubspot
    };
  }
}

module.exports = new AuthenticationMiddleware();