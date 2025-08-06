#!/usr/bin/env node

/**
 * Comprehensive API Testing Script for BICI Voice System
 * Tests all the critical API endpoints that were debugged and fixed
 */

const axios = require('axios');
const crypto = require('crypto');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_PHONE = '+14165551234';
const TEST_ORGANIZATION_ID = '550e8400-e29b-41d4-a716-446655440000'; // Valid GUID format

class APITester {
  constructor() {
    this.results = {};
    this.authToken = null;
    this.testUserId = null;
  }

  async runAllTests() {
    console.log('🚴‍♂️ Starting BICI API Endpoint Tests');
    console.log('=====================================\n');

    try {
      // Test basic connectivity
      await this.testHealthEndpoints();
      
      // Test authentication
      await this.testAuthentication();
      
      // Test outbound call endpoint
      await this.testOutboundCall();
      
      // Test human control endpoints
      await this.testHumanControlEndpoints();
      
      // Test SSE streaming endpoint
      await this.testSSEStreaming();
      
      // Test webhook endpoints (simulation)
      await this.testWebhookEndpoints();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return { success: true, status: response.status, data: response.data };
    } catch (error) {
      return {
        success: false,
        status: error.response?.status || 0,
        data: error.response?.data || null,
        error: error.message
      };
    }
  }

  async testHealthEndpoints() {
    console.log('🏥 Testing Health Endpoints...');
    
    // Test health endpoint
    const healthResult = await this.makeRequest('GET', '/health');
    this.results.health = healthResult;
    
    if (healthResult.success) {
      console.log('✅ Health endpoint working');
    } else {
      console.log('❌ Health endpoint failed:', healthResult.error);
    }

    // Test ready endpoint
    const readyResult = await this.makeRequest('GET', '/ready');
    this.results.ready = readyResult;
    
    if (readyResult.success) {
      console.log('✅ Ready endpoint working');
    } else {
      console.log('❌ Ready endpoint failed:', readyResult.error);
    }

    console.log('');
  }

  async testAuthentication() {
    console.log('🔐 Testing Authentication...');
    
    // Mock login request - in production this would be real credentials
    const loginResult = await this.makeRequest('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testpassword123',
      organizationId: TEST_ORGANIZATION_ID
    });

    this.results.login = loginResult;
    
    if (loginResult.success) {
      console.log('✅ Login endpoint working');
      // In a real test, we would extract the token
      // For now, we'll create a mock token for testing protected endpoints
      this.authToken = 'mock-jwt-token-for-testing';
      this.testUserId = 'test-user-123';
    } else {
      console.log('❌ Login failed:', loginResult.error);
      console.log('   Status:', loginResult.status);
      if (loginResult.data) {
        console.log('   Details:', JSON.stringify(loginResult.data, null, 2));
      }
      
      // Create mock token anyway for testing other endpoints
      this.authToken = 'mock-jwt-token-for-testing';
      this.testUserId = 'test-user-123';
    }

    console.log('');
  }

  async testOutboundCall() {
    console.log('📞 Testing Outbound Call Endpoints...');
    
    // Test the NEW correct endpoint that frontend should use
    const callDataNew = {
      phoneNumber: TEST_PHONE,
      leadId: 'test-lead-123',
      dynamicVariables: {
        customer_name: 'Test Customer',
        lead_status: 'new',
        conversation_context: 'No previous conversation'
      },
      priority: 'normal'
    };

    const newCallResult = await this.makeRequest('POST', '/api/calls/outbound/start', callDataNew, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.outboundCallNew = newCallResult;
    
    if (newCallResult.success) {
      console.log('✅ NEW outbound call endpoint (/api/calls/outbound/start) working');
      console.log('   Response:', JSON.stringify(newCallResult.data, null, 2));
    } else {
      console.log('❌ NEW outbound call failed:', newCallResult.error);
      console.log('   Status:', newCallResult.status);
      if (newCallResult.data) {
        console.log('   Details:', JSON.stringify(newCallResult.data, null, 2));
      }
    }

    // Test the OLD endpoint that still exists for backwards compatibility
    const callDataOld = {
      phoneNumber: TEST_PHONE,
      leadId: 'test-lead-123',
      callReason: 'follow_up',
      priority: 'medium',
      customMessage: 'This is a test outbound call'
    };

    const oldCallResult = await this.makeRequest('POST', '/api/conversations/outbound-call', callDataOld, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.outboundCallOld = oldCallResult;
    
    if (oldCallResult.success) {
      console.log('✅ OLD outbound call endpoint (/api/conversations/outbound-call) working');
      console.log('   Response:', JSON.stringify(oldCallResult.data, null, 2));
    } else {
      console.log('❌ OLD outbound call failed:', oldCallResult.error);
      console.log('   Status:', oldCallResult.status);
      if (oldCallResult.data) {
        console.log('   Details:', JSON.stringify(oldCallResult.data, null, 2));
      }
    }

    console.log('');
  }

  async testHumanControlEndpoints() {
    console.log('🧑‍💼 Testing Human Control Endpoints...');
    
    // Test join endpoint
    const joinData = {
      phoneNumber: TEST_PHONE,
      agentName: 'Test Agent',
      leadId: 'test-lead-123',
      handoffReason: 'manual_takeover',
      customMessage: 'Agent taking over for testing'
    };

    const joinResult = await this.makeRequest('POST', '/api/human-control/join', joinData, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.humanControlJoin = joinResult;
    
    if (joinResult.success) {
      console.log('✅ Human control join endpoint working');
    } else {
      console.log('❌ Human control join failed:', joinResult.error);
      console.log('   Status:', joinResult.status);
      if (joinResult.data) {
        console.log('   Details:', JSON.stringify(joinResult.data, null, 2));
      }
    }

    // Test send message endpoint
    const messageData = {
      phoneNumber: TEST_PHONE,
      message: 'This is a test message from human agent',
      leadId: 'test-lead-123',
      messageType: 'text',
      priority: 'normal'
    };

    const messageResult = await this.makeRequest('POST', '/api/human-control/send-message', messageData, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.humanControlMessage = messageResult;
    
    if (messageResult.success) {
      console.log('✅ Human control send-message endpoint working');
    } else {
      console.log('❌ Human control send-message failed:', messageResult.error);
      console.log('   Status:', messageResult.status);
      if (messageResult.data && messageResult.status !== 400) { // 400 expected if not under human control
        console.log('   Details:', JSON.stringify(messageResult.data, null, 2));
      }
    }

    // Test status endpoint
    const statusResult = await this.makeRequest('GET', `/api/human-control/status?phoneNumber=${TEST_PHONE}`, null, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.humanControlStatus = statusResult;
    
    if (statusResult.success) {
      console.log('✅ Human control status endpoint working');
    } else {
      console.log('❌ Human control status failed:', statusResult.error);
      console.log('   Status:', statusResult.status);
      if (statusResult.data) {
        console.log('   Details:', JSON.stringify(statusResult.data, null, 2));
      }
    }

    // Test leave endpoint
    const leaveData = {
      phoneNumber: TEST_PHONE,
      leadId: 'test-lead-123',
      summary: 'Test session ended successfully',
      handoffSuccess: true
    };

    const leaveResult = await this.makeRequest('POST', '/api/human-control/leave', leaveData, {
      'x-organization-id': TEST_ORGANIZATION_ID
    });
    this.results.humanControlLeave = leaveResult;
    
    if (leaveResult.success) {
      console.log('✅ Human control leave endpoint working');
    } else {
      console.log('❌ Human control leave failed:', leaveResult.error);
      console.log('   Status:', leaveResult.status);
      if (leaveResult.data && leaveResult.status !== 400) { // 400 expected if not under human control
        console.log('   Details:', JSON.stringify(leaveResult.data, null, 2));
      }
    }

    console.log('');
  }

  async testSSEStreaming() {
    console.log('📡 Testing SSE Streaming Endpoint...');
    
    // Test the SSE endpoint (this will fail quickly since we can't maintain connection in test)
    const testLeadId = 'test-lead-123';
    const sseUrl = `/api/stream/conversation/${testLeadId}?phoneNumber=${encodeURIComponent(TEST_PHONE)}&load=true&organizationId=${encodeURIComponent(TEST_ORGANIZATION_ID)}&token=mock-jwt-token-for-testing`;
    
    const sseResult = await this.makeRequest('GET', sseUrl);
    this.results.sseStreaming = sseResult;
    
    if (sseResult.success || sseResult.status === 401) { // 401 expected due to mock token
      console.log('✅ SSE streaming endpoint responding (401 expected with mock token)');
      if (sseResult.status === 401) {
        console.log('   Note: Authentication required for SSE, which is correct');
      }
    } else {
      console.log('❌ SSE streaming endpoint failed:', sseResult.error);
      console.log('   Status:', sseResult.status);
      if (sseResult.data) {
        console.log('   Details:', JSON.stringify(sseResult.data, null, 2));
      }
    }

    console.log('');
  }

  async testWebhookEndpoints() {
    console.log('🔗 Testing Webhook Endpoints...');
    
    // Test ElevenLabs conversation initiation webhook
    const elevenLabsInitData = {
      caller_id: TEST_PHONE,
      conversation_id: 'test-conversation-123',
      client_data: {
        organization_id: TEST_ORGANIZATION_ID
      }
    };

    const elevenLabsResult = await this.makeRequest(
      'POST', 
      '/api/webhooks/elevenlabs/conversation-initiation', 
      elevenLabsInitData
    );
    this.results.elevenLabsWebhook = elevenLabsResult;
    
    if (elevenLabsResult.success) {
      console.log('✅ ElevenLabs conversation-initiation webhook working');
    } else {
      console.log('❌ ElevenLabs webhook failed:', elevenLabsResult.error);
      console.log('   Status:', elevenLabsResult.status);
      if (elevenLabsResult.data) {
        console.log('   Details:', JSON.stringify(elevenLabsResult.data, null, 2));
      }
    }

    // Test Twilio SMS incoming webhook
    const twilioSMSData = {
      From: TEST_PHONE,
      To: '+14165551235',
      Body: 'This is a test SMS message',
      MessageSid: 'SM' + Date.now().toString(36).toUpperCase(),
      FromCity: 'Toronto',
      FromState: 'ON',
      FromCountry: 'CA',
      NumMedia: '0'
    };

    const twilioResult = await this.makeRequest(
      'POST', 
      '/api/webhooks/twilio/sms/incoming', 
      twilioSMSData,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
    this.results.twilioSMSWebhook = twilioResult;
    
    if (twilioResult.success) {
      console.log('✅ Twilio SMS incoming webhook working');
    } else {
      console.log('❌ Twilio SMS webhook failed:', twilioResult.error);
      console.log('   Status:', twilioResult.status);
      if (twilioResult.data) {
        console.log('   Details:', JSON.stringify(twilioResult.data, null, 2));
      }
    }

    console.log('');
  }

  printResults() {
    console.log('📊 Test Results Summary');
    console.log('=======================\n');

    const endpoints = [
      { name: 'Health Check', key: 'health', critical: true },
      { name: 'Ready Check', key: 'ready', critical: true },
      { name: 'Authentication', key: 'login', critical: true },
      { name: 'NEW Outbound Call (/api/calls/outbound/start)', key: 'outboundCallNew', critical: true },
      { name: 'OLD Outbound Call (/api/conversations/outbound-call)', key: 'outboundCallOld', critical: false },
      { name: 'Human Control Join', key: 'humanControlJoin', critical: true },
      { name: 'Human Control Send Message', key: 'humanControlMessage', critical: false },
      { name: 'Human Control Status', key: 'humanControlStatus', critical: true },
      { name: 'Human Control Leave', key: 'humanControlLeave', critical: false },
      { name: 'SSE Streaming', key: 'sseStreaming', critical: true },
      { name: 'ElevenLabs Webhook', key: 'elevenLabsWebhook', critical: true },
      { name: 'Twilio SMS Webhook', key: 'twilioSMSWebhook', critical: true }
    ];

    let passCount = 0;
    let criticalFailures = 0;

    endpoints.forEach(endpoint => {
      const result = this.results[endpoint.key];
      const status = result?.success ? '✅ PASS' : '❌ FAIL';
      const statusCode = result?.status || 'N/A';
      
      if (result?.success) {
        passCount++;
      } else if (endpoint.critical) {
        criticalFailures++;
      }

      console.log(`${status} ${endpoint.name.padEnd(25)} (${statusCode})`);
    });

    console.log('');
    console.log(`Total Tests: ${endpoints.length}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${endpoints.length - passCount}`);
    console.log(`Critical Failures: ${criticalFailures}`);

    if (criticalFailures > 0) {
      console.log('\n❌ CRITICAL ISSUES DETECTED');
      console.log('The following critical endpoints are not working:');
      endpoints.forEach(endpoint => {
        if (endpoint.critical && !this.results[endpoint.key]?.success) {
          console.log(`- ${endpoint.name}`);
        }
      });
    } else {
      console.log('\n✅ ALL CRITICAL ENDPOINTS WORKING');
    }

    // Show detailed error information for failures
    const failures = endpoints.filter(ep => !this.results[ep.key]?.success);
    if (failures.length > 0) {
      console.log('\n🔍 Failure Details:');
      console.log('==================');
      failures.forEach(endpoint => {
        const result = this.results[endpoint.key];
        console.log(`\n${endpoint.name}:`);
        console.log(`  Status: ${result?.status || 'No Response'}`);
        console.log(`  Error: ${result?.error || 'Unknown'}`);
        if (result?.data) {
          console.log(`  Response: ${JSON.stringify(result.data, null, 4)}`);
        }
      });
    }
  }
}

// Main execution
if (require.main === module) {
  const tester = new APITester();
  tester.runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = APITester;