#!/usr/bin/env npx tsx

/**
 * Test script for enhanced greeting functionality
 * Tests the new date/time and store hours features
 */

import {
  getCurrentDateTimeInfo,
  getDetailedStoreHours,
  createDynamicGreeting,
  generateGreetingContext
} from '../src/utils/greeting.helper';

console.log('🔍 Testing Enhanced Greeting Functions...\n');

// Test 1: Current Date/Time Info
console.log('1️⃣ Testing getCurrentDateTimeInfo():');
const dateTimeInfo = getCurrentDateTimeInfo();
console.log('📅 Date String:', dateTimeInfo.dateString);
console.log('🕐 Time String:', dateTimeInfo.timeString);
console.log('📆 Day of Week:', dateTimeInfo.dayOfWeek);
console.log('📝 Full DateTime:', dateTimeInfo.fullDateTime);
console.log('');

// Test 2: Store Hours
console.log('2️⃣ Testing getDetailedStoreHours():');
const storeHours = getDetailedStoreHours();
console.log('🏪 Is Open:', storeHours.isOpen);
console.log('📊 Current Status:', storeHours.currentStatus);
console.log('⏰ Hours Info:', storeHours.hoursInfo);
if (storeHours.nextOpen) {
  console.log('📅 Next Open:', storeHours.nextOpen);
}
console.log('');

// Test 3: Dynamic Greeting (no customer)
console.log('3️⃣ Testing createDynamicGreeting() - No Customer:');
const mockLead = null;
createDynamicGreeting(mockLead).then(greeting => {
  console.log('💬 Generated Greeting:', greeting);
  console.log('');

  // Test 4: Dynamic Greeting (with customer)
  console.log('4️⃣ Testing createDynamicGreeting() - With Customer:');
  const mockLeadWithCustomer = {
    id: 'test-lead-123',
    customer_name: 'John Smith',
    phone_number: '+1234567890'
  };

  return createDynamicGreeting(mockLeadWithCustomer);
}).then(greeting => {
  console.log('💬 Generated Greeting (with customer):', greeting);
  console.log('');

  // Test 5: Greeting Context - Inbound
  console.log('5️⃣ Testing generateGreetingContext() - Inbound:');
  const inboundContext = generateGreetingContext(mockLead, false);
  console.log('📋 Inbound Context Variables:');
  Object.entries(inboundContext).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log('');

  // Test 6: Greeting Context - Outbound
  console.log('6️⃣ Testing generateGreetingContext() - Outbound:');
  const mockSummary = {
    call_classification: 'sales',
    summary: 'Customer interested in mountain bike pricing'
  };
  const outboundContext = generateGreetingContext(mockLead, true, mockSummary);
  console.log('📋 Outbound Context Variables:');
  Object.entries(outboundContext).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log('');

  console.log('✅ All greeting tests completed successfully!');
}).catch(error => {
  console.error('❌ Error during testing:', error);
});