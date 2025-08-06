# 🚀 BICI AI Voice Agent System - Render Deployment Guide

## 📋 Quick Deployment Checklist

### Step 1: Gather Required API Keys

Before deploying, collect these API keys and credentials:

#### 🤖 ElevenLabs
- [ ] **API Key**: `sk_...` (from ElevenLabs dashboard)
- [ ] **Agent ID**: `agent_...` (create conversational AI agent)
- [ ] **Phone Number ID**: `pn_...` (import Twilio number to ElevenLabs)
- [ ] **Webhook Secret**: `whsec_...` (from webhook settings)

#### 📞 Twilio
- [ ] **Account SID**: `AC...` (from Twilio console)
- [ ] **Auth Token**: (from Twilio console)
- [ ] **Phone Number**: `+1234567890` (purchased Twilio number)

#### 🗄️ Database (Supabase)
- [ ] **Project URL**: `https://xxx.supabase.co`
- [ ] **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- [ ] **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### 🔴 Redis (Upstash)
- [ ] **Redis URL**: `redis://...`
- [ ] **REST URL**: `https://xxx.upstash.io`
- [ ] **REST Token**: (from Upstash dashboard)

#### 🛒 Shopify (Optional)
- [ ] **Access Token**: `shpat_...`
- [ ] **Shop Domain**: `your-shop.myshopify.com`

#### 📊 HubSpot (Optional)
- [ ] **Access Token**: `pat_...` (private app token)

#### 📅 Google Calendar (Optional)
- [ ] **Client ID**: (from Google Cloud Console)
- [ ] **Client Secret**: (from Google Cloud Console)

---

## 🌐 Deploy to Render

### Step 1: Connect GitHub Repository

1. **Go to Render Dashboard**:
   - Visit [dashboard.render.com](https://dashboard.render.com)
   - Sign up or log in

2. **Connect Repository**:
   - Click **"New +"** → **"Blueprint"**
   - Connect your GitHub account
   - Select the repository: `divhit/bici`
   - Render will automatically detect the `render.yaml` configuration

3. **Review Services**:
   Render will create these services:
   - **bici-api** (Backend API)
   - **bici-frontend** (React app)
   - **bici-worker** (Background tasks)

### Step 2: Configure Environment Variables

For **each service** in your Render dashboard, add these environment variables:

#### 🔧 Core Configuration
```bash
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://bici.onrender.com
API_URL=https://bici-api.onrender.com
```

#### 🤖 ElevenLabs Configuration
```bash
ELEVENLABS_API_KEY=sk_your_actual_api_key_here
ELEVENLABS_AGENT_ID=agent_your_actual_agent_id_here
ELEVENLABS_PHONE_NUMBER_ID=pn_your_actual_phone_number_id_here
ELEVENLABS_WEBHOOK_SECRET=whsec_your_actual_webhook_secret_here
```

#### 📞 Twilio Configuration
```bash
TWILIO_ACCOUNT_SID=AC_your_actual_account_sid_here
TWILIO_AUTH_TOKEN=your_actual_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

#### 🗄️ Database Configuration
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 🔴 Redis Configuration
```bash
REDIS_URL=redis://your-upstash-redis-url
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_actual_token_here
```

#### 🛒 Shopify Configuration (Optional)
```bash
SHOPIFY_ACCESS_TOKEN=shpat_your_actual_token_here
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
```

#### 📊 HubSpot Configuration (Optional)
```bash
HUBSPOT_ACCESS_TOKEN=pat_your_actual_token_here
```

#### 📅 Google Calendar Configuration (Optional)
```bash
GOOGLE_CLIENT_ID=your_actual_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
```

#### 🔐 Security Configuration
```bash
JWT_SECRET=your_super_secure_random_32_character_secret_key_here
ENCRYPTION_KEY=another_32_character_encryption_key_here
WEBHOOK_SECRET=your_webhook_verification_secret_here
```

### Step 3: Deploy Services

1. **Deploy All Services**:
   - Click **"Apply Blueprint"**
   - Render will build and deploy all services automatically
   - Wait for all services to show "Live" status (usually 5-10 minutes)

2. **Monitor Deployment**:
   - Check logs for any errors
   - Verify all services are running
   - Test health endpoints

---

## 🔗 Post-Deployment Configuration

After successful deployment, configure webhook URLs in external services:

### 🤖 ElevenLabs Dashboard Configuration

1. **Go to ElevenLabs Dashboard** → **Conversational AI** → **Your Agent**

2. **Set Webhook URLs**:
   - **Post-call Webhook**: `https://bici-api.onrender.com/api/webhooks/elevenlabs/conversation`
   - **Conversation Events**: `https://bici-api.onrender.com/api/webhooks/elevenlabs/events`

3. **Test Webhook**: Use the test button to verify connectivity

### 📞 Twilio Console Configuration

1. **Go to Twilio Console** → **Phone Numbers** → **Manage** → **Active Numbers**

2. **Configure Webhooks**:
   - **SMS Webhook URL**: `https://bici-api.onrender.com/api/webhooks/twilio/sms`
   - **Voice Webhook**: Configure in ElevenLabs (native integration)

3. **Set HTTP Method**: POST for all webhooks

### 🛒 Shopify Admin Configuration (Optional)

1. **Go to Shopify Admin** → **Settings** → **Notifications**

2. **Set Webhook**:
   - **Order Created**: `https://bici-api.onrender.com/api/webhooks/shopify/orders`
   - **Format**: JSON

### 📊 HubSpot App Configuration (Optional)

1. **Go to HubSpot** → **Settings** → **Integrations** → **Private Apps**

2. **Set Webhook URL**:
   - **Contact Property Changes**: `https://bici-api.onrender.com/api/webhooks/hubspot/contacts`

---

## ✅ Verify Deployment

### 1. Health Checks

Visit these URLs to verify everything is working:

- **API Health**: `https://bici-api.onrender.com/health`
- **Frontend**: `https://bici.onrender.com`
- **Detailed Health**: `https://bici-api.onrender.com/health/detailed`

### 2. Test Login

1. **Go to**: `https://bici.onrender.com`
2. **Login with**:
   - Email: `admin@bici.com`
   - Password: `BiciAI2024!`

### 3. Test API Endpoints

```bash
# Test authentication
curl -X POST https://bici-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bici.com","password":"BiciAI2024!"}'

# Test dashboard data
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://bici-api.onrender.com/api/dashboard/overview
```

---

## 🔧 Environment Variables Reference

### Required Environment Variables (Minimum for Basic Functionality)

```bash
# Core
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://bici.onrender.com
API_URL=https://bici-api.onrender.com

# Security
JWT_SECRET=your_32_character_secret_key
ENCRYPTION_KEY=your_32_character_encryption_key

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# ElevenLabs (Core AI functionality)
ELEVENLABS_API_KEY=sk_your_key
ELEVENLABS_AGENT_ID=agent_your_id

# Twilio (Phone functionality)
TWILIO_ACCOUNT_SID=AC_your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Optional Environment Variables (Extended Functionality)

```bash
# Redis (for better performance)
REDIS_URL=redis://your-upstash-url
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Shopify (order management)
SHOPIFY_ACCESS_TOKEN=shpat_your_token
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com

# HubSpot (CRM integration)
HUBSPOT_ACCESS_TOKEN=pat_your_token

# Google Calendar (appointments)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# ElevenLabs Extended
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_id
ELEVENLABS_WEBHOOK_SECRET=whsec_your_secret

# Additional Security
WEBHOOK_SECRET=your_webhook_secret
CORS_ORIGIN=https://bici.onrender.com
```

---

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. **Build Failed**
- **Check logs** in Render dashboard
- **Verify** all required environment variables are set
- **Ensure** your GitHub repository is up to date

#### 2. **Service Won't Start**
- **Check** the PORT environment variable is set to 3001
- **Verify** database connection strings
- **Check** for missing required environment variables

#### 3. **Webhooks Not Working**
- **Verify** webhook URLs are correctly set in external services
- **Check** webhook endpoint logs in Render
- **Ensure** webhook secrets match

#### 4. **Frontend Can't Connect to API**
- **Check** FRONTEND_URL and API_URL environment variables
- **Verify** CORS settings in backend
- **Check** API service is running

#### 5. **Database Connection Issues**
- **Verify** Supabase URL and keys
- **Check** RLS policies are correctly set
- **Ensure** database schema is deployed

### Debug Commands

```bash
# Check service status
curl https://bici-api.onrender.com/health

# Check detailed health
curl https://bici-api.onrender.com/health/detailed

# Check API documentation
curl https://bici-api.onrender.com/api

# Test authentication
curl -X POST https://bici-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bici.com","password":"BiciAI2024!"}'
```

---

## 📈 Performance Optimization

### After Deployment

1. **Monitor Performance**:
   - Check response times in Render dashboard
   - Monitor error rates
   - Watch resource usage

2. **Scale as Needed**:
   - Upgrade to higher-tier plans for more resources
   - Enable auto-scaling in Render settings
   - Consider adding CDN for frontend

3. **Optimize Database**:
   - Monitor query performance in Supabase
   - Add indexes for frequently queried data
   - Consider connection pooling

---

## 🎯 Success Metrics

After deployment, monitor these key metrics:

- **API Response Time**: < 200ms average
- **Uptime**: > 99.9%
- **Error Rate**: < 0.1%
- **Concurrent Users**: Support for 100+ simultaneous
- **Call Volume**: Handle 2,000+ monthly calls

---

## 🆘 Support

If you encounter issues:

1. **Check Render Logs**: View detailed error logs in dashboard
2. **Review Documentation**: Check `README.md` and `DEPLOYMENT_GUIDE.md`
3. **Test Locally**: Run `npm run dev` to test locally first
4. **Verify Configuration**: Double-check all environment variables

Your **BICI AI Voice Agent System** should now be live and ready to handle customer calls with AI assistance! 🚴‍♂️✨