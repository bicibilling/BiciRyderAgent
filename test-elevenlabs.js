#!/usr/bin/env node

/**
 * ElevenLabs Integration Test Runner
 * Run this to test the ElevenLabs API integration
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ElevenLabsApiTest = require('./api/tests/elevenlabs-test');

console.log('🚀 ElevenLabs API Integration Test Runner');
console.log('=====================================\n');

// Show configuration status
console.log('📋 Configuration Status:');
console.log('- ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Not set');
console.log('- ELEVENLABS_AGENT_ID:', process.env.ELEVENLABS_AGENT_ID ? '✅ Set' : '❌ Not set');
console.log('- ELEVENLABS_PHONE_NUMBER_ID:', process.env.ELEVENLABS_PHONE_NUMBER_ID ? '✅ Set' : '❌ Not set');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- DRY_RUN:', process.env.ELEVENLABS_TEST_DRY_RUN !== 'false' ? 'true' : 'false');
console.log('');

if (!process.env.ELEVENLABS_API_KEY) {
  console.log('⚠️  To run full tests, set your ElevenLabs API credentials in .env:');
  console.log('   ELEVENLABS_API_KEY=your_api_key');
  console.log('   ELEVENLABS_AGENT_ID=your_agent_id');
  console.log('   ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id\n');
  console.log('📝 Running in validation-only mode...\n');
}

// Run the tests
const tester = new ElevenLabsApiTest();
tester.runAllTests()
  .then((results) => {
    console.log('\n🎉 Test run completed!');
    
    if (!results.connectivity.success && results.connectivity.reason !== 'no_api_key') {
      console.log('\n🔧 Troubleshooting Tips:');
      console.log('- Verify your ELEVENLABS_API_KEY is correct');
      console.log('- Check your network connection');
      console.log('- Ensure you have sufficient API credits');
    }

    if (!results.outboundCall.success && results.outboundCall.reason !== 'missing_config') {
      console.log('\n🔧 Outbound Call Issues:');
      console.log('- Verify ELEVENLABS_AGENT_ID exists and is active');
      console.log('- Verify ELEVENLABS_PHONE_NUMBER_ID is correctly configured');
      console.log('- Check if your ElevenLabs account has phone calling enabled');
    }

    process.exit(results.connectivity.success && results.outboundCall.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Test run failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });