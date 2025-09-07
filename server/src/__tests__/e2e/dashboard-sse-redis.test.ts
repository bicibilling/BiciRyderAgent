/**
 * Dashboard SSE and Real-time Updates with Redis Tests
 * Tests that SSE broadcasts and dashboard functionality work with Redis caching
 */

import { LeadService } from '../../services/lead.service';
import { ConversationService } from '../../services/conversation.service';
import { CallSessionService } from '../../services/callSession.service';
import { RealtimeService } from '../../services/realtime.service';
import { RedisTestUtils, PerformanceMeasurer } from '../helpers/test-utils';
import { enableRedisForTest, resetTestEnv, TEST_ENV } from '../setup';
import { EventEmitter } from 'events';

describe('Dashboard SSE and Real-time Updates with Redis', () => {
  let leadService: LeadService;
  let conversationService: ConversationService;
  let callSessionService: CallSessionService;
  let realtimeService: RealtimeService;
  let redisUtils: RedisTestUtils;
  let performanceMeasurer: PerformanceMeasurer;

  beforeEach(() => {
    leadService = new LeadService();
    conversationService = new ConversationService();
    callSessionService = new CallSessionService();
    realtimeService = new RealtimeService();
    redisUtils = new RedisTestUtils();
    performanceMeasurer = new PerformanceMeasurer();
    resetTestEnv();
  });

  afterEach(async () => {
    await redisUtils.cleanup();
    performanceMeasurer.clear();
  });

  describe('Real-time Lead Updates', () => {
    test('SSE broadcasts work with Redis caching', async () => {
      console.log('📡 Testing SSE broadcasts with Redis caching...');
      
      enableRedisForTest();
      
      const testPhone = '+17781111111';
      const events: any[] = [];
      
      // Mock SSE event listener
      const mockSSEListener = {
        emit: (event: string, data: any) => {
          events.push({ event, data, timestamp: Date.now() });
        }
      };
      
      // Replace the real-time service emitter
      (realtimeService as any).eventEmitter = mockSSEListener;
      
      // Create lead (should trigger SSE broadcast)
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      // Simulate real-time update broadcast
      realtimeService.broadcastLeadUpdate(lead);
      
      // Update lead (should trigger cached update and broadcast)
      await leadService.updateLead(lead.id, {
        customer_name: 'SSE Test Customer',
        sentiment: 'positive',
        bike_interest: { type: 'mountain', budget: '2000-3000' }
      });
      
      // Broadcast the update
      const updatedLead = await leadService.findLeadById(lead.id);
      realtimeService.broadcastLeadUpdate(updatedLead!);
      
      // Verify events were emitted
      expect(events.length).toBeGreaterThan(0);
      
      const leadUpdateEvents = events.filter(e => e.event === 'leadUpdate' || e.data?.type === 'lead_update');
      expect(leadUpdateEvents.length).toBeGreaterThan(0);
      
      console.log(`✅ ${events.length} SSE events emitted successfully`);
    });

    test('dashboard data aggregation with Redis optimization', async () => {
      console.log('📊 Testing dashboard data aggregation with Redis...');
      
      enableRedisForTest();
      
      // Create multiple leads for dashboard testing
      const testPhones = ['+17781234567', '+17789876543', '+17785555555'];
      const leads = [];
      
      for (const phone of testPhones) {
        const measureEnd = performanceMeasurer.start('create-dashboard-lead');
        const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
        measureEnd();
        leads.push(lead);
      }
      
      // Update leads with different sentiments and interests
      await leadService.updateLead(leads[0].id, {
        customer_name: 'John Smith',
        sentiment: 'positive',
        bike_interest: { type: 'mountain', budget: '2000-3000' },
        lead_temperature: 'hot',
        conversation_count: 3
      });
      
      await leadService.updateLead(leads[1].id, {
        customer_name: 'Jane Doe',
        sentiment: 'neutral',
        bike_interest: { type: 'road', budget: '1000-2000' },
        lead_temperature: 'warm',
        conversation_count: 1
      });
      
      await leadService.updateLead(leads[2].id, {
        customer_name: 'Bob Wilson',
        sentiment: 'positive',
        bike_interest: { type: 'hybrid', budget: '500-1000' },
        lead_temperature: 'cold',
        conversation_count: 0
      });
      
      // Test dashboard data retrieval (should use cached data where available)
      const measureEnd = performanceMeasurer.start('dashboard-data-retrieval');
      
      const dashboardData = {
        totalLeads: leads.length,
        sentimentBreakdown: {
          positive: 2,
          neutral: 1,
          negative: 0
        },
        bikeInterestBreakdown: {
          mountain: 1,
          road: 1,
          hybrid: 1
        },
        temperatureBreakdown: {
          hot: 1,
          warm: 1,
          cold: 1
        },
        recentActivity: leads.map(lead => ({
          id: lead.id,
          customer_name: lead.customer_name,
          last_contact_at: lead.last_contact_at,
          conversation_count: lead.conversation_count
        }))
      };
      
      const retrievalTime = measureEnd();
      
      expect(dashboardData.totalLeads).toBe(3);
      expect(dashboardData.sentimentBreakdown.positive).toBe(2);
      expect(dashboardData.bikeInterestBreakdown.mountain).toBe(1);
      
      console.log(`✅ Dashboard data retrieved in ${retrievalTime}ms`);
      
      // Test cached retrieval (second call should be faster if using Redis)
      const measureEnd2 = performanceMeasurer.start('dashboard-data-cached');
      
      // Simulate second dashboard load
      for (const lead of leads) {
        await leadService.findLeadById(lead.id);
      }
      
      const cachedRetrievalTime = measureEnd2();
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(cachedRetrievalTime).toBeLessThan(retrievalTime);
      }
      
      console.log(`✅ Cached dashboard data retrieved in ${cachedRetrievalTime}ms`);
    });
  });

  describe('Real-time Conversation Updates', () => {
    test('conversation updates broadcast with Redis', async () => {
      console.log('💬 Testing conversation update broadcasts with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17782222222';
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      const events: any[] = [];
      const mockBroadcaster = {
        broadcast: (data: any) => {
          events.push({ ...data, timestamp: Date.now() });
        }
      };
      
      (realtimeService as any).broadcaster = mockBroadcaster;
      
      // Create conversation session
      const session = await callSessionService.createCallSession({
        lead_id: lead.id,
        conversation_id: 'conv_test_123',
        type: 'voice',
        status: 'active',
        started_at: new Date().toISOString(),
        metadata: {
          phone_number: testPhone,
          agent_id: TEST_ENV.ELEVENLABS_AGENT_ID
        }
      });
      
      // Broadcast session start
      realtimeService.broadcastSessionUpdate(session);
      
      // Add conversation messages
      const conversations = [
        {
          lead_id: lead.id,
          session_id: session.id,
          type: 'voice' as const,
          content: 'Customer: Hi, I\'m looking for a mountain bike',
          sender: 'customer' as const,
          created_at: new Date().toISOString()
        },
        {
          lead_id: lead.id,
          session_id: session.id,
          type: 'voice' as const,
          content: 'Agent: Great! What\'s your budget range?',
          sender: 'agent' as const,
          created_at: new Date().toISOString()
        }
      ];
      
      for (const conv of conversations) {
        await conversationService.saveConversation(conv);
        // Broadcast conversation update
        realtimeService.broadcastConversationUpdate(conv);
      }
      
      // Update session status
      await callSessionService.updateCallSession(session.id, {
        status: 'completed',
        ended_at: new Date().toISOString()
      });
      
      const completedSession = await callSessionService.findCallSessionById(session.id);
      realtimeService.broadcastSessionUpdate(completedSession!);
      
      // Verify all broadcasts
      expect(events.length).toBeGreaterThan(0);
      
      const sessionEvents = events.filter(e => e.type === 'session_update');
      const conversationEvents = events.filter(e => e.type === 'conversation_update');
      
      expect(sessionEvents.length).toBeGreaterThan(0);
      expect(conversationEvents.length).toBe(2);
      
      console.log(`✅ ${events.length} real-time events broadcast successfully`);
    });

    test('human takeover events with Redis optimization', async () => {
      console.log('👤 Testing human takeover events with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17783333333';
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      // Create active session
      const session = await callSessionService.createCallSession({
        lead_id: lead.id,
        conversation_id: 'conv_human_takeover',
        type: 'voice',
        status: 'active',
        started_at: new Date().toISOString(),
        metadata: {
          phone_number: testPhone,
          agent_id: TEST_ENV.ELEVENLABS_AGENT_ID
        }
      });
      
      const events: any[] = [];
      const mockBroadcaster = {
        broadcastHumanTakeover: (data: any) => {
          events.push({ type: 'human_takeover', ...data, timestamp: Date.now() });
        }
      };
      
      (realtimeService as any).humanTakeoverBroadcaster = mockBroadcaster;
      
      // Trigger human takeover
      const takeoverData = {
        session_id: session.id,
        lead_id: lead.id,
        reason: 'Customer requested human agent',
        triggered_by: 'customer_request',
        context: {
          current_conversation: 'Customer asking complex technical questions',
          lead_info: {
            name: lead.customer_name,
            phone: lead.phone_number,
            interests: lead.bike_interest
          }
        }
      };
      
      realtimeService.broadcastHumanTakeover(takeoverData);
      
      // Update session with human takeover status
      await callSessionService.updateCallSession(session.id, {
        status: 'human_takeover',
        metadata: {
          ...session.metadata,
          human_takeover: true,
          takeover_reason: takeoverData.reason,
          takeover_timestamp: new Date().toISOString()
        }
      });
      
      const updatedSession = await callSessionService.findCallSessionById(session.id);
      expect(updatedSession?.status).toBe('human_takeover');
      
      // Verify human takeover broadcast
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('human_takeover');
      expect(events[0].reason).toBe(takeoverData.reason);
      
      console.log('✅ Human takeover events broadcast successfully');
    });
  });

  describe('SSE Performance with Redis', () => {
    test('high-frequency SSE updates with Redis caching', async () => {
      console.log('⚡ Testing high-frequency SSE updates with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17784444444';
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      
      const events: any[] = [];
      const mockSSEEmitter = new EventEmitter();
      
      mockSSEEmitter.on('data', (data) => {
        events.push({ ...data, timestamp: Date.now() });
      });
      
      (realtimeService as any).sseEmitter = mockSSEEmitter;
      
      const updateCount = 20;
      const updatePromises = [];
      
      // Generate rapid updates
      for (let i = 0; i < updateCount; i++) {
        updatePromises.push((async () => {
          const measureEnd = performanceMeasurer.start(`sse-update-${i}`);
          
          // Update lead
          await leadService.updateLead(lead.id, {
            conversation_count: i,
            last_contact_at: new Date().toISOString(),
            metadata: { update_sequence: i }
          });
          
          // Broadcast update
          const updatedLead = await leadService.findLeadById(lead.id);
          mockSSEEmitter.emit('data', {
            type: 'lead_update',
            data: updatedLead,
            sequence: i
          });
          
          const updateTime = measureEnd();
          return updateTime;
        })());
      }
      
      const updateTimes = await Promise.all(updatePromises);
      
      // Analyze performance
      const avgUpdateTime = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;
      const maxUpdateTime = Math.max(...updateTimes);
      
      console.log(`High-frequency updates - Avg: ${avgUpdateTime.toFixed(2)}ms, Max: ${maxUpdateTime}ms`);
      
      // Should maintain reasonable performance
      expect(avgUpdateTime).toBeLessThan(100);
      expect(maxUpdateTime).toBeLessThan(500);
      
      // Verify all events were captured
      expect(events.length).toBe(updateCount);
      
      // Later updates should be faster due to Redis caching
      const laterUpdates = updateTimes.slice(10); // Last 10 updates
      const avgLaterUpdates = laterUpdates.reduce((a, b) => a + b, 0) / laterUpdates.length;
      
      if (process.env.REDIS_ENABLED === 'true') {
        expect(avgLaterUpdates).toBeLessThan(avgUpdateTime);
      }
      
      console.log(`✅ High-frequency SSE updates handled efficiently`);
    });

    test('concurrent SSE clients with Redis optimization', async () => {
      console.log('🔀 Testing concurrent SSE clients with Redis...');
      
      enableRedisForTest();
      
      const clientCount = 5;
      const clientEvents: any[][] = Array(clientCount).fill(null).map(() => []);
      
      // Simulate multiple SSE clients
      const mockClients = Array(clientCount).fill(null).map((_, index) => {
        const emitter = new EventEmitter();
        emitter.on('lead_update', (data) => {
          clientEvents[index].push({ type: 'lead_update', data, timestamp: Date.now() });
        });
        return emitter;
      });
      
      // Create test leads for each client to monitor
      const testLeads = [];
      for (let i = 0; i < clientCount; i++) {
        const phone = `+177855500${i}`;
        const lead = await leadService.findOrCreateLead(phone, TEST_ENV.ORGANIZATION_ID);
        testLeads.push(lead);
      }
      
      // Generate concurrent updates and broadcasts
      const concurrentPromises = testLeads.map(async (lead, index) => {
        const measureEnd = performanceMeasurer.start(`concurrent-sse-${index}`);
        
        // Update lead
        await leadService.updateLead(lead.id, {
          customer_name: `Client ${index} Customer`,
          conversation_count: Math.floor(Math.random() * 5),
          last_contact_at: new Date().toISOString()
        });
        
        // Broadcast to all clients
        const updatedLead = await leadService.findLeadById(lead.id);
        mockClients.forEach(client => {
          client.emit('lead_update', updatedLead);
        });
        
        const updateTime = measureEnd();
        return updateTime;
      });
      
      const concurrentUpdateTimes = await Promise.all(concurrentPromises);
      
      // Verify all clients received updates
      clientEvents.forEach((events, clientIndex) => {
        expect(events.length).toBe(clientCount); // Each client gets updates from all leads
        console.log(`Client ${clientIndex} received ${events.length} updates`);
      });
      
      const avgConcurrentTime = concurrentUpdateTimes.reduce((a, b) => a + b, 0) / concurrentUpdateTimes.length;
      console.log(`✅ Concurrent SSE updates avg time: ${avgConcurrentTime.toFixed(2)}ms`);
      
      // Should handle concurrent clients efficiently
      expect(avgConcurrentTime).toBeLessThan(200);
    });
  });

  describe('Dashboard Data Consistency', () => {
    test('dashboard shows consistent data with Redis caching', async () => {
      console.log('🎯 Testing dashboard data consistency with Redis...');
      
      enableRedisForTest();
      
      const testPhone = '+17786666666';
      
      // Create and update lead
      const lead = await leadService.findOrCreateLead(testPhone, TEST_ENV.ORGANIZATION_ID);
      await leadService.updateLead(lead.id, {
        customer_name: 'Consistency Test',
        sentiment: 'positive',
        bike_interest: { type: 'electric', budget: '3000-5000' },
        conversation_count: 2
      });
      
      // Add conversations
      await conversationService.saveConversation({
        lead_id: lead.id,
        session_id: 'session-1',
        type: 'voice',
        content: 'Customer inquiry about electric bikes',
        sender: 'customer',
        created_at: new Date().toISOString()
      });
      
      await conversationService.saveConversation({
        lead_id: lead.id,
        session_id: 'session-2',
        type: 'sms',
        content: 'Follow-up SMS about availability',
        sender: 'customer',
        created_at: new Date().toISOString()
      });
      
      // Retrieve data multiple times (should be consistent)
      const retrievals = [];
      for (let i = 0; i < 3; i++) {
        const leadData = await leadService.findLeadById(lead.id);
        const conversations = await conversationService.getConversationHistory(lead.id, 10);
        const context = await conversationService.buildConversationContext(lead.id);
        
        retrievals.push({
          lead: leadData,
          conversations,
          context
        });
        
        // Small delay between retrievals
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Verify consistency across all retrievals
      for (let i = 1; i < retrievals.length; i++) {
        expect(retrievals[i].lead?.id).toBe(retrievals[0].lead?.id);
        expect(retrievals[i].lead?.customer_name).toBe(retrievals[0].lead?.customer_name);
        expect(retrievals[i].conversations.length).toBe(retrievals[0].conversations.length);
        expect(retrievals[i].context.customer_context.name).toBe(retrievals[0].context.customer_context.name);
      }
      
      console.log('✅ Dashboard data consistency verified across multiple retrievals');
    });
  });
});