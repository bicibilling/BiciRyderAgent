# 🚀 BICI AI Voice System - Deployment Guide

## Prerequisites Checklist

Before deploying, ensure you have:

- [ ] **ElevenLabs Account** with Conversational AI access
- [ ] **Twilio Account** with phone number purchased  
- [ ] **Supabase Project** created
- [ ] **Upstash Redis** instance setup
- [ ] **Domain & SSL Certificate** for webhooks
- [ ] **(Optional)** HubSpot, Shopify, Google Calendar API access

## Step-by-Step Deployment

### 1. ElevenLabs Setup

1. **Create Conversational AI Agent:**
   ```
   → Go to elevenlabs.io/conversational-ai
   → Click "Create Agent"  
   → Name: "BICI Bike Store Assistant"
   → Upload knowledge base files from /knowledge-base/
   ```

2. **Configure System Prompt:**
   ```
   You are BICI's AI assistant, a friendly bike store expert.
   
   EXPERTISE: Road bikes, mountain bikes, e-bikes, repairs, maintenance
   ROLE: Help customers find bikes, book appointments, provide info
   LOCATION: Toronto, Ontario - serving Greater Toronto Area
   
   Always be helpful, patient, and professional.
   ```

3. **Enable Twilio Integration:**
   ```
   → In agent settings, enable "Twilio Integration"
   → Set personalization webhook: https://yourdomain.com/api/webhooks/elevenlabs/twilio-personalization  
   → Note your Agent ID and Phone Number ID
   ```

### 2. Twilio Configuration

1. **Purchase Phone Number:**
   ```
   → Go to Twilio Console → Phone Numbers
   → Buy a number with Voice + SMS capabilities
   → Note the phone number (+1XXXXXXXXXX)
   ```

2. **Configure Webhooks:**
   ```
   Voice: Handled automatically by ElevenLabs
   SMS Webhook: https://yourdomain.com/api/webhooks/twilio/sms-incoming
   Status Callback: https://yourdomain.com/api/webhooks/twilio/call-status
   ```

### 3. Database Setup

1. **Create Supabase Project:**
   ```
   → Go to supabase.com → New Project
   → Choose region closest to your users
   → Note Project URL and service role key
   ```

2. **Run Database Schema:**
   ```sql
   -- Copy contents of database/schema.sql
   -- Paste into Supabase SQL Editor
   -- Click "Run" to create all tables and functions
   ```

3. **Verify Tables Created:**
   ```
   ✓ organizations
   ✓ leads  
   ✓ conversations
   ✓ conversation_transcripts
   ✓ appointments
   ✓ sms_messages
   ✓ outbound_calls
   ✓ phone_numbers
   ✓ analytics_events
   ✓ webhook_logs
   ```

### 4. Redis Setup

1. **Create Upstash Redis:**
   ```
   → Go to upstash.com → Create Database
   → Choose region closest to your server
   → Note Redis URL and token
   ```

### 5. Server Deployment

1. **Environment Configuration:**
   ```bash
   cp .env.example .env
   
   # Edit .env with your actual values:
   ELEVENLABS_API_KEY=sk_xxxxx
   ELEVENLABS_AGENT_ID=agent_xxxxx  
   ELEVENLABS_PHONE_NUMBER_ID=pn_xxxxx
   
   TWILIO_ACCOUNT_SID=ACxxxxx
   TWILIO_AUTH_TOKEN=xxxxx
   TWILIO_PHONE_NUMBER=+1234567890
   
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=xxxxx
   
   UPSTASH_REDIS_URL=rediss://xxxxx
   UPSTASH_REDIS_TOKEN=xxxxx
   
   BASE_URL=https://yourdomain.com
   ```

2. **Install Dependencies:**
   ```bash
   npm install --production
   ```

3. **Start Application:**
   ```bash
   # Production with PM2
   npm install -g pm2
   pm2 start server.js --name bici-voice-system
   pm2 startup
   pm2 save
   
   # Or direct
   NODE_ENV=production npm start
   ```

### 6. Verification Steps

1. **Health Check:**
   ```bash
   curl https://yourdomain.com/health
   
   # Should return:
   {
     "status": "healthy",
     "services": {
       "redis": "healthy",
       "elevenlabs": "healthy"
     }
   }
   ```

2. **Test Webhook:**
   ```bash
   curl -X POST https://yourdomain.com/api/webhooks/elevenlabs/twilio-personalization \
     -H "Content-Type: application/json" \
     -d '{
       "caller_id": "+14165551234",
       "called_number": "+14165551234",  
       "agent_id": "your-agent-id"
     }'
   ```

3. **Test Phone Call:**
   ```
   → Call your Twilio number
   → Should connect to ElevenLabs AI
   → AI should respond with personalized greeting
   → Check database for conversation log
   ```

4. **Test SMS:**
   ```
   → Send SMS to your Twilio number  
   → Should receive auto-response
   → Check sms_messages table for log
   ```

## Production Optimization

### SSL/HTTPS Setup
```bash
# Using Certbot (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Nginx Configuration
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support
    location /ws/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Monitoring Setup
```bash
# PM2 Monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30

# System monitoring
sudo apt install htop iotop nethogs

# Log monitoring  
tail -f ~/.pm2/logs/bici-voice-system-out.log
tail -f ~/.pm2/logs/bici-voice-system-error.log
```

## Troubleshooting Deployment

### Common Issues

1. **Webhooks Not Working:**
   ```bash
   # Check if server is accessible
   curl https://yourdomain.com/health
   
   # Check SSL certificate
   openssl s_client -connect yourdomain.com:443
   
   # Check firewall
   sudo ufw status
   sudo ufw allow 443
   ```

2. **Database Connection Errors:**
   ```bash
   # Test Supabase connection
   curl -H "apikey: YOUR_SUPABASE_ANON_KEY" \
     https://YOUR_PROJECT.supabase.co/rest/v1/organizations
   
   # Check service role key
   # Make sure it's the service role, not anon key
   ```

3. **Redis Connection Issues:**
   ```bash
   # Test Redis connection
   redis-cli -u $UPSTASH_REDIS_URL ping
   
   # Check URL format (must include rediss://)
   echo $UPSTASH_REDIS_URL
   ```

4. **ElevenLabs Integration:**
   ```bash
   # Test API key
   curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
     https://api.elevenlabs.io/v1/user
   
   # Verify agent ID exists
   curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
     https://api.elevenlabs.io/v1/convai/agents
   ```

### Performance Tuning

1. **PM2 Cluster Mode:**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'bici-voice-system',
       script: 'server.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production'
       }
     }]
   }
   
   pm2 start ecosystem.config.js
   ```

2. **Database Optimization:**
   ```sql
   -- Add indexes for better performance
   CREATE INDEX CONCURRENTLY idx_conversations_phone_org 
   ON conversations(phone_number_normalized, organization_id);
   
   CREATE INDEX CONCURRENTLY idx_leads_phone_lookup 
   ON leads(phone_number_normalized);
   ```

3. **Redis Memory Optimization:**
   ```bash
   # Set memory policy in Upstash console
   # Recommended: allkeys-lru
   ```

## Go-Live Checklist

- [ ] **Health endpoint** returns healthy status
- [ ] **Phone calls** connect to ElevenLabs AI  
- [ ] **SMS messages** are received and auto-responded
- [ ] **Database logging** works for conversations
- [ ] **Webhook signatures** are validated
- [ ] **SSL certificate** is valid and auto-renews
- [ ] **Monitoring** is setup (PM2, logs)
- [ ] **Backup strategy** for database
- [ ] **Rate limiting** is configured
- [ ] **Error alerting** is setup

## Post-Deployment

### Monitoring Dashboard
Access real-time metrics at:
```
https://yourdomain.com/api/analytics/conversations
```

### Log Analysis
```bash
# View recent errors
pm2 logs bici-voice-system --err --lines 100

# Monitor webhook activity
grep "webhook" ~/.pm2/logs/bici-voice-system-out.log | tail -20

# Check conversation volume
grep "Conversation initiated" ~/.pm2/logs/bici-voice-system-out.log | wc -l
```

### Scaling Considerations
- **>1000 calls/month:** Consider Redis clustering
- **>5000 calls/month:** Add read replicas for analytics
- **>10000 calls/month:** Consider multiple server instances

---

**🎉 Congratulations! Your BICI AI Voice System is now live and ready to handle customer calls!**

For ongoing support, monitor the health endpoint and logs regularly.