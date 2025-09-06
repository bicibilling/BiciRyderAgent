const { createClient } = require('redis');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function checkCurrentData() {
  const phoneNumber = '6049085474';
  const normalizedPhone = '+16049085474';
  
  console.log(`📋 Current Redis data for phone number: ${phoneNumber}`);
  
  // Connect to Redis using environment variable
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  
  await redis.connect();
  
  try {
    // Check for any keys with this phone number
    console.log('🔍 Searching for current data...');
    const keys = await redis.keys('*6049085474*');
    console.log('Keys found:', keys);
    
    // Check the new lead from SMS logs
    const newLeadKey = 'lead:dc5e5ea7-d8a8-4ed7-a0cc-97d9e75d7c9d';
    console.log(`🔍 Checking new lead: ${newLeadKey}`);
    const leadData = await redis.hGetAll(newLeadKey);
    console.log('New lead data:', leadData);
    
    // Check organization mapping
    const orgKey = `lead:b0c1b1c1-0000-0000-0000-000000000001:${normalizedPhone}`;
    console.log(`🔍 Checking org mapping: ${orgKey}`);
    const orgMapExists = await redis.exists(orgKey);
    if (orgMapExists) {
      const orgMapValue = await redis.get(orgKey);
      console.log('Org mapping value:', orgMapValue);
    } else {
      console.log('Org mapping does not exist');
    }
    
    // Check conversations
    const convKey = `${newLeadKey}:conversations`;
    console.log(`🔍 Checking conversations: ${convKey}`);
    const convLength = await redis.lLen(convKey);
    console.log(`Conversation count: ${convLength}`);
    
    if (convLength > 0) {
      const convIds = await redis.lRange(convKey, 0, -1);
      console.log('Conversation IDs:', convIds);
      
      // Check first conversation
      if (convIds.length > 0) {
        const firstConv = await redis.hGetAll(`conv:${convIds[0]}`);
        console.log('First conversation:', firstConv);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redis.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  checkCurrentData();
}

module.exports = { checkCurrentData };