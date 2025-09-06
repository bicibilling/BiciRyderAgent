const { createClient } = require('redis');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function clearPhoneData() {
  const phoneNumber = '6049085474';
  const normalizedPhone = '+16049085474';
  
  console.log(`🧹 Clearing all Redis data for phone number: ${phoneNumber}`);
  
  // Connect to Redis using environment variable
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  
  await redis.connect();
  
  try {
    // Find all keys related to this phone number
    const patterns = [
      `*${phoneNumber}*`,
      `*${normalizedPhone}*`,
      `lead:*:${phoneNumber}`,
      `lead:*:${normalizedPhone}`,
      `customer:context:${phoneNumber}`,
      `customer:context:${normalizedPhone}`
    ];
    
    let totalDeleted = 0;
    
    for (const pattern of patterns) {
      console.log(`🔍 Searching for pattern: ${pattern}`);
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        console.log(`📋 Found ${keys.length} keys:`, keys);
        
        // Delete each key
        for (const key of keys) {
          await redis.del(key);
          console.log(`❌ Deleted: ${key}`);
          totalDeleted++;
        }
      } else {
        console.log(`✅ No keys found for pattern: ${pattern}`);
      }
    }
    
    // Also check for any leads that might reference this phone number
    console.log(`🔍 Checking lead data for phone references...`);
    const leadKeys = await redis.keys('lead:*');
    
    for (const leadKey of leadKeys) {
      try {
        const keyType = await redis.type(leadKey);
        console.log(`🔍 Lead key ${leadKey} type: ${keyType}`);
        
        if (keyType !== 'hash') {
          console.log(`⚠️ Skipping ${leadKey} - not a hash type`);
          continue;
        }
        
        const leadData = await redis.hGetAll(leadKey);
        if (leadData.phone_number_normalized === normalizedPhone || 
            leadData.phone_number_normalized === phoneNumber ||
            leadData.phone_number === phoneNumber ||
            leadData.phone_number === normalizedPhone) {
        
        console.log(`📞 Found lead with matching phone: ${leadKey}`, leadData);
        
        // Get associated conversations
        const conversationKeys = await redis.lRange(`${leadKey}:conversations`, 0, -1);
        console.log(`💬 Found ${conversationKeys.length} conversations for this lead`);
        
        // Delete conversations
        for (const convKey of conversationKeys) {
          await redis.del(`conv:${convKey}`);
          console.log(`❌ Deleted conversation: conv:${convKey}`);
          totalDeleted++;
        }
        
        // Delete conversation list
        await redis.del(`${leadKey}:conversations`);
        console.log(`❌ Deleted conversation list: ${leadKey}:conversations`);
        totalDeleted++;
        
        // Delete the lead itself
        await redis.del(leadKey);
          console.log(`❌ Deleted lead: ${leadKey}`);
          totalDeleted++;
        }
      } catch (error) {
        console.log(`⚠️ Error checking lead ${leadKey}: ${error.message}`);
      }
    }
    
    // Check for any call sessions
    console.log(`📞 Checking call sessions...`);
    const sessionKeys = await redis.keys('session:*');
    
    for (const sessionKey of sessionKeys) {
      try {
        const keyType = await redis.type(sessionKey);
        console.log(`🔍 Session key ${sessionKey} type: ${keyType}`);
        
        if (keyType !== 'hash') {
          console.log(`⚠️ Skipping ${sessionKey} - not a hash type`);
          continue;
        }
        
        const sessionData = await redis.hGetAll(sessionKey);
        if (sessionData.phone_number === normalizedPhone || 
            sessionData.phone_number === phoneNumber) {
          
          console.log(`📞 Found session with matching phone: ${sessionKey}`, sessionData);
          await redis.del(sessionKey);
          console.log(`❌ Deleted session: ${sessionKey}`);
          totalDeleted++;
        }
      } catch (error) {
        console.log(`⚠️ Error checking session ${sessionKey}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Cleanup complete! Deleted ${totalDeleted} keys total for phone ${phoneNumber}`);
    
    // Verify cleanup
    console.log(`\n🔍 Verification - searching for any remaining data...`);
    let remainingKeys = [];
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      remainingKeys = remainingKeys.concat(keys);
    }
    
    if (remainingKeys.length === 0) {
      console.log(`✅ Verification successful - no remaining data found for ${phoneNumber}`);
    } else {
      console.log(`⚠️  Warning: Found ${remainingKeys.length} remaining keys:`, remainingKeys);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await redis.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  clearPhoneData();
}

module.exports = { clearPhoneData };