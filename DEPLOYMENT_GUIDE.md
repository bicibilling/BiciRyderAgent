# BICI AI Voice Agent - Complete Deployment Guide

This comprehensive guide covers deploying the BICI AI Voice Agent system to Render platform with both frontend and backend services.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Configuration](#database-configuration)
4. [Render Platform Setup](#render-platform-setup)
5. [Service Configuration](#service-configuration)
6. [Deployment Process](#deployment-process)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Scaling Considerations](#scaling-considerations)

## Prerequisites

### Required Accounts & Services

1. **Render Account** - Sign up at [https://render.com](https://render.com)
2. **GitHub Repository** - Code must be in a GitHub repository
3. **Supabase Account** - Database hosting at [https://supabase.com](https://supabase.com)
4. **Upstash Redis** - Caching at [https://upstash.com](https://upstash.com)
5. **ElevenLabs Account** - AI Voice service
6. **Twilio Account** - Phone services
7. **Domain Name** (Optional) - For custom domains

### Required API Keys & Credentials

Gather the following before starting deployment:

- Supabase Project URL and Service Role Key
- Upstash Redis URL
- ElevenLabs API Key and Agent ID
- Twilio Account SID and Auth Token
- HubSpot Access Token (if using CRM)
- Shopify Access Token (if using e-commerce)
- Google Client ID/Secret (if using Calendar)

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/bici-ai-voice-agent.git
cd bici-ai-voice-agent
```

### 2. Local Environment Configuration

Create local environment files for testing:

```bash
# Copy example environment files
cp .env.example .env
cp frontend/.env.example frontend/.env.local

# Edit .env with your actual values
nano .env
```

### 3. Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
npm run install:frontend

# Install client dependencies (if using React Scripts build)
npm run install:client
```

### 4. Test Local Build

```bash
# Test backend build
npm run build:backend

# Test frontend build
npm run build:frontend

# Verify builds completed successfully
ls -la frontend/dist/
```

## Database Configuration

### 1. Supabase Setup

1. **Create New Project** in Supabase dashboard
2. **Get Connection Details**:
   - Project URL: `https://your-project.supabase.co`
   - API Keys: Anon key and Service role key
3. **Configure Authentication** (disable if not using Supabase Auth)

### 2. Database Migration

Run the database migration script:

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run migration
node scripts/deploy-database.js deploy

# Verify migration
node scripts/deploy-database.js status
```

### 3. Database Configuration Verification

```bash
# Test database connection
npm run db:test

# Verify tables created
npm run db:verify
```

## Render Platform Setup

### 1. Connect GitHub Repository

1. Log into Render dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Grant necessary permissions

### 2. Service Configuration Options

#### Option A: Using render.yaml (Recommended)

1. Ensure `render.yaml` is in your repository root
2. Select "Use render.yaml" during setup
3. Render will automatically create all services

#### Option B: Manual Service Creation

Create services individually:
- Backend API Service
- Frontend Static Site
- Background Worker (optional)

### 3. Domain Configuration

1. **Custom Domain Setup**:
   - Backend: `api.yourdomain.com`
   - Frontend: `yourdomain.com`
   
2. **SSL Certificate**: Automatically provided by Render

## Service Configuration

### Backend Service Configuration

#### Environment Variables (Required)

```bash
# Core Settings
NODE_ENV=production
PORT=10000  # Render assigns this automatically

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cache
UPSTASH_REDIS_URL=redis://your-redis-url

# AI Services
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_AGENT_ID=your-agent-id

# Telephony
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Security (Auto-generated or custom)
JWT_SECRET=your-jwt-secret
API_KEY_SECRET=your-api-key-secret
WEBHOOK_SECRET=your-webhook-secret

# CORS (Frontend URL will be auto-set by Render)
CORS_ORIGIN=https://your-frontend-url.onrender.com

# Optional Integrations
HUBSPOT_ACCESS_TOKEN=your-hubspot-token
SHOPIFY_ACCESS_TOKEN=your-shopify-token
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

#### Build Configuration

```yaml
buildCommand: npm install && npm run build:backend
startCommand: npm start
healthCheckPath: /health
```

### Frontend Service Configuration

#### Environment Variables

```bash
# API Configuration (Auto-set by Render)
REACT_APP_API_URL=https://your-backend.onrender.com
REACT_APP_WS_URL=wss://your-backend.onrender.com

# Environment
REACT_APP_ENVIRONMENT=production
GENERATE_SOURCEMAP=false
```

#### Build Configuration

```yaml
buildCommand: cd frontend && npm install && npm run build:production
staticPublishPath: ./frontend/dist
```

## Deployment Process

### 1. Initial Deployment

1. **Push Code to GitHub**:
   ```bash
   git add .
   git commit -m "Initial deployment setup"
   git push origin main
   ```

2. **Trigger Render Deployment**:
   - Automatic via GitHub webhook
   - Manual via Render dashboard

3. **Monitor Deployment**:
   - Check build logs
   - Verify health endpoints
   - Test basic functionality

### 2. Database Migration

Once backend is deployed:

```bash
# Run database migration in production
curl -X POST https://your-backend.onrender.com/api/admin/migrate \
  -H "Authorization: Bearer your-admin-token"

# Or run manually if you have production access
SUPABASE_URL="prod-url" node scripts/deploy-database.js deploy
```

### 3. Verify Services

#### Backend Health Check

```bash
curl https://your-backend.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "organization": "bici-bike-store",
  "connections": {
    "dashboard_clients": 0,
    "active_conversations": 0
  }
}
```

#### Frontend Accessibility

```bash
curl -I https://your-frontend.onrender.com
```

Expected: `200 OK` response

#### Database Connectivity

```bash
curl https://your-backend.onrender.com/api/admin/config
```

Should show all integrations as configured.

## Post-Deployment Verification

### 1. Functional Testing

#### API Endpoints Test

```bash
# Health check
curl https://your-backend.onrender.com/health

# Detailed health check
curl https://your-backend.onrender.com/health/detailed

# Metrics
curl https://your-backend.onrender.com/metrics
```

#### Integration Testing

```bash
# ElevenLabs connectivity
curl https://your-backend.onrender.com/health/elevenlabs

# Database connectivity
curl https://your-backend.onrender.com/health/database

# Redis connectivity
curl https://your-backend.onrender.com/health/redis
```

### 2. Performance Testing

#### Load Testing (using curl)

```bash
# Test multiple concurrent requests
for i in {1..10}; do
  curl -s https://your-backend.onrender.com/health &
done
wait
```

#### Response Time Testing

```bash
# Measure response times
curl -w "@curl-format.txt" -s -o /dev/null https://your-backend.onrender.com/health
```

### 3. Security Verification

#### HTTPS Enforcement

```bash
# Should redirect to HTTPS
curl -I http://your-frontend.onrender.com
```

#### Security Headers

```bash
# Check security headers
curl -I https://your-frontend.onrender.com
```

Should include:
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `X-XSS-Protection`

## Monitoring & Maintenance

### 1. Built-in Monitoring

#### Render Dashboard Monitoring

- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Alerts**: Service down notifications
- **Uptime**: Service availability tracking

#### Application Health Endpoints

```bash
# Basic health
GET /health

# Detailed system health
GET /health/detailed

# Service-specific health
GET /health/{service}

# System metrics
GET /metrics
```

### 2. Log Management

#### Accessing Logs

Via Render Dashboard:
1. Go to Service → Events tab
2. View real-time logs
3. Filter by log level

Via API:
```bash
# Recent application logs
curl https://your-backend.onrender.com/api/admin/logs?limit=100
```

#### Log Levels

- `ERROR`: Critical issues requiring immediate attention
- `WARN`: Non-critical issues that should be monitored
- `INFO`: General information about application operations
- `DEBUG`: Detailed debugging information (disabled in production)

### 3. Performance Monitoring

#### Key Metrics to Monitor

1. **Response Times**
   - API endpoint response times
   - Database query performance
   - External service call latency

2. **Resource Usage**
   - CPU utilization
   - Memory consumption
   - Disk I/O

3. **Application Metrics**
   - Active conversations
   - Message throughput
   - Error rates

4. **External Service Health**
   - ElevenLabs API availability
   - Twilio service status
   - Database connection health

### 4. Automated Maintenance

#### Background Worker Tasks

The background worker automatically handles:

- **Log Cleanup**: Removes logs older than 30 days
- **Session Cleanup**: Removes expired sessions
- **Health Checks**: Monitors external service health
- **Backup Tasks**: Creates daily conversation backups
- **Analytics Updates**: Processes conversation insights

#### Manual Maintenance Tasks

```bash
# Database cleanup
curl -X POST https://your-backend.onrender.com/api/admin/cleanup

# Force health check update
curl -X POST https://your-backend.onrender.com/api/admin/health-check

# Generate analytics report
curl -X POST https://your-backend.onrender.com/api/admin/analytics/generate
```

## Troubleshooting

### Common Issues & Solutions

#### 1. Deployment Failures

**Build Failures**:
```bash
# Check build logs in Render dashboard
# Common issues:
# - Missing environment variables
# - Node.js version mismatch
# - Dependency conflicts

# Solutions:
# 1. Verify package.json engines specification
# 2. Check all environment variables are set
# 3. Clear build cache and redeploy
```

**Start Failures**:
```bash
# Check start command is correct
# Verify main entry point exists
# Check for runtime errors in logs

# Solutions:
# 1. Verify start command in package.json
# 2. Check for missing runtime dependencies
# 3. Review application logs for errors
```

#### 2. Database Connection Issues

**Connection Refused**:
```bash
# Check Supabase credentials
# Verify network connectivity
# Check RLS policies

# Solutions:
# 1. Verify SUPABASE_URL and keys are correct
# 2. Check Supabase project is active
# 3. Review database connection pool settings
```

**Query Failures**:
```bash
# Check RLS policies
# Verify table permissions
# Check for missing migrations

# Solutions:
# 1. Review RLS policies configuration
# 2. Run database migration script
# 3. Check service role permissions
```

#### 3. External Service Integration Issues

**ElevenLabs API Errors**:
```bash
# Check API key validity
# Verify account limits
# Review request formatting

# Solutions:
# 1. Regenerate API key if expired
# 2. Check account usage and limits
# 3. Review API documentation for changes
```

**Twilio Connection Issues**:
```bash
# Verify Account SID and Auth Token
# Check phone number configuration
# Review webhook URLs

# Solutions:
# 1. Regenerate Twilio credentials
# 2. Update webhook URLs to production URLs
# 3. Verify phone number is verified in Twilio
```

#### 4. Performance Issues

**High Response Times**:
```bash
# Check database query performance
# Review external API call latency
# Monitor resource usage

# Solutions:
# 1. Optimize database queries
# 2. Implement request caching
# 3. Scale up service plan
```

**Memory Issues**:
```bash
# Monitor memory usage patterns
# Check for memory leaks
# Review garbage collection logs

# Solutions:
# 1. Optimize data structures
# 2. Implement data cleanup routines
# 3. Increase memory allocation
```

#### 5. Frontend Issues

**API Connection Problems**:
```bash
# Check CORS configuration
# Verify API URLs are correct
# Review network requests in browser

# Solutions:
# 1. Update CORS origins in backend
# 2. Verify API URLs in frontend config
# 3. Check for API rate limiting
```

**Build Issues**:
```bash
# Check TypeScript compilation
# Verify all dependencies are installed
# Review build configuration

# Solutions:
# 1. Fix TypeScript errors
# 2. Update dependency versions
# 3. Clear node_modules and reinstall
```

### Debug Commands

#### Backend Debugging

```bash
# Check service configuration
curl https://your-backend.onrender.com/api/admin/config

# Test database connection
curl https://your-backend.onrender.com/health/database

# View recent logs
curl https://your-backend.onrender.com/api/admin/logs?level=error

# Test specific integration
curl https://your-backend.onrender.com/health/elevenlabs
```

#### Frontend Debugging

```bash
# Check build artifacts
ls -la frontend/dist/

# Verify environment variables
cat frontend/.env.production

# Test production build locally
cd frontend && npm run preview:production
```

#### Database Debugging

```bash
# Check migration status
node scripts/deploy-database.js status

# Test database queries
node scripts/test-database.js

# View database logs
# (Access via Supabase dashboard)
```

### Emergency Procedures

#### Service Recovery

**Backend Service Down**:
1. Check Render service status
2. Review recent deployments
3. Revert to last known good deployment
4. Scale up resources if needed

**Database Issues**:
1. Check Supabase status page
2. Review connection pool settings
3. Restart backend service
4. Contact Supabase support if needed

**Complete System Outage**:
1. Check all external service status
2. Review monitoring alerts
3. Communicate with stakeholders
4. Implement rollback procedures

#### Data Recovery

**Conversation Data Loss**:
```bash
# Check Redis backup
redis-cli --raw dump conversation_backup_key

# Check database backups
# (Available in Supabase dashboard)

# Restore from backup
node scripts/restore-backup.js --date=2024-01-15
```

## Scaling Considerations

### Horizontal Scaling

#### Backend Scaling

Render automatically scales based on:
- CPU usage
- Memory usage
- Request volume

Configuration:
```yaml
scaling:
  minInstances: 2  # Minimum for high availability
  maxInstances: 10  # Scale up to handle traffic spikes
```

#### Database Scaling

Supabase handles:
- Connection pooling
- Read replicas (on higher plans)
- Automatic backups

Consider upgrading Supabase plan for:
- More concurrent connections
- Better performance
- Advanced features

#### Cache Scaling

Upstash Redis provides:
- Automatic scaling
- Global distribution
- High availability

Monitor Redis usage:
- Memory utilization
- Command throughput
- Connection count

### Vertical Scaling

#### When to Scale Up

Indicators for scaling:
- Consistent high CPU usage (>80%)
- Memory usage approaching limits
- Increased response times
- External service timeouts

#### Scaling Actions

1. **Upgrade Service Plan**:
   - More CPU cores
   - Additional memory
   - Better network performance

2. **Optimize Application**:
   - Database query optimization
   - Caching improvements
   - Code performance tuning

3. **External Service Upgrades**:
   - Higher-tier Supabase plan
   - Premium Redis instance
   - Enhanced API rate limits

### Cost Optimization

#### Resource Right-sizing

- Monitor actual resource usage
- Scale down during low-traffic periods
- Use appropriate service tiers

#### Caching Strategy

- Implement response caching
- Cache database query results
- Use CDN for static assets

#### Database Optimization

- Optimize queries and indexes
- Implement connection pooling
- Use read replicas for scaling reads

---

## Support & Resources

### Documentation

- [Render Documentation](https://render.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)
- [Twilio API Documentation](https://www.twilio.com/docs)

### Community Support

- [Render Community](https://community.render.com)
- [Supabase Discord](https://discord.supabase.com)
- [GitHub Issues](https://github.com/your-org/bici-ai-voice-agent/issues)

### Emergency Contacts

- Render Support: [help@render.com](mailto:help@render.com)
- Supabase Support: Via dashboard
- Team Escalation: [your-team@email.com](mailto:your-team@email.com)

---

**Last Updated**: January 2024  
**Version**: 1.0.0  
**Deployment Target**: Render Platform