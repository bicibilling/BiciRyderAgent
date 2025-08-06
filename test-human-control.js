#!/usr/bin/env node

/**
 * Test Script for Human Control API System
 * Tests all human-in-the-loop API endpoints
 */

const axios = require('axios');

class HumanControlTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3000';
    this.token = null;
    this.organizationId = 'bici-demo';
    this.testPhoneNumber = '+15551234567';
    this.testLeadId = 'test_lead_123';
    this.sessionId = null;
  }
  
  /**
   * Run all tests
   */
  async runTests() {
    console.log('🧪 Starting Human Control API Tests\n');
    
    try {
      // Step 1: Authenticate
      await this.authenticate();
      
      // Step 2: Test status check (no active session)
      await this.testStatusCheck();
      
      // Step 3: Test joining human control
      await this.testJoinHumanControl();
      
      // Step 4: Test sending message as human agent
      await this.testSendMessage();
      
      // Step 5: Test status check (active session)
      await this.testStatusCheckActive();
      
      // Step 6: Test message queue
      await this.testMessageQueue();
      
      // Step 7: Test leaving human control
      await this.testLeaveHumanControl();
      
      // Step 8: Test status check (after leaving)
      await this.testStatusCheckAfterLeave();
      
      console.log('\n✅ All Human Control API tests passed!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      process.exit(1);
    }
  }
  
  /**
   * Authenticate and get access token
   */
  async authenticate() {
    console.log('🔐 Authenticating...');
    
    try {
      // First try to create a test user (might fail if exists)
      await axios.post(`${this.baseURL}/api/auth/register`, {
        email: 'test.agent@bici.com',
        password: 'TestAgent123!',
        confirmPassword: 'TestAgent123!',
        firstName: 'Test',
        lastName: 'Agent',
        organizationId: this.organizationId,
        role: 'agent'
      });
      console.log('   Test user created');
    } catch (error) {
      // User might already exist, continue
      console.log('   Using existing test user');
    }
    
    // Login
    const response = await axios.post(`${this.baseURL}/api/auth/login`, {
      email: 'test.agent@bici.com',
      password: 'TestAgent123!',
      organizationId: this.organizationId
    });
    
    this.token = response.data.data.accessToken;
    console.log('   ✅ Authenticated successfully\n');
  }
  
  /**
   * Test status check with no active session
   */
  async testStatusCheck() {
    console.log('📊 Testing status check (no active session)...');
    
    const response = await axios.get(
      `${this.baseURL}/api/human-control/status?phoneNumber=${this.testPhoneNumber}`,
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (data.isUnderHumanControl !== false) {
      throw new Error('Expected isUnderHumanControl to be false');
    }
    
    if (data.session !== null) {
      throw new Error('Expected session to be null');
    }
    
    console.log('   ✅ Status check passed (no session)\n');
  }
  
  /**
   * Test joining human control
   */
  async testJoinHumanControl() {
    console.log('🧑‍💼 Testing human control join...');
    
    const response = await axios.post(
      `${this.baseURL}/api/human-control/join`,
      {
        phoneNumber: this.testPhoneNumber,
        agentName: 'Test Agent',
        leadId: this.testLeadId,
        handoffReason: 'manual_takeover',
        customMessage: 'Hello! I\'m a human agent and I\'m here to help you.'
      },
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (!data.session) {
      throw new Error('Expected session data');
    }
    
    if (data.session.phoneNumber !== this.testPhoneNumber.replace(/[^\d]/g, '')) {
      throw new Error('Phone number mismatch in session');
    }
    
    if (data.session.agentName !== 'Test Agent') {
      throw new Error('Agent name mismatch in session');
    }
    
    this.sessionId = data.session.sessionId;
    console.log(`   ✅ Joined human control session: ${this.sessionId}\n`);
  }
  
  /**
   * Test sending message as human agent
   */
  async testSendMessage() {
    console.log('💬 Testing send message as human agent...');
    
    const response = await axios.post(
      `${this.baseURL}/api/human-control/send-message`,
      {
        phoneNumber: this.testPhoneNumber,
        message: 'This is a test message from the human agent.',
        leadId: this.testLeadId,
        messageType: 'text',
        priority: 'normal'
      },
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (!data.messageId) {
      throw new Error('Expected messageId in response');
    }
    
    if (data.phoneNumber !== this.testPhoneNumber) {
      throw new Error('Phone number mismatch in send message response');
    }
    
    console.log(`   ✅ Message sent successfully: ${data.messageId}\n`);
  }
  
  /**
   * Test status check with active session
   */
  async testStatusCheckActive() {
    console.log('📊 Testing status check (active session)...');
    
    const response = await axios.get(
      `${this.baseURL}/api/human-control/status?phoneNumber=${this.testPhoneNumber}&includeAgentSessions=true`,
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (data.isUnderHumanControl !== true) {
      throw new Error('Expected isUnderHumanControl to be true');
    }
    
    if (!data.session) {
      throw new Error('Expected session data');
    }
    
    if (data.session.sessionId !== this.sessionId) {
      throw new Error('Session ID mismatch');
    }
    
    if (!data.agentSessions || data.agentSessions.total === 0) {
      throw new Error('Expected agent sessions data');
    }
    
    console.log('   ✅ Status check passed (active session)\n');
  }
  
  /**
   * Test message queue
   */
  async testMessageQueue() {
    console.log('📥 Testing message queue...');
    
    const response = await axios.get(
      `${this.baseURL}/api/human-control/queue/${this.testPhoneNumber}`,
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (!data.messages) {
      throw new Error('Expected messages array');
    }
    
    if (data.sessionId !== this.sessionId) {
      throw new Error('Session ID mismatch in queue response');
    }
    
    console.log(`   ✅ Queue check passed (${data.messages.length} messages)\n`);
  }
  
  /**
   * Test leaving human control
   */
  async testLeaveHumanControl() {
    console.log('🚪 Testing human control leave...');
    
    const response = await axios.post(
      `${this.baseURL}/api/human-control/leave`,
      {
        phoneNumber: this.testPhoneNumber,
        leadId: this.testLeadId,
        summary: 'Test session completed successfully. Customer inquiry resolved.',
        nextSteps: ['Follow up in 24 hours', 'Send product brochure'],
        handoffSuccess: true
      },
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (!data.session) {
      throw new Error('Expected session data in leave response');
    }
    
    if (data.session.sessionId !== this.sessionId) {
      throw new Error('Session ID mismatch in leave response');
    }
    
    if (data.session.status !== 'ended') {
      throw new Error('Expected session status to be ended');
    }
    
    console.log(`   ✅ Left human control session successfully\n`);
  }
  
  /**
   * Test status check after leaving
   */
  async testStatusCheckAfterLeave() {
    console.log('📊 Testing status check (after leaving)...');
    
    const response = await axios.get(
      `${this.baseURL}/api/human-control/status?phoneNumber=${this.testPhoneNumber}`,
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    
    const { data } = response.data;
    
    if (data.isUnderHumanControl !== false) {
      throw new Error('Expected isUnderHumanControl to be false after leaving');
    }
    
    if (data.session !== null) {
      throw new Error('Expected session to be null after leaving');
    }
    
    console.log('   ✅ Status check passed (after leaving)\n');
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  const tester = new HumanControlTester();
  tester.runTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = HumanControlTester;