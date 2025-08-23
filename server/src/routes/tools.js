const express = require('express');
const router = express.Router();
const storeHours = require('../services/storeHours');

// Store status tool - returns current store hours and open/closed status
router.get('/store-status', async (req, res) => {
  try {
    const status = storeHours.getCurrentStatus();
    const greeting = storeHours.formatGreeting();
    
    res.json({
      success: true,
      data: {
        ...status,
        greeting,
        storeInfo: {
          name: process.env.STORE_NAME || 'Bici',
          address: process.env.STORE_ADDRESS || '1497 Adanac Street, Vancouver, BC, Canada',
          phone: process.env.STORE_PHONE || '+17787193080',
          website: process.env.STORE_WEBSITE || 'https://www.bici.cc'
        }
      }
    });
  } catch (error) {
    console.error('Store status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store status',
      message: error.message
    });
  }
});

// Lead qualification tool - captures lead information
router.post('/qualify-lead', async (req, res) => {
  try {
    const {
      phoneNumber,
      customerName,
      bikeType,
      budget,
      experience,
      timeline,
      preferredChannel,
      additionalNotes
    } = req.body;

    // Here you would integrate with HubSpot or your CRM
    // For now, just log the lead qualification data
    console.log('Lead qualification received:', {
      phoneNumber,
      customerName,
      bikeType,
      budget,
      experience,
      timeline,
      preferredChannel,
      additionalNotes,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Lead information captured successfully',
      data: {
        leadId: `lead_${Date.now()}`,
        followUpScheduled: timeline === 'soon',
        recommendedActions: [
          bikeType === 'electric' ? 'Schedule e-bike demo' : 'Schedule bike fitting',
          'Send product catalog',
          'Add to newsletter'
        ]
      }
    });
  } catch (error) {
    console.error('Lead qualification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to qualify lead',
      message: error.message
    });
  }
});

// Human handoff request tool - triggers human agent takeover
router.post('/request-human', async (req, res) => {
  try {
    const { phoneNumber, reason, conversationContext } = req.body;
    const status = storeHours.getCurrentStatus();

    if (!status.isOpen) {
      return res.json({
        success: false,
        message: 'No human agents available right now',
        suggestCallback: true,
        nextAvailable: status.nextOpen
      });
    }

    // Here you would integrate with your existing human control system
    // For now, simulate the handoff request
    console.log('Human handoff requested:', {
      phoneNumber,
      reason,
      conversationContext,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Connecting you with a team member now',
      data: {
        transferId: `transfer_${Date.now()}`,
        estimatedWaitTime: '30 seconds',
        agentType: 'sales' // or 'support', 'technical'
      }
    });
  } catch (error) {
    console.error('Human handoff error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request human handoff',
      message: error.message
    });
  }
});

// Callback message tool - takes message for later callback
router.post('/take-message', async (req, res) => {
  try {
    const {
      phoneNumber,
      customerName,
      message,
      preferredCallbackTime,
      urgency = 'normal'
    } = req.body;

    // Here you would integrate with your messaging system
    console.log('Callback message received:', {
      phoneNumber,
      customerName,
      message,
      preferredCallbackTime,
      urgency,
      timestamp: new Date().toISOString()
    });

    // Send confirmation SMS (optional)
    // You could use Twilio here to send an SMS confirmation

    res.json({
      success: true,
      message: `Thanks ${customerName || ''}! I've recorded your message and someone will call you back at ${phoneNumber} during business hours.`,
      data: {
        messageId: `msg_${Date.now()}`,
        callbackScheduled: true,
        confirmationSent: true
      }
    });
  } catch (error) {
    console.error('Take message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to take message',
      message: error.message
    });
  }
});

// Quebec caller detection tool - detects French-speaking callers
router.post('/detect-quebec', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const isQuebec = storeHours.isQuebecAreaCode(phoneNumber);
    
    res.json({
      success: true,
      data: {
        isQuebec,
        suggestedLanguage: isQuebec ? 'fr' : 'en',
        greeting: isQuebec ? 
          'Bonjour, vous avez joint Bici. Je suis Ryder, votre coéquipier IA.' :
          'Hi, you\'ve reached Bici. I\'m Ryder, your AI teammate.'
      }
    });
  } catch (error) {
    console.error('Quebec detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect caller region',
      message: error.message
    });
  }
});

module.exports = router;