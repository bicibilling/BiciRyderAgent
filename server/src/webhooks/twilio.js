const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Twilio webhook signature verification
function verifyTwilioSignature(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];
  
  if (!authToken || !twilioSignature) {
    console.log('Missing Twilio auth token or signature');
    return next(); // Skip verification in development
  }

  const url = `https://${req.headers.host}${req.originalUrl}`;
  const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid Twilio signature' });
  }

  next();
}

// Incoming call webhook
router.post('/voice', verifyTwilioSignature, async (req, res) => {
  try {
    const { From, To, CallSid } = req.body;
    
    console.log('📞 Incoming call:', {
      from: From,
      to: To,
      callSid: CallSid,
      timestamp: new Date().toISOString()
    });

    // Check if caller is from Quebec for French language
    const storeHours = require('../services/storeHours');
    const isQuebec = storeHours.isQuebecAreaCode(From);
    
    // Create TwiML response to connect to ElevenLabs
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Option 1: Direct ElevenLabs integration (if available)
    // This would require ElevenLabs to support direct Twilio integration
    
    // Option 2: Use Twilio's Connect verb to bridge to ElevenLabs
    // For now, we'll use a simple greeting and then connect
    
    twiml.say({
      voice: 'alice',
      language: isQuebec ? 'fr-CA' : 'en-CA'
    }, isQuebec ? 
      'Bonjour, vous avez joint Bici. Veuillez patienter pendant que nous vous connectons à Ryder, votre coéquipier IA.' :
      'Hi, you\'ve reached Bici. Please hold while we connect you to Ryder, your AI teammate.'
    );
    
    // In a real implementation, you would:
    // 1. Connect to ElevenLabs conversational AI
    // 2. Pass caller information as context
    // 3. Handle the conversation flow
    
    // For now, we'll redirect to a status callback
    twiml.redirect(`https://${req.headers.host}/api/webhooks/twilio/connect-agent`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Twilio voice webhook error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we\'re experiencing technical difficulties. Please try calling back later.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Connect to ElevenLabs agent
router.post('/connect-agent', verifyTwilioSignature, async (req, res) => {
  try {
    const { From, CallSid } = req.body;
    
    console.log('🤖 Connecting to AI agent:', {
      from: From,
      callSid: CallSid
    });

    // Here you would integrate with ElevenLabs conversational AI
    // This might involve:
    // 1. Starting an ElevenLabs conversation session
    // 2. Streaming audio between Twilio and ElevenLabs
    // 3. Handling real-time conversation flow
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Placeholder implementation
    twiml.say({
      voice: 'alice',
      language: 'en-CA'
    }, 'This is a development version. Ryder AI integration is in progress. Thank you for calling Bici!');
    
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Connect agent error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we couldn\'t connect you to our AI teammate. Please try again later.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Incoming SMS webhook
router.post('/sms', verifyTwilioSignature, async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;
    
    console.log('💬 Incoming SMS:', {
      from: From,
      to: To,
      body: Body,
      messageSid: MessageSid,
      timestamp: new Date().toISOString()
    });

    // Handle SMS messages
    // This could be used for:
    // 1. Follow-up messages after calls
    // 2. Appointment confirmations
    // 3. Order status updates
    
    const storeHours = require('../services/storeHours');
    const status = storeHours.getCurrentStatus();
    
    let responseMessage;
    
    if (Body.toLowerCase().includes('hours')) {
      responseMessage = `Bici hours: ${status.greeting}. Call us at ${process.env.STORE_PHONE} or visit www.bici.cc`;
    } else if (Body.toLowerCase().includes('location') || Body.toLowerCase().includes('address')) {
      responseMessage = `We're located at ${process.env.STORE_ADDRESS}. Visit www.bici.cc for directions!`;
    } else {
      responseMessage = status.isOpen ? 
        'Thanks for texting Bici! We\'re open now - give us a call or visit our store. For immediate help, call us!' :
        `Thanks for texting Bici! We're currently closed. ${status.greeting}. We'll respond during business hours.`;
    }

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(responseMessage);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Twilio SMS webhook error:', error);
    
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Sorry, we couldn\'t process your message. Please try calling us directly.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Call status callback
router.post('/status', verifyTwilioSignature, async (req, res) => {
  try {
    const { CallSid, CallStatus, From, To, Duration } = req.body;
    
    console.log('📊 Call status update:', {
      callSid: CallSid,
      status: CallStatus,
      from: From,
      to: To,
      duration: Duration,
      timestamp: new Date().toISOString()
    });

    // Log call metrics for analytics
    // This data can be used for:
    // 1. Call volume analysis
    // 2. Response time metrics
    // 3. Customer engagement tracking
    
    res.status(200).json({
      success: true,
      message: 'Call status logged'
    });
  } catch (error) {
    console.error('Call status error:', error);
    res.status(500).json({
      error: 'Failed to log call status',
      message: error.message
    });
  }
});

// Health check for Twilio webhooks
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Twilio Webhooks',
    phone_number: process.env.TWILIO_PHONE_NUMBER,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;