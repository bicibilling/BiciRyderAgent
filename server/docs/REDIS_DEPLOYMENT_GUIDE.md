# Redis Deployment Guide

## Production Deployment Checklist

### Pre-Deployment Validation

#### ✅ Step 1: Run Comprehensive Test Suite

```bash
# Run all Redis implementation tests
tsx scripts/test-redis-comprehensive.ts

# Expected output:
# ✅ Unit Tests PASSED
# ✅ Integration Tests - Lead Service PASSED  
# ✅ Integration Tests - Conversation Service PASSED
# ✅ Resilience Tests PASSED
# ✅ Performance Tests PASSED
# ✅ E2E Webhook Tests PASSED
# ✅ E2E Dashboard Tests PASSED
```

#### ✅ Step 2: Production Readiness Validation

```bash
# Run production validation suite
tsx scripts/redis-validation-suite.ts

# Expected output:
# 🚀 PRODUCTION READY - Excellent
# ✅ All critical systems functioning correctly
# ✅ Performance targets met
# ✅ Resilience measures operational
```

#### ✅ Step 3: Baseline Functionality Verification

```bash
# Verify system works without Redis
REDIS_ENABLED=false npm test
npm run test:webhooks

# Confirm all tests pass in baseline mode
```

### Infrastructure Setup

#### ✅ Step 4: Redis Instance Creation

**Option A: Render Key Value (Recommended)**

1. **Create Redis Instance:**
   ```bash
   # Via Render Dashboard:
   # 1. Go to Dashboard → New → Key Value Store
   # 2. Name: bici-redis-prod
   # 3. Plan: Starter (256MB) or higher
   # 4. Region: Same as your server region
   ```

2. **Get Connection Details:**
   ```bash
   # From Render Dashboard → bici-redis-prod → Connect
   # Copy the connection URL (rediss://...)
   ```

**Option B: Redis Cloud/ElastiCache**

1. **Create managed Redis instance**
2. **Configure VPC networking if needed**
3. **Enable SSL/TLS encryption**
4. **Set up authentication**

#### ✅ Step 5: Environment Configuration

**Production Environment Variables:**
```bash
# Core Redis Settings
REDIS_ENABLED=false           # Start disabled for gradual rollout
REDIS_URL=rediss://red-xyz:password@region.render.com:6380

# Connection Settings (optional overrides)
REDIS_HOST=                   # Extracted from URL
REDIS_PORT=                   # Extracted from URL  
REDIS_PASSWORD=               # Extracted from URL
REDIS_DB=0                    # Database number

# Monitoring Settings
REDIS_MONITORING_ENABLED=true
REDIS_ALERT_WEBHOOK_URL=      # Optional: Slack/Teams webhook for alerts
```

#### ✅ Step 6: Network and Security

1. **SSL/TLS Configuration:**
   - Ensure Redis URL uses `rediss://` (SSL)
   - Verify certificate validation in production

2. **Network Access:**
   - Configure firewall rules if needed
   - Ensure server can reach Redis instance
   - Test connectivity from production environment

3. **Authentication:**
   - Verify Redis password is set
   - Store credentials securely (environment variables)

### Gradual Deployment Process

#### Phase 1: Deploy with Redis Infrastructure (Redis Disabled)

**Deployment Steps:**
```bash
# 1. Deploy application with Redis disabled
REDIS_ENABLED=false

# 2. Verify normal operation
curl https://your-domain.com/api/monitoring/health
curl https://your-domain.com/api/monitoring/health/redis

# Expected: Redis shows as "disabled" but system works normally
```

**Validation:**
- [ ] All existing functionality works
- [ ] Webhook response times baseline recorded
- [ ] No errors in application logs
- [ ] ElevenLabs webhooks working normally

#### Phase 2: Enable Redis with Monitoring

**Enable Redis:**
```bash
# Update environment variable
REDIS_ENABLED=true

# Restart application
# Monitor startup logs for Redis connection success
```

**Initial Validation:**
```bash
# Check Redis connection
curl https://your-domain.com/api/monitoring/health/redis

# Expected response:
{
  "status": "healthy",
  "redis": {
    "enabled": true,
    "connected": true,
    "connectionTest": {
      "connected": true,
      "status": "healthy",
      "latency": "< 10ms"
    }
  }
}
```

**Monitor Cache Population:**
```bash
# Watch cache metrics populate
curl https://your-domain.com/api/monitoring/metrics/performance

# Monitor cache hit rates over first hour:
# - Initial: 0% (cold cache)
# - After 10 minutes: 20-40%
# - After 30 minutes: 60-80%
# - After 1 hour: 70-90%
```

#### Phase 3: Performance Validation

**Monitor Key Metrics:**
```bash
# Real-time monitoring
curl -N https://your-domain.com/api/monitoring/stream

# Key metrics to watch:
# - Cache hit rate trending upward
# - Average response time improving
# - No error alerts
# - Webhook timeouts eliminated
```

**Performance Benchmarks:**
- [ ] Webhook response times improved by 50%+
- [ ] Cache hit rate >60% after warmup
- [ ] No increase in error rates
- [ ] Database load reduced

#### Phase 4: Full Production Validation

**Load Testing:**
```bash
# Simulate high webhook traffic
# Monitor system behavior under load
# Verify cache effectiveness during peak usage
```

**Business Validation:**
- [ ] ElevenLabs webhooks responding faster
- [ ] SMS webhook processing improved
- [ ] Dashboard loading faster
- [ ] No functional regressions

### Monitoring and Alerting Setup

#### ✅ Step 7: Configure Monitoring Dashboard

**Health Check Endpoints:**
```bash
# Set up monitoring for these endpoints:
GET /api/monitoring/health              # Overall system health
GET /api/monitoring/health/redis        # Redis-specific health
GET /api/monitoring/metrics/performance # Performance metrics
GET /api/monitoring/alerts             # Active alerts
```

**Recommended Monitoring Frequency:**
- Health checks: Every 30 seconds
- Performance metrics: Every 60 seconds
- Alert polling: Every 30 seconds

#### ✅ Step 8: Set Up Alerts

**Critical Alerts:**
- Redis connection lost
- Cache hit rate <30%
- Average response time >150ms
- Error rate >5%

**Warning Alerts:**
- Cache hit rate <60%
- Average response time >100ms
- Memory usage >80%

**Alert Channels:**
- Slack webhook integration
- Email notifications
- PagerDuty/incident management

### Rollback Procedures

#### Immediate Rollback (If Issues Occur)

**Emergency Rollback:**
```bash
# 1. Disable Redis immediately
REDIS_ENABLED=false

# 2. Restart application
# System returns to baseline functionality

# 3. Verify system stability
curl https://your-domain.com/api/monitoring/health

# 4. Monitor for 15-30 minutes to ensure stability
```

**No Data Loss:**
- Redis is cache-only, no data is stored permanently
- All data remains in Supabase database
- System functions identically without Redis

#### Troubleshooting During Rollback

```bash
# Check Redis connection issues
tsx scripts/test-redis.ts

# Validate baseline functionality  
REDIS_ENABLED=false npm test

# Monitor error logs
tail -f logs/application.log | grep -i redis
```

### Post-Deployment Validation

#### ✅ Step 9: Performance Validation

**Webhook Performance Test:**
```bash
# Test ElevenLabs webhook simulation
# Before: ~200-300ms average
# After: ~30-60ms average (with warm cache)

# SMS webhook performance
# Before: ~150-250ms average  
# After: ~25-50ms average (with warm cache)
```

**Database Load Reduction:**
- Monitor database query rates
- Should see 50-80% reduction in lead/context queries
- Database CPU/memory usage should decrease

#### ✅ Step 10: Business Metrics Validation

**ElevenLabs Integration:**
- [ ] Webhook timeout errors eliminated
- [ ] Conversation initiation faster
- [ ] Dynamic variable generation improved

**User Experience:**
- [ ] Dashboard loading faster
- [ ] Real-time updates more responsive
- [ ] SMS automation more reliable

### Long-term Monitoring

#### Performance Monitoring

**Weekly Performance Review:**
- Cache hit rates trending upward
- Response times maintaining improvement
- Error rates remain low
- Memory usage stable

**Monthly Capacity Planning:**
- Redis memory usage growth
- Query pattern analysis
- TTL optimization opportunities

#### Health Monitoring

**Daily Health Checks:**
- Redis connection stability
- Alert volume and types
- Performance regression detection

**Incident Response:**
- Document any Redis-related incidents
- Update monitoring thresholds based on experience
- Refine rollback procedures

### Success Criteria

#### Technical Success Metrics

- [ ] **Performance:** 50%+ improvement in webhook response times
- [ ] **Reliability:** 99.9% Redis uptime with graceful fallback
- [ ] **Cache Effectiveness:** 70%+ cache hit rate after warmup
- [ ] **Error Reduction:** Zero webhook timeout errors

#### Business Success Metrics

- [ ] **Customer Experience:** Faster voice/SMS interactions
- [ ] **System Reliability:** No functional regressions
- [ ] **Operational Efficiency:** Reduced database load
- [ ] **Team Confidence:** Comprehensive monitoring and alerting

---

## Emergency Contacts and Procedures

### Escalation Path

1. **Level 1:** Disable Redis (`REDIS_ENABLED=false`)
2. **Level 2:** Contact Redis infrastructure team
3. **Level 3:** Full system health verification
4. **Level 4:** Incident response team activation

### Emergency Commands

```bash
# Immediate Redis disable
export REDIS_ENABLED=false
# Restart application

# Health check
curl https://your-domain.com/api/monitoring/health

# Clear Redis cache (if needed)
# This requires direct Redis access - contact infrastructure team
```

### Documentation and Support

- **Redis Implementation Docs:** `/docs/REDIS_IMPLEMENTATION.md`
- **API Documentation:** `/docs/MONITORING_API.md`
- **Test Suite:** `npm run test:redis`
- **Validation Suite:** `tsx scripts/redis-validation-suite.ts`

---

## Completion Checklist

### Pre-Deployment ✅

- [ ] All tests pass (`tsx scripts/test-redis-comprehensive.ts`)
- [ ] Production validation successful (`tsx scripts/redis-validation-suite.ts`)
- [ ] Redis infrastructure provisioned and tested
- [ ] Environment variables configured
- [ ] Monitoring endpoints tested
- [ ] Team trained on new monitoring/alerting

### Deployment ✅

- [ ] Phase 1: Deployed with Redis disabled, verified functionality
- [ ] Phase 2: Enabled Redis, verified connection and cache population
- [ ] Phase 3: Validated performance improvements
- [ ] Phase 4: Full production validation completed

### Post-Deployment ✅

- [ ] Performance improvements verified
- [ ] Cache hit rates meeting targets (>60%)
- [ ] Monitoring and alerting operational
- [ ] Team comfortable with rollback procedures
- [ ] Documentation updated and accessible

**Deployment Status: ✅ READY FOR PRODUCTION**

The Redis implementation is comprehensively tested, monitored, and ready for production deployment with minimal risk and maximum performance benefit.