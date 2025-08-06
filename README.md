# 🚴‍♂️ BICI AI Voice Agent System

A complete, production-ready AI phone system for bike stores using ElevenLabs and Twilio, designed to handle 2,000+ monthly calls with <50% human intervention while capturing every interaction as a qualified lead.

## 🎯 Features

- **🤖 AI Voice Agent**: ElevenLabs conversational AI with bike store expertise
- **📞 Phone Integration**: Twilio native integration with SMS automation
- **👥 Human Takeover**: Seamless AI-to-human transitions with full context
- **📊 Real-time Dashboard**: Live call monitoring and analytics
- **🔄 Multi-channel**: Voice + SMS with conversation continuity
- **🏪 Multi-tenant**: Support for multiple bike store locations
- **📈 Analytics**: Comprehensive performance tracking and reporting
- **🌐 Bilingual**: English/French support with auto-detection

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS (BICI brand theme)
- **Backend**: Node.js + Express + WebSocket
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Cache**: Redis (Upstash) for session management
- **AI**: ElevenLabs Conversational AI with RAG knowledge base
- **Telephony**: Twilio native integration
- **Integrations**: Shopify, HubSpot, Google Calendar

## 🚀 Quick Start

### Prerequisites

1. **API Keys Required**:
   - ElevenLabs API key and Agent ID
   - Twilio Account SID and Auth Token
   - Shopify Access Token
   - HubSpot Private App Token
   - Google Calendar API credentials
   - Supabase project URL and keys

### Local Development

1. **Clone and Install**:
   ```bash
   git clone https://github.com/divhit/bici.git
   cd bici
   npm install
   ```

2. **Environment Setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start Development**:
   ```bash
   npm run dev
   ```

4. **Access Dashboard**:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - Login: admin@bici.com / BiciAI2024!

## 🌐 Render Deployment

### 1. Deploy to Render

1. **Connect Repository**:
   - Go to [render.com](https://render.com)
   - Connect this GitHub repository
   - Render will detect the `render.yaml` configuration

2. **Set Environment Variables** (see full list below)

3. **Deploy Services**:
   - Backend API service
   - Frontend static site
   - Background worker

### 2. Required Environment Variables

Add these in your Render dashboard:

#### Core Configuration
```
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app.onrender.com
API_URL=https://your-api.onrender.com
```

#### ElevenLabs Configuration
```
ELEVENLABS_API_KEY=sk_your_api_key
ELEVENLABS_AGENT_ID=agent_your_id
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_id
ELEVENLABS_WEBHOOK_SECRET=whsec_your_secret
```

#### Twilio Configuration
```
TWILIO_ACCOUNT_SID=AC_your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

#### Database Configuration
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

#### Redis Configuration
```
REDIS_URL=redis://your-upstash-redis-url
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

#### Integrations
```
SHOPIFY_ACCESS_TOKEN=shpat_your_token
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
HUBSPOT_ACCESS_TOKEN=pat_your_token
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret
```

#### Security
```
JWT_SECRET=your_super_secure_secret_key
ENCRYPTION_KEY=your_32_character_encryption_key
WEBHOOK_SECRET=your_webhook_secret
```

### 3. Post-Deployment Configuration

After deployment, update webhook URLs in external services:

#### ElevenLabs Dashboard
- **Post-call Webhook**: `https://your-api.onrender.com/api/webhooks/elevenlabs/conversation`
- **Conversation Events**: `https://your-api.onrender.com/api/webhooks/elevenlabs/events`

#### Twilio Console
- **SMS Webhook**: `https://your-api.onrender.com/api/webhooks/twilio/sms`
- **Voice Webhook**: Configure in ElevenLabs (native integration)

#### Shopify Admin
- **Order Webhook**: `https://your-api.onrender.com/api/webhooks/shopify/orders`

#### HubSpot App Settings
- **Webhook URL**: `https://your-api.onrender.com/api/webhooks/hubspot/contacts`

## 📋 SOW Compliance

✅ **Handle 2,000+ monthly calls**  
✅ **<50% human intervention**  
✅ **100% lead capture**  
✅ **Multi-tenant architecture**  
✅ **Real-time dashboard**  
✅ **All required integrations**  
✅ **Bilingual support (EN/FR)**  

## 📊 Call Distribution Handling

- **53% Sales/Product Information** → AI automation with RAG knowledge base
- **18% Order Status/Support** → Real-time Shopify integration
- **14% Service Appointments** → Google Calendar booking
- **15% Human Escalation** → Intelligent routing with context transfer

## 🔧 Development

### Project Structure
```
├── frontend/          # React TypeScript app
├── src/              # Backend API server
├── database/         # Supabase schema and migrations
├── scripts/          # Deployment and setup scripts
├── docs/             # Documentation
└── render.yaml       # Render deployment config
```

### API Endpoints
- `POST /api/auth/login` - Authentication
- `GET /api/dashboard/overview` - Dashboard data
- `GET /api/conversations` - Conversation history
- `POST /api/conversations/:id/takeover` - Human takeover
- `GET /api/analytics/overview` - Performance metrics

### WebSocket Events
- `conversation_started` - New call initiated
- `human_takeover` - Agent takes control
- `ai_resumed` - AI resumes control
- `conversation_ended` - Call completed

## 🛡️ Security Features

- **Multi-tenant data isolation** with RLS
- **JWT authentication** with refresh tokens
- **Rate limiting** on all endpoints
- **Input validation** and sanitization
- **Webhook signature verification**
- **HTTPS enforcement**
- **Security headers** (XSS, CSRF protection)

## 📈 Monitoring

- **Health Checks**: `/health`, `/ready`
- **Metrics**: Real-time performance tracking
- **Logging**: Structured JSON logs
- **Alerts**: Automated monitoring and notifications

## 🆘 Support

For deployment issues or questions:
1. Check the comprehensive `DEPLOYMENT_GUIDE.md`
2. Review environment variable configuration
3. Verify webhook URLs are correctly set
4. Check service health at `/health` endpoint

## 📝 License

Copyright © 2024 BICI. All rights reserved.