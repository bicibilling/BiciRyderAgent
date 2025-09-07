/**
 * Jest Global Teardown
 * Ensures clean shutdown of all connections
 */

import { RedisConfig } from '../config/redis.config';

export default async function teardown() {
  console.log('🔌 Closing all test connections...');
  
  try {
    await RedisConfig.closeConnection();
  } catch (error) {
    console.warn('Error during teardown:', (error as Error).message);
  }
  
  console.log('✅ Test teardown complete');
}