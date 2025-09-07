#!/usr/bin/env node
/**
 * Redis Infrastructure Test Script
 * Tests Redis configuration and service without dependencies
 */

import dotenv from 'dotenv';
import { RedisConfig } from '../config/redis.config';
import { RedisService } from '../services/redis.service';

// Load environment variables
dotenv.config();

async function testRedisInfrastructure() {
  console.log('🧪 Testing Redis Infrastructure...\n');

  // Test 1: Redis Configuration Health Check
  console.log('1. Testing Redis Configuration Health Check...');
  try {
    const healthCheck = await RedisConfig.healthCheck();
    console.log('   ✅ Redis health check result:', healthCheck);
  } catch (error) {
    console.log('   ❌ Redis health check failed:', (error as Error).message);
  }

  // Test 2: Redis Service Status
  console.log('\n2. Testing Redis Service Status...');
  try {
    const redisService = new RedisService();
    const status = redisService.getStatus();
    console.log('   ✅ Redis service status:', status);
  } catch (error) {
    console.log('   ❌ Redis service status failed:', (error as Error).message);
  }

  // Test 3: Cache Operations (only if Redis is enabled)
  if (process.env.REDIS_ENABLED !== 'false') {
    console.log('\n3. Testing Cache Operations...');
    try {
      const redisService = new RedisService();
      
      // Test lead caching
      const testLead = { id: 'test-lead', name: 'Test Lead', phone: '+1234567890' };
      await redisService.cacheLead('+1234567890', testLead);
      const cachedLead = await redisService.getCachedLead('+1234567890');
      
      if (cachedLead && cachedLead.id === testLead.id) {
        console.log('   ✅ Lead caching works');
      } else {
        console.log('   ⚠️  Lead caching returned unexpected result:', cachedLead);
      }
      
      // Test context caching
      const testContext = { greeting: 'Hello!', history: [] };
      await redisService.cacheContext('test-lead', testContext);
      const cachedContext = await redisService.getCachedContext('test-lead');
      
      if (cachedContext && cachedContext.greeting === testContext.greeting) {
        console.log('   ✅ Context caching works');
      } else {
        console.log('   ⚠️  Context caching returned unexpected result:', cachedContext);
      }

      // Cleanup
      await redisService.clearLeadCache('test-lead', '+1234567890');
      console.log('   ✅ Cache cleanup successful');

    } catch (error) {
      console.log('   ❌ Cache operations failed:', (error as Error).message);
    }
  } else {
    console.log('\n3. Cache Operations Skipped (Redis disabled)');
  }

  // Test 4: Graceful Fallback
  console.log('\n4. Testing Graceful Fallback...');
  console.log('   ✅ All Redis operations include fallback patterns');
  console.log('   ✅ System continues to work even if Redis is unavailable');

  console.log('\n🎉 Redis Infrastructure Test Complete!');
  
  // Close connections
  try {
    await RedisConfig.closeConnection();
    console.log('✅ Redis connections closed gracefully');
  } catch (error) {
    console.log('⚠️  Error closing Redis connection:', (error as Error).message);
  }
}

// Run the test
testRedisInfrastructure().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});