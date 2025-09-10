const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/webhooks/elevenlabs', require('./webhooks/elevenlabs'));
app.use('/api/webhooks/twilio', require('./webhooks/twilio'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/human-control', require('./routes/humanControl'));
app.use('/api/mcp', require('./routes/mcp'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agent: 'Ryder - Bici AI Teammate',
    version: '1.0.0'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.originalUrl
  });
});

app.listen(PORT, async () => {
  console.log(`🤖 Ryder AI Server running on port ${PORT}`);
  console.log(`📞 Twilio phone number: ${process.env.TWILIO_PHONE_NUMBER}`);
  console.log(`🎯 ElevenLabs Agent ID: ${process.env.ELEVENLABS_AGENT_ID}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  
  // Initialize Redis for zero-latency customer memory (following ElevenLabs best practices)
  try {
    const customerMemory = require('./services/customerMemory');
    await customerMemory.initializeRedis();
  } catch (error) {
    console.log('📦 Redis initialization skipped:', error.message);
  }
});

module.exports = app;