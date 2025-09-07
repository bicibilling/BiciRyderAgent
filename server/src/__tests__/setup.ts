/**
 * Jest Test Setup
 * Configures test environment and shared utilities
 */

import dotenv from 'dotenv';
import { RedisConfig } from '../config/redis.config';
import { logger } from '../utils/logger';

// Load test environment variables
dotenv.config({ path: '.env.test' });
dotenv.config(); // fallback to .env

// Configure logger for tests
logger.level = process.env.LOG_LEVEL || 'error';

// Global test setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Ensure we're using test environment
  process.env.NODE_ENV = 'test';
  
  // Initialize Redis for tests if enabled
  if (process.env.REDIS_ENABLED === 'true') {
    try {
      const healthCheck = await RedisConfig.healthCheck();
      console.log('Redis health check:', healthCheck);
    } catch (error) {
      console.warn('Redis not available for tests:', (error as Error).message);
      process.env.REDIS_ENABLED = 'false';
    }
  }
});

// Global test teardown
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  try {
    await RedisConfig.closeConnection();
  } catch (error) {
    console.warn('Error closing Redis connection:', (error as Error).message);
  }
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock environment setup for consistent testing
export const TEST_ENV = {
  ORGANIZATION_ID: 'b0c1b1c1-0000-0000-0000-000000000001',
  TEST_PHONE: '+17781234567',
  TEST_PHONE_2: '+17789876543',
  ELEVENLABS_AGENT_ID: 'test-agent-id',
  TWILIO_PHONE_NUMBER: '+17786528784'
};

// Helper to reset environment between tests
export function resetTestEnv() {
  process.env.REDIS_ENABLED = 'false'; // Default to disabled for predictable tests
}

// Helper to enable Redis for specific tests
export function enableRedisForTest() {
  process.env.REDIS_ENABLED = 'true';
}