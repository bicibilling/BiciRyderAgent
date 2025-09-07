/**
 * End-to-End Webhook Flow Redis Tests
 * Tests complete webhook flows with Redis caching
 */

import request from 'supertest';
import { LeadService } from '../../services/lead.service';
import { ConversationService } from '../../services/conversation.service';
import { CallSessionService } from '../../services/callSession.service';
import { RedisTestUtils, WebhookTestUtils, PerformanceMeasurer } from '../helpers/test-utils';
import { enableRedisForTest, resetTestEnv, TEST_ENV } from '../setup';
import crypto from 'crypto';

// Mock Express app for testing
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

describe('End-to-End Webhook Flow with Redis', () => {
  let leadService: LeadService;
  let conversationService: ConversationService;
  let callSessionService: CallSessionService;
  let redisUtils: RedisTestUtils;
  let performanceMeasurer: PerformanceMeasurer;

  beforeEach(() => {
    leadService = new LeadService();
    conversationService = new ConversationService();
    callSessionService = new CallSessionService();
    redisUtils = new RedisTestUtils();
    performanceMeasurer = new PerformanceMeasurer();
    resetTestEnv();
  });

  afterEach(async () => {
    await redisUtils.cleanup();
    performanceMeasurer.clear();
  });

  describe('ElevenLabs Webhook Flow', () => {
    test('conversation_initiation webhook with Redis caching', async () => {
      console.log('🎯 Testing conversation_initiation webhook with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17781234567';
      const payload = WebhookTestUtils.createConversationInitiationPayload(testPhone);

      // Simulate conversation initiation webhook
      const measureEnd = performanceMeasurer.start('webhook-conversation-initiation');
      
      // This simulates what happens in the actual webhook handler
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const context = await conversationService.buildConversationContext(lead.id);
      const dynamicVariables = await conversationService.generateDynamicVariables(lead.id, 'voice');

      const responseTime = measureEnd();

      // Validate webhook response structure
      expect(lead).toBeDefined();
      expect(lead.phone_number).toBe(testPhone);
      
      expect(context).toHaveProperty('customer_context');
      expect(context).toHaveProperty('business_context');
      expect(context).toHaveProperty('conversation_history');
      
      expect(dynamicVariables).toHaveProperty('dynamic_greeting');
      expect(dynamicVariables).toHaveProperty('customer_name');
      expect(dynamicVariables).toHaveProperty('customer_tier');
      
      // Should meet webhook timeout requirements
      expect(responseTime).toBeLessThan(100); // 100ms ElevenLabs timeout
      
      console.log(`✅ Webhook response time: ${responseTime}ms`);

      // Second call should be faster (cached)
      const measureEnd2 = performanceMeasurer.start('webhook-conversation-initiation-cached');
      
      const lead2 = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const context2 = await conversationService.buildConversationContext(lead2.id);
      const dynamicVariables2 = await conversationService.generateDynamicVariables(lead2.id, 'voice');
      
      const cachedResponseTime = measureEnd2();
      
      expect(lead.id).toBe(lead2.id);
      if (process.env.REDIS_ENABLED === 'true') {
        expect(cachedResponseTime).toBeLessThan(responseTime);
      }
      
      console.log(`✅ Cached webhook response time: ${cachedResponseTime}ms`);
    });

    test('post_call webhook with conversation processing', async () => {
      console.log('🎯 Testing post_call webhook flow...');
      
      enableRedisForTest();
      
      const testPhone = '+17789876543';
      const conversationId = 'conv_test_123';
      
      // Setup: Create lead and conversation session
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const session = await callSessionService.createCallSession({
        lead_id: lead.id,
        conversation_id: conversationId,
        type: 'voice',
        status: 'active',
        started_at: new Date().toISOString(),
        metadata: {
          phone_number: testPhone,
          agent_id: TEST_ENV.ELEVENLABS_AGENT_ID
        }
      });

      // Simulate post_call webhook
      const payload = WebhookTestUtils.createPostCallPayload(conversationId);
      
      const measureEnd = performanceMeasurer.start('webhook-post-call');
      
      // Process the webhook (what happens in the actual handler)
      await conversationService.saveConversation({
        lead_id: lead.id,
        session_id: session.id,
        type: 'voice',
        content: payload.transcript,
        sender: 'system',
        created_at: new Date().toISOString(),
        metadata: {
          summary: payload.summary,
          duration_seconds: payload.duration_seconds
        }
      });
      
      // Update lead with insights from conversation
      const insights = await conversationService.extractInsights(payload.transcript, payload.summary);
      await leadService.updateLead(lead.id, {
        previous_summary: payload.summary,
        sentiment: insights.sentiment || 'neutral',
        bike_interest: insights.bike_interest,
        lead_temperature: insights.temperature || lead.lead_temperature,
        last_contact_at: new Date().toISOString(),
        conversation_count: lead.conversation_count + 1
      });
      
      // Complete the session
      await callSessionService.updateCallSession(session.id, {
        status: 'completed',
        ended_at: new Date().toISOString(),
        metadata: {
          ...session.metadata,
          duration_seconds: payload.duration_seconds,
          summary: payload.summary
        }
      });
      
      const responseTime = measureEnd();
      
      // Verify processing completed successfully
      const updatedLead = await leadService.findLeadById(lead.id);
      expect(updatedLead).toBeDefined();
      expect(updatedLead!.previous_summary).toBe(payload.summary);
      expect(updatedLead!.conversation_count).toBe(lead.conversation_count + 1);
      
      const conversations = await conversationService.getConversationHistory(lead.id, 5);
      expect(conversations.length).toBeGreaterThan(0);
      expect(conversations[0].content).toBe(payload.transcript);
      
      console.log(`✅ Post-call processing time: ${responseTime}ms`);
      
      // Verify cache invalidation worked
      const newContext = await conversationService.buildConversationContext(lead.id);
      expect(newContext.conversation_history.length).toBeGreaterThan(0);
      expect(newContext.customer_context.conversation_count).toBeGreaterThan(0);
    });
  });

  describe('SMS Webhook Flow', () => {
    test('Twilio SMS webhook with Redis optimization', async () => {
      console.log('📱 Testing SMS webhook flow with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17785551234';
      const messageBody = 'Hi, do you have any mountain bikes in stock?';
      
      const payload = WebhookTestUtils.createSMSWebhookPayload(messageBody, testPhone);
      
      const measureEnd = performanceMeasurer.start('webhook-sms');
      
      // Simulate SMS webhook processing
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      // Create SMS conversation session  
      const session = await callSessionService.createCallSession({
        lead_id: lead.id,
        conversation_id: `sms_${Date.now()}`,
        type: 'sms',
        status: 'active',
        started_at: new Date().toISOString(),
        metadata: {
          phone_number: testPhone,
          message_sid: payload.MessageSid,
          agent_id: TEST_ENV.ELEVENLABS_AGENT_ID
        }
      });
      
      // Build context for SMS agent
      const context = await conversationService.buildConversationContext(lead.id);
      const dynamicVariables = await conversationService.generateDynamicVariables(lead.id, 'sms');
      
      // Save incoming SMS
      await conversationService.saveConversation({
        lead_id: lead.id,
        session_id: session.id,
        type: 'sms',
        content: messageBody,
        sender: 'customer',
        created_at: new Date().toISOString(),
        metadata: {
          message_sid: payload.MessageSid,
          from: payload.From,
          to: payload.To
        }
      });
      
      const responseTime = measureEnd();
      
      // Validate SMS processing
      expect(context).toHaveProperty('customer_context');
      expect(dynamicVariables).toHaveProperty('dynamic_greeting');
      expect(dynamicVariables.channel).toBe('sms');
      
      // Should be fast enough for SMS processing
      expect(responseTime).toBeLessThan(500); // SMS has more tolerance than voice
      
      console.log(`✅ SMS processing time: ${responseTime}ms`);
      
      // Test cached SMS processing (subsequent message from same customer)
      const measureEnd2 = performanceMeasurer.start('webhook-sms-cached');
      
      const leadCached = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const contextCached = await conversationService.buildConversationContext(leadCached.id);
      
      const cachedResponseTime = measureEnd2();
      
      expect(leadCached.id).toBe(lead.id);
      if (process.env.REDIS_ENABLED === 'true') {
        expect(cachedResponseTime).toBeLessThan(responseTime);
      }
      
      console.log(`✅ Cached SMS processing time: ${cachedResponseTime}ms`);
    });
  });

  describe('Cross-Channel Context Preservation', () => {
    test('voice to SMS context preservation with Redis', async () => {
      console.log('🔄 Testing cross-channel context preservation...');
      
      enableRedisForTest();
      
      const testPhone = '+17786661234';
      
      // Start with voice call
      const voiceLead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      // Simulate voice conversation
      await conversationService.saveConversation({
        lead_id: voiceLead.id,
        session_id: 'voice-session-1',
        type: 'voice',
        content: 'Customer asked about mountain bikes, budget $2000',
        sender: 'system',
        created_at: new Date().toISOString(),
        metadata: {
          summary: 'Interested in mountain bikes, budget around $2000',
          duration_seconds: 180
        }
      });
      
      // Update lead with voice conversation insights
      await leadService.updateLead(voiceLead.id, {
        customer_name: 'John Smith',
        bike_interest: { type: 'mountain', budget: '1500-2500' },
        previous_summary: 'Interested in mountain bikes, budget around $2000',
        sentiment: 'positive',
        conversation_count: 1,
        last_contact_at: new Date().toISOString()
      });
      
      // Later: SMS from same customer
      const measureEnd = performanceMeasurer.start('cross-channel-context');
      
      const smsLead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const smsContext = await conversationService.buildConversationContext(smsLead.id);
      const smsDynamicVars = await conversationService.generateDynamicVariables(smsLead.id, 'sms');
      
      const contextBuildTime = measureEnd();
      
      // Verify same lead and context preservation
      expect(smsLead.id).toBe(voiceLead.id);
      expect(smsContext.customer_context.name).toBe('John Smith');
      expect(smsContext.customer_context.conversation_count).toBe(1);
      expect(smsContext.customer_context.bike_interest).toMatchObject({ type: 'mountain' });
      expect(smsContext.conversation_history.length).toBeGreaterThan(0);
      
      // Dynamic variables should reflect voice conversation context
      expect(smsDynamicVars.customer_name).toBe('John Smith');
      expect(smsDynamicVars.bike_interest).toBe('mountain');
      expect(smsDynamicVars.conversation_count).toBe('1');
      expect(smsDynamicVars.dynamic_greeting).toContain('John');
      
      console.log(`✅ Cross-channel context build time: ${contextBuildTime}ms`);
      console.log(`✅ Context preserved across voice → SMS channels`);
    });

    test('SMS to voice context preservation with Redis', async () => {
      console.log('🔄 Testing SMS → voice context preservation...');
      
      enableRedisForTest();
      
      const testPhone = '+17787771234';
      
      // Start with SMS
      const smsLead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      // Simulate SMS conversation
      await conversationService.saveConversation({
        lead_id: smsLead.id,
        session_id: 'sms-session-1',
        type: 'sms',
        content: 'Do you have road bikes under $1500?',
        sender: 'customer',
        created_at: new Date().toISOString()
      });
      
      await conversationService.saveConversation({
        lead_id: smsLead.id,
        session_id: 'sms-session-1',
        type: 'sms',
        content: 'Yes, we have several great options! Would you like to schedule a visit?',
        sender: 'agent',
        created_at: new Date().toISOString(),
        metadata: {
          summary: 'Customer interested in road bikes under $1500'
        }
      });
      
      // Update lead from SMS insights
      await leadService.updateLead(smsLead.id, {
        customer_name: 'Sarah Johnson',
        bike_interest: { type: 'road', budget: 'under-1500' },
        previous_summary: 'Customer interested in road bikes under $1500',
        sentiment: 'positive',
        conversation_count: 1,
        last_contact_at: new Date().toISOString()
      });
      
      // Later: Voice call from same customer
      const measureEnd = performanceMeasurer.start('sms-to-voice-context');
      
      const voiceLead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const voiceContext = await conversationService.buildConversationContext(voiceLead.id);
      const voiceDynamicVars = await conversationService.generateDynamicVariables(voiceLead.id, 'voice');
      
      const contextBuildTime = measureEnd();
      
      // Verify context preservation SMS → voice
      expect(voiceLead.id).toBe(smsLead.id);
      expect(voiceContext.customer_context.name).toBe('Sarah Johnson');
      expect(voiceContext.customer_context.bike_interest).toMatchObject({ type: 'road' });
      expect(voiceContext.conversation_history.length).toBeGreaterThan(0);
      
      // Voice greeting should reference SMS conversation
      expect(voiceDynamicVars.customer_name).toBe('Sarah Johnson');
      expect(voiceDynamicVars.bike_interest).toBe('road');
      expect(voiceDynamicVars.dynamic_greeting).toContain('Sarah');
      
      console.log(`✅ SMS → voice context build time: ${contextBuildTime}ms`);
      console.log(`✅ Context preserved across SMS → voice channels`);
    });
  });

  describe('High-Frequency Webhook Scenarios', () => {
    test('rapid sequential webhooks with Redis', async () => {
      console.log('⚡ Testing rapid sequential webhooks...');
      
      enableRedisForTest();
      
      const testPhone = '+17788881234';
      const webhookCount = 10;
      
      const results = [];
      
      for (let i = 0; i < webhookCount; i++) {
        const measureEnd = performanceMeasurer.start(`rapid-webhook-${i}`);
        
        const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
        const context = await conversationService.buildConversationContext(lead.id);
        const vars = await conversationService.generateDynamicVariables(lead.id, 'voice');
        
        const responseTime = measureEnd();
        results.push(responseTime);
      }
      
      // Analyze rapid webhook performance
      const avgResponseTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxResponseTime = Math.max(...results);
      const minResponseTime = Math.min(...results);
      
      console.log(`Rapid webhooks - Avg: ${avgResponseTime.toFixed(2)}ms, Min: ${minResponseTime}ms, Max: ${maxResponseTime}ms`);
      
      // Should maintain good performance throughout
      expect(avgResponseTime).toBeLessThan(100);
      expect(maxResponseTime).toBeLessThan(200);
      
      // Later calls should be faster due to caching
      const laterCalls = results.slice(5); // Last 5 calls
      const avgLaterCalls = laterCalls.reduce((a, b) => a + b, 0) / laterCalls.length;
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(avgLaterCalls).toBeLessThan(avgResponseTime);
      }
      
      console.log(`✅ Rapid webhook performance maintained`);
    });

    test('concurrent webhook load with Redis', async () => {
      console.log('🚀 Testing concurrent webhook load...');
      
      enableRedisForTest();
      
      const concurrency = 5;
      const promises = [];
      
      for (let i = 0; i < concurrency; i++) {
        const phone = `+1778999000${i}`;
        promises.push((async () => {
          const measureEnd = performanceMeasurer.start(`concurrent-webhook-${i}`);
          
          const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
          const context = await conversationService.buildConversationContext(lead.id);
          const vars = await conversationService.generateDynamicVariables(lead.id, 'voice');
          
          const responseTime = measureEnd();
          return { phone, responseTime, leadId: lead.id };
        })());
      }
      
      const results = await Promise.all(promises);
      
      // Verify all requests succeeded
      expect(results.length).toBe(concurrency);
      results.forEach(result => {
        expect(result.responseTime).toBeLessThan(500); // Reasonable under concurrent load
        expect(result.leadId).toBeDefined();
      });
      
      const avgConcurrentTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      console.log(`✅ Concurrent webhook avg response time: ${avgConcurrentTime.toFixed(2)}ms`);
    });
  });

  describe('Redis vs No-Redis Functional Equivalence', () => {
    test('webhook responses identical with and without Redis', async () => {
      console.log('⚖️  Testing functional equivalence...');
      
      const testPhone = '+17755551234';
      
      // Test without Redis
      process.env.REDIS_ENABLED = 'false';
      const leadServiceNoRedis = new LeadService();
      const conversationServiceNoRedis = new ConversationService();
      
      const leadNoRedis = await leadServiceNoRedis.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const contextNoRedis = await conversationServiceNoRedis.buildConversationContext(leadNoRedis.id);
      const varsNoRedis = await conversationServiceNoRedis.generateDynamicVariables(leadNoRedis.id, 'voice');
      
      // Test with Redis
      enableRedisForTest();
      const leadServiceWithRedis = new LeadService();
      const conversationServiceWithRedis = new ConversationService();
      
      const leadWithRedis = await leadServiceWithRedis.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      const contextWithRedis = await conversationServiceWithRedis.buildConversationContext(leadWithRedis.id);
      const varsWithRedis = await conversationServiceWithRedis.generateDynamicVariables(leadWithRedis.id, 'voice');
      
      // Responses should be functionally identical
      expect(leadNoRedis.id).toBe(leadWithRedis.id);
      expect(leadNoRedis.phone_number).toBe(leadWithRedis.phone_number);
      expect(leadNoRedis.organization_id).toBe(leadWithRedis.organization_id);
      
      expect(contextNoRedis.customer_context.phone).toBe(contextWithRedis.customer_context.phone);
      expect(contextNoRedis.business_context.store_name).toBe(contextWithRedis.business_context.store_name);
      
      // Dynamic variables structure should be the same
      expect(Object.keys(varsNoRedis)).toEqual(Object.keys(varsWithRedis));
      expect(varsNoRedis.customer_tier).toBe(varsWithRedis.customer_tier);
      
      console.log('✅ Webhook responses functionally identical with/without Redis');
    });
  });
});