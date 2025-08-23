# Ryder AI Agent - Bici Customer Service

A production-ready AI customer service agent for Bici bike shop, built with ElevenLabs Conversational AI, integrated with Twilio telephony and a professional management dashboard.

## 🤖 Agent Overview

**Ryder** is Bici's AI teammate that handles:
- Store hours and location inquiries
- Human agent handoffs during business hours  
- Message taking when closed or lines are busy
- Lead qualification for bike purchases
- French language support for Quebec callers
- Professional, brand-consistent customer service

## 🚀 Quick Start

### Prerequisites
- Node.js 16.0.0 or higher
- ElevenLabs API key
- Twilio account (optional for full telephony)

### 1. Environment Setup
```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start the Services
```bash
# Install dependencies and start everything
npm run install:all

# Start server (API and webhooks)
npm run server:dev

# Start dashboard (in another terminal)
npm run client:dev
```

### 3. Access the Dashboard
- Dashboard: http://localhost:3000
- API Health: http://localhost:3002/health
- Phone Number: **+1 (604) 670-0262**

## 📱 Current Setup

### ✅ What's Working Now
- **Ryder AI Agent**: Fully configured with proper personality and responses
- **Professional Dashboard**: Real-time monitoring and testing interface
- **API Endpoints**: Complete webhook and tool integrations
- **Testing Framework**: 10 core prompt validation tests
- **Twilio Phone Number**: +1 (604) 670-0262 (purchased and configured)

### 🔧 What You Need to Configure
1. **Add your API keys to .env file**
2. **Set up Supabase database** (optional for conversation storage)
3. **Configure HubSpot integration** (optional for CRM)
4. **Set up domain/hosting** for production webhooks

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Twilio        │◄──►│   Express.js     │◄──►│  ElevenLabs     │
│   Phone System  │    │   Webhook Server │    │  Ryder Agent    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │  React Dashboard │    │  MCP Servers    │
                    │  (Port 3000)     │    │  Integration    │
                    └──────────────────┘    └─────────────────┘
```

## 🧪 Testing Framework

### Run Core Tests
```bash
# Run all 10 fundamental behavior tests
node run-tests.js

# Test individual prompts via dashboard
# Navigate to "Agent Testing" tab in http://localhost:3000
```

### Test Categories
1. **Store Hours** - Weekday/weekend open/closed scenarios
2. **Human Handoff** - Business hours vs after hours
3. **Message Taking** - Callback request handling
4. **French Language** - Quebec caller detection
5. **Lead Qualification** - Bike interest conversations

### Success Criteria
- 8/10 tests must pass with 80% score
- Average response time under 2 seconds
- Professional tone and accurate information

## 🎯 Agent Configuration

Ryder uses **ElevenLabs CLI** for professional "agents as code" management:

```bash
# View current configuration
convai status --env dev

# Make changes to agent
# Edit: agent_configs/dev/ryder-bici-ai.json

# Deploy changes
convai sync --env dev

# Test changes
convai widget "Ryder - Bici AI Teammate" --env dev
```

## 📊 Dashboard Features

### Overview Tab
- **Real-time Status**: Agent, store, phone number status
- **Quick Stats**: Call volume, resolution rate, response time
- **Store Context**: Current hours, location, contact info

### Agent Testing Tab  
- **Interactive Testing**: Send messages directly to Ryder
- **Quick Test Buttons**: Pre-built common scenarios
- **Response History**: Track test results and performance
- **Real-time Feedback**: Response times and success metrics

### Analytics Tab
- **Performance Metrics**: Resolution rates, accuracy, satisfaction
- **Top Queries**: Most common customer questions  
- **Call Statistics**: Volume trends and patterns
- **Store Context Integration**: Hours, location, phone number

### Settings Tab
- **Agent Configuration**: Current model, voice, prompt settings
- **System Information**: Agent ID, uptime, version details
- **CLI Instructions**: How to update agent via ElevenLabs CLI

## 🛠️ Advanced Configuration

### Store Hours Management
Edit `server/src/services/storeHours.js` to:
- Add holiday overrides
- Modify business hours
- Customize greeting messages

### Agent Personality Updates
Edit `agent_configs/dev/ryder-bici-ai.json` to modify:
- System prompt and behaviors
- Voice settings and style
- Tool integrations
- Response parameters

### Webhook Integrations
Located in `server/src/webhooks/`:
- **ElevenLabs**: Conversation events, human handoffs
- **Twilio**: Incoming calls, SMS messages

## 🔧 Development

### File Structure
```
bici-cli-agent/
├── agent_configs/          # ElevenLabs agent definitions
├── server/                 # Express.js API and webhooks
│   ├── src/routes/        # API endpoints
│   ├── src/webhooks/      # ElevenLabs & Twilio handlers
│   └── src/services/      # Business logic
├── client/                 # React dashboard
│   ├── src/components/    # UI components
│   └── src/services/      # API client
├── mcp-servers/           # Model Context Protocol servers
├── test-prompts.json      # Core test scenarios
├── run-tests.js          # Automated test runner
└── .env                  # Environment configuration
```

### Adding New Features
1. **Agent Behaviors**: Update agent_configs and sync with ElevenLabs CLI
2. **API Endpoints**: Add routes in server/src/routes/
3. **Dashboard Features**: Add components in client/src/components/
4. **Tests**: Add new scenarios to test-prompts.json

## 📞 Production Deployment

### Phone Integration
- **Phone Number**: +1 (604) 670-0262 (already purchased)
- **Twilio Webhooks**: Configure to point to your production domain
- **ElevenLabs Integration**: Set up direct Twilio-ElevenLabs connection

### Hosting Requirements
- **Server**: Node.js hosting with webhook support
- **Database**: Supabase for conversation storage (optional)
- **Domain**: HTTPS required for production webhooks
- **Monitoring**: Error tracking and uptime monitoring

### Environment Variables for Production
Update `.env` with production values:
- Domain/webhook URLs
- Production API keys
- Database connections
- Monitoring endpoints

## 🎨 Branding

The dashboard uses **Bici's professional brand colors**:
- Primary Blue: `#2B5AA0`
- Secondary Blue-Green: `#4A90A4`  
- Neutral Gray: `#F8F9FA`
- Professional typography with Inter font

## 📈 Monitoring & Analytics

### Real-time Metrics
- Call volume and resolution rates
- Agent response times
- Customer satisfaction scores
- Human handoff frequency

### Logging
- All conversations logged with ElevenLabs
- Webhook events tracked in server console
- Test results saved with timestamps

## 🔐 Security

### API Key Management
- Environment-based configuration
- Webhook signature verification
- Secure MCP server communication

### Data Privacy
- 30-day voice recording retention
- PII handling compliance
- Configurable data deletion policies

## 🆘 Troubleshooting

### Common Issues

**Agent Not Responding**
```bash
# Check agent status
curl http://localhost:3002/api/agent/status

# Verify ElevenLabs connection
convai status --env dev
```

**Dashboard Connection Issues**
```bash
# Check server health
curl http://localhost:3002/health

# Restart services
npm run server:dev
npm run client:dev
```

**Test Failures**
```bash
# Run individual tests
node run-tests.js

# Check agent configuration
convai templates show customer-service
```

## 🎯 Next Steps

1. **Fill in your API keys** in `.env` file
2. **Test Ryder** using the dashboard at http://localhost:3000
3. **Run the test suite** with `node run-tests.js`
4. **Configure Supabase** for conversation storage (optional)
5. **Set up production hosting** with your domain
6. **Connect Twilio webhooks** to your production server
7. **Go live** with Ryder handling customer calls!

## 📞 Support

- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:3002/health  
- **Phone Number**: +1 (604) 670-0262
- **Store Info**: 1497 Adanac Street, Vancouver, BC

---

**Ryder is ready to help Bici customers! 🚴‍♂️🤖**