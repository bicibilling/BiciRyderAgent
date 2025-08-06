# BICI AI Voice Agent System - Configuration Guide

This guide covers all the environment variables and configuration needed to run the BICI AI Voice Agent System properly.

## Required Environment Variables

### Core Application
```env
# Application Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret-key-here
JWT_EXPIRES_IN=24h

# Default Organization Settings
DEFAULT_ORGANIZATION_ID=bici-demo
DEFAULT_ORGANIZATION_NAME=BICI Bike Store
```

### Database Configuration
```env
# Supabase Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Alternative: Direct PostgreSQL connection
DATABASE_URL=postgresql://username:password@host:port/database
```

### Redis Configuration (Optional - for session management)
```env
# Upstash Redis (recommended for production)
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-upstash-redis-token
```

### ElevenLabs Configuration
```env
# ElevenLabs API
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# ElevenLabs Agent Configuration
ELEVENLABS_AGENT_ID=your-agent-id
ELEVENLABS_PHONE_NUMBER_ID=your-phone-number-id

# ElevenLabs Webhook Secrets (for signature verification)
ELEVENLABS_WEBHOOK_SECRET=your-webhook-secret
ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET=your-conversation-initiation-secret
ELEVENLABS_POST_CALL_WEBHOOK_SECRET=your-post-call-secret
ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET=your-conversation-events-secret
```

### Twilio Configuration
```env
# Twilio API Credentials
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# Twilio Phone Numbers
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_SMS_FROM_NUMBER=+1234567890

# Twilio Webhook Configuration
TWILIO_WEBHOOK_SECRET=your-twilio-webhook-secret
```

### WebSocket Configuration
```env
# WebSocket URL (for frontend connections)
VITE_WS_URL=wss://your-domain.com
# or for development:
VITE_WS_URL=ws://localhost:3000
```

### Frontend Configuration (Vite Environment Variables)
```env
# API Base URL
VITE_API_BASE_URL=https://your-api-domain.com
# or for development:
VITE_API_BASE_URL=http://localhost:3000

# WebSocket URL
VITE_WS_URL=wss://your-api-domain.com
# or for development:
VITE_WS_URL=ws://localhost:3000
```

## ElevenLabs Setup

### 1. Create ElevenLabs Account
1. Sign up at [ElevenLabs](https://elevenlabs.io)
2. Get your API key from the dashboard
3. Create a conversational AI agent
4. Purchase a phone number for inbound/outbound calls

### 2. Configure Agent
Your ElevenLabs agent should be configured with:
- **Voice**: Choose an appropriate voice for your business
- **Knowledge Base**: Upload information about your bike store
- **Tools**: Configure with the following tools:
  - `get_store_hours`
  - `check_inventory`
  - `book_appointment`
  - `create_lead`
  - `transfer_to_human`

### 3. Set Up Webhooks
Configure the following webhooks in ElevenLabs:

**Conversation Initiation:**
- URL: `https://your-domain.com/api/webhooks/elevenlabs/conversation-initiation`
- Secret: Set `ELEVENLABS_CONVERSATION_INITIATION_WEBHOOK_SECRET`

**Post-Call Analysis:**
- URL: `https://your-domain.com/api/webhooks/elevenlabs/post-call`
- Secret: Set `ELEVENLABS_POST_CALL_WEBHOOK_SECRET`

**Conversation Events (Optional):**
- URL: `https://your-domain.com/api/webhooks/elevenlabs/conversation-events`
- Secret: Set `ELEVENLABS_CONVERSATION_EVENTS_WEBHOOK_SECRET`

## Twilio Setup

### 1. Create Twilio Account
1. Sign up at [Twilio](https://twilio.com)
2. Get your Account SID and Auth Token
3. Purchase phone numbers for SMS and voice

### 2. Configure SMS Webhooks
For each SMS-capable phone number:
- **Incoming SMS URL**: `https://your-domain.com/api/webhooks/twilio/sms/incoming`
- **Status Callback URL**: `https://your-domain.com/api/webhooks/twilio/sms/status`

### 3. Configure Voice Webhooks (if using Twilio for voice)
For each voice-capable phone number:
- **Voice URL**: `https://your-domain.com/api/webhooks/twilio/call-status`
- **Status Callback URL**: `https://your-domain.com/api/webhooks/twilio/call-status`

## Database Setup

### Using Supabase (Recommended)
1. Create a new Supabase project
2. Set up the following tables:
   - `leads` - Store lead information
   - `conversations` - Store conversation history
   - `organizations` - Multi-tenant organization data
   - `users` - User authentication and permissions

### Using PostgreSQL
1. Create a PostgreSQL database
2. Run the migration scripts in `/database/migrations/`
3. Set up proper indexes for performance

## Production Deployment Checklist

### Security
- [ ] Use strong, unique values for all secrets
- [ ] Enable HTTPS/WSS in production
- [ ] Configure proper CORS settings
- [ ] Set up rate limiting (already configured)
- [ ] Use environment-specific webhook URLs

### Monitoring
- [ ] Set up logging aggregation
- [ ] Configure health check endpoints
- [ ] Monitor WebSocket connection health
- [ ] Track ElevenLabs API usage and costs

### Performance
- [ ] Configure Redis for session management
- [ ] Set up database connection pooling
- [ ] Enable compression for API responses
- [ ] Configure CDN for frontend assets

## Local Development Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd bici
npm install
cd frontend && npm install
```

### 2. Environment Configuration
```bash
# Copy environment templates
cp .env.example .env
cp frontend/.env.example frontend/.env

# Edit environment variables
vim .env
vim frontend/.env
```

### 3. Start Development Services
```bash
# Start API server
npm run dev

# Start frontend (in another terminal)
cd frontend
npm run dev
```

### 4. Test WebSocket Connection
1. Open browser developer tools
2. Go to Network tab
3. Look for WebSocket connections to verify they're working
4. Check browser console for connection logs

## Troubleshooting

### WebSocket Connection Issues
1. **Check URL format**: Ensure `VITE_WS_URL` uses `ws://` or `wss://` protocol
2. **Verify authentication**: WebSocket requires valid JWT token
3. **Check firewall**: Ensure WebSocket port is accessible
4. **Browser compatibility**: Test in different browsers

### ElevenLabs Integration Issues
1. **API Key validation**: Test API key with a simple API call
2. **Agent ID**: Verify agent ID exists and is active
3. **Phone number**: Ensure phone number is properly configured
4. **Webhook signatures**: Verify webhook secrets are correct

### SMS/Twilio Issues
1. **Phone number format**: Ensure all phone numbers use E.164 format (+1234567890)
2. **Webhook URLs**: Verify webhook URLs are publicly accessible
3. **Rate limits**: Check Twilio rate limits and quotas
4. **Message length**: SMS messages are limited to 1600 characters

### Database Connection Issues
1. **Connection string**: Verify database URL format
2. **Network access**: Ensure database is accessible from server
3. **Migration status**: Check if all migrations have been applied
4. **Connection pooling**: Monitor connection pool usage

## Support

For technical support or questions about this configuration:

1. Check the application logs for specific error messages
2. Verify all environment variables are set correctly
3. Test individual components (WebSocket, ElevenLabs, Twilio) separately
4. Review the webhook endpoints for proper request/response handling

## Security Notes

- **Never commit environment variables to version control**
- **Use different secrets for different environments**
- **Regularly rotate API keys and secrets**
- **Monitor webhook endpoints for suspicious activity**
- **Use proper authentication for all API endpoints**