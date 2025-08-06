/**
 * Authentication System for ElevenLabs Integration
 * Handles signed URLs, allowlists, and security for the BICI AI system
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';

export class AuthenticationManager {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateSecureSecret();
    this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.signedUrlSecret = process.env.SIGNED_URL_SECRET || this.generateSecureSecret();
    this.allowlist = new Set(this.loadAllowlist());
    this.rateLimits = new Map(); // IP -> { count, lastReset }
    this.setupCleanupInterval();
  }

  /**
   * Generate signed URL for ElevenLabs WebSocket connections
   */
  async generateSignedURL(organizationId, leadId, expirationMinutes = 60) {
    try {
      console.log(`🔐 Generating signed URL for lead ${leadId}, org ${organizationId}`);

      const now = new Date();
      const expiration = new Date(now.getTime() + (expirationMinutes * 60 * 1000));

      // Create payload for signed URL
      const payload = {
        organization_id: organizationId,
        lead_id: leadId,
        issued_at: now.toISOString(),
        expires_at: expiration.toISOString(),
        nonce: crypto.randomBytes(16).toString('hex')
      };

      // Generate signature
      const signature = this.signPayload(payload);

      // Build signed WebSocket URL
      const baseUrl = 'wss://api.elevenlabs.io/v1/convai/conversation';
      const queryParams = new URLSearchParams({
        'xi-api-key': this.elevenlabsApiKey,
        organization_id: organizationId,
        lead_id: leadId,
        expires_at: expiration.toISOString(),
        signature: signature
      });

      const signedUrl = `${baseUrl}?${queryParams.toString()}`;

      // Store signed URL metadata for validation
      await this.storeSignedUrlMetadata(signature, payload);

      console.log(`✅ Signed URL generated, expires at ${expiration.toISOString()}`);

      return {
        success: true,
        signed_url: signedUrl,
        expires_at: expiration.toISOString(),
        valid_for_minutes: expirationMinutes
      };

    } catch (error) {
      console.error('Error generating signed URL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate signed URL
   */
  async validateSignedURL(signature, organizationId, leadId) {
    try {
      // Retrieve stored metadata
      const metadata = await this.getSignedUrlMetadata(signature);
      
      if (!metadata) {
        return {
          valid: false,
          reason: 'Invalid signature'
        };
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(metadata.expires_at);
      
      if (now > expiresAt) {
        await this.cleanupExpiredMetadata(signature);
        return {
          valid: false,
          reason: 'URL expired'
        };
      }

      // Validate organization and lead
      if (metadata.organization_id !== organizationId || metadata.lead_id !== leadId) {
        return {
          valid: false,
          reason: 'Invalid credentials'
        };
      }

      return {
        valid: true,
        metadata: metadata
      };

    } catch (error) {
      console.error('Error validating signed URL:', error);
      return {
        valid: false,
        reason: 'Validation error'
      };
    }
  }

  /**
   * Generate JWT token for API authentication
   */
  generateJWTToken(payload, expirationHours = 24) {
    try {
      const token = jwt.sign(
        {
          ...payload,
          iat: Math.floor(Date.now() / 1000),
          exp:Math.floor(Date.now() / 1000) + (expirationHours * 60 * 60)
        },
        this.jwtSecret,
        { algorithm: 'HS256' }
      );

      return {
        success: true,
        token: token,
        expires_in: expirationHours * 60 * 60 // seconds
      };

    } catch (error) {
      console.error('Error generating JWT token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate JWT token
   */
  validateJWTToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      return {
        valid: true,
        payload: decoded
      };

    } catch (error) {
      return {
        valid: false,
        reason: error.message
      };
    }
  }

  /**
   * Check if IP is in allowlist
   */
  isIPAllowed(ipAddress) {
    // Always allow localhost for development
    if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress === 'localhost') {
      return true;
    }

    // Check against allowlist
    return this.allowlist.has(ipAddress) || this.allowlist.has('*');
  }

  /**
   * Add IP to allowlist
   */
  addToAllowlist(ipAddress, description = '') {
    try {
      this.allowlist.add(ipAddress);
      
      // Persist to storage (in production, this would be database)
      this.saveAllowlist();
      
      console.log(`✅ Added ${ipAddress} to allowlist: ${description}`);
      
      return {
        success: true,
        message: `IP ${ipAddress} added to allowlist`
      };

    } catch (error) {
      console.error('Error adding to allowlist:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove IP from allowlist
   */
  removeFromAllowlist(ipAddress) {
    try {
      const removed = this.allowlist.delete(ipAddress);
      
      if (removed) {
        this.saveAllowlist();
        console.log(`🗑️ Removed ${ipAddress} from allowlist`);
        
        return {
          success: true,
          message: `IP ${ipAddress} removed from allowlist`
        };
      }

      return {
        success: false,
        message: `IP ${ipAddress} not found in allowlist`
      };

    } catch (error) {
      console.error('Error removing from allowlist:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(ipAddress, maxRequests = 100, windowMinutes = 60) {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    if (!this.rateLimits.has(ipAddress)) {
      this.rateLimits.set(ipAddress, {
        count: 1,
        lastReset: now
      });
      return {
        allowed: true,
        remaining: maxRequests - 1
      };
    }

    const limit = this.rateLimits.get(ipAddress);

    // Reset window if expired
    if (now - limit.lastReset > windowMs) {
      limit.count = 1;
      limit.lastReset = now;
      return {
        allowed: true,
        remaining: maxRequests - 1
      };
    }

    // Check if limit exceeded
    if (limit.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(limit.lastReset + windowMs)
      };
    }

    // Increment counter
    limit.count++;
    return {
      allowed: true,
      remaining: maxRequests - limit.count
    };
  }

  /**
   * Create API key for organization
   */
  createAPIKey(organizationId, permissions = [], description = '') {
    try {
      const keyData = {
        organization_id: organizationId,
        permissions: permissions,
        created_at: new Date().toISOString(),
        description: description,
        key_id: crypto.randomBytes(8).toString('hex')
      };

      // Generate API key
      const apiKey = `bici_${keyData.key_id}_${crypto.randomBytes(32).toString('hex')}`;

      // Hash for storage
      const hashedKey = this.hashAPIKey(apiKey);

      // Store key metadata (in production, this would be database)
      this.storeAPIKeyMetadata(hashedKey, keyData);

      console.log(`🔑 API key created for organization ${organizationId}`);

      return {
        success: true,
        api_key: apiKey,
        key_id: keyData.key_id,
        permissions: permissions,
        created_at: keyData.created_at
      };

    } catch (error) {
      console.error('Error creating API key:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith('bici_')) {
        return {
          valid: false,
          reason: 'Invalid API key format'
        };
      }

      const hashedKey = this.hashAPIKey(apiKey);
      const metadata = await this.getAPIKeyMetadata(hashedKey);

      if (!metadata) {
        return {
          valid: false,
          reason: 'API key not found'
        };
      }

      // Check if key is revoked
      if (metadata.revoked) {
        return {
          valid: false,
          reason: 'API key revoked'
        };
      }

      return {
        valid: true,
        organization_id: metadata.organization_id,
        permissions: metadata.permissions,
        key_id: metadata.key_id
      };

    } catch (error) {
      console.error('Error validating API key:', error);
      return {
        valid: false,
        reason: 'Validation error'
      };
    }
  }

  /**
   * Middleware for authentication
   */
  authMiddleware() {
    return async (req, res, next) => {
      try {
        const clientIP = this.getClientIP(req);
        
        // Check IP allowlist
        if (!this.isIPAllowed(clientIP)) {
          return res.status(403).json({
            error: 'IP not allowed',
            ip: clientIP
          });
        }

        // Check rate limit
        const rateLimit = this.checkRateLimit(clientIP);
        if (!rateLimit.allowed) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            reset_time: rateLimit.resetTime
          });
        }

        // Add rate limit headers
        res.set({
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Limit': '100'
        });

        // Check authentication
        const authHeader = req.headers.authorization;
        const apiKey = req.headers['x-api-key'];

        if (authHeader && authHeader.startsWith('Bearer ')) {
          // JWT token authentication
          const token = authHeader.substring(7);
          const validation = this.validateJWTToken(token);
          
          if (!validation.valid) {
            return res.status(401).json({
              error: 'Invalid token',
              reason: validation.reason
            });
          }

          req.auth = validation.payload;
          return next();

        } else if (apiKey) {
          // API key authentication
          const validation = await this.validateAPIKey(apiKey);
          
          if (!validation.valid) {
            return res.status(401).json({
              error: 'Invalid API key',
              reason: validation.reason
            });
          }

          req.auth = {
            organization_id: validation.organization_id,
            permissions: validation.permissions,
            key_id: validation.key_id,
            type: 'api_key'
          };
          return next();

        } else {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Provide either Bearer token or X-API-Key header'
          });
        }

      } catch (error) {
        console.error('Authentication middleware error:', error);
        return res.status(500).json({
          error: 'Authentication error'
        });
      }
    };
  }

  /**
   * Utility methods
   */
  signPayload(payload) {
    const dataString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.signedUrlSecret)
      .update(dataString)
      .digest('hex');
  }

  hashAPIKey(apiKey) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  generateSecureSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           '127.0.0.1';
  }

  loadAllowlist() {
    // In production, load from database or environment
    const defaultAllowlist = [
      '127.0.0.1',
      '::1',
      'localhost'
    ];

    // Add environment-configured IPs
    const envAllowlist = process.env.IP_ALLOWLIST ? 
      process.env.IP_ALLOWLIST.split(',').map(ip => ip.trim()) : 
      [];

    return [...defaultAllowlist, ...envAllowlist];
  }

  saveAllowlist() {
    // In production, save to database
    const allowlistArray = Array.from(this.allowlist);
    console.log('Allowlist updated:', allowlistArray);
  }

  setupCleanupInterval() {
    // Clean up rate limits every hour
    setInterval(() => {
      this.cleanupRateLimits();
    }, 60 * 60 * 1000);

    // Clean up expired signed URLs every 6 hours
    setInterval(() => {
      this.cleanupExpiredSignedUrls();
    }, 6 * 60 * 60 * 1000);
  }

  cleanupRateLimits() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [ip, limit] of this.rateLimits.entries()) {
      if (now - limit.lastReset > oneHour) {
        this.rateLimits.delete(ip);
      }
    }

    console.log(`🧹 Cleaned up rate limits, ${this.rateLimits.size} entries remaining`);
  }

  async cleanupExpiredSignedUrls() {
    // In production, this would clean up database records
    console.log('🧹 Cleaning up expired signed URLs');
  }

  /**
   * Storage methods (implement based on your storage solution)
   */
  async storeSignedUrlMetadata(signature, metadata) {
    // In production, store in Redis or database
    // For now, we'll use memory (not suitable for production)
    if (!this.signedUrlCache) {
      this.signedUrlCache = new Map();
    }
    this.signedUrlCache.set(signature, metadata);
  }

  async getSignedUrlMetadata(signature) {
    // In production, retrieve from Redis or database
    return this.signedUrlCache?.get(signature) || null;
  }

  async cleanupExpiredMetadata(signature) {
    // Remove expired metadata
    if (this.signedUrlCache) {
      this.signedUrlCache.delete(signature);
    }
  }

  storeAPIKeyMetadata(hashedKey, metadata) {
    // In production, store in database
    if (!this.apiKeyCache) {
      this.apiKeyCache = new Map();
    }
    this.apiKeyCache.set(hashedKey, metadata);
  }

  async getAPIKeyMetadata(hashedKey) {
    // In production, retrieve from database
    return this.apiKeyCache?.get(hashedKey) || null;
  }

  /**
   * Get authentication statistics
   */
  getAuthStats() {
    return {
      allowlist_size: this.allowlist.size,
      rate_limit_entries: this.rateLimits.size,
      signed_url_cache: this.signedUrlCache?.size || 0,
      api_key_cache: this.apiKeyCache?.size || 0
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration() {
    const issues = [];

    if (!this.jwtSecret || this.jwtSecret.length < 32) {
      issues.push('JWT secret is too short or missing');
    }

    if (!this.elevenlabsApiKey) {
      issues.push('ElevenLabs API key is missing');
    }

    if (!this.signedUrlSecret || this.signedUrlSecret.length < 32) {
      issues.push('Signed URL secret is too short or missing');
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }
}

export default AuthenticationManager;