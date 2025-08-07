#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

const success = (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`);
const error = (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`);
const info = (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
const warn = (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);

async function testSupabase() {
  console.log('\n📊 Testing Supabase Connection...');
  
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Test database connection
    const { data, error: dbError } = await supabase
      .from('organizations')
      .select('count')
      .limit(1);

    if (dbError) throw dbError;
    
    success('Supabase connection successful');
    info(`Database URL: ${process.env.SUPABASE_URL}`);
    
    // Test specific tables
    const tables = ['leads', 'conversations', 'call_sessions', 'organizations'];
    for (const table of tables) {
      const { count, error: tableError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (tableError) {
        warn(`Table '${table}' error: ${tableError.message}`);
      } else {
        success(`Table '${table}' accessible (${count} records)`);
      }
    }
    
    return true;
  } catch (err: any) {
    error(`Supabase connection failed: ${err.message}`);
    return false;
  }
}

async function testTwilio() {
  console.log('\n📱 Testing Twilio Connection...');
  
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Missing Twilio credentials');
    }

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Test account access
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    success('Twilio authentication successful');
    info(`Account: ${account.friendlyName} (${account.status})`);

    // Check phone number
    if (process.env.TWILIO_PHONE_NUMBER) {
      try {
        const phoneNumbers = await client.incomingPhoneNumbers.list({
          phoneNumber: process.env.TWILIO_PHONE_NUMBER,
          limit: 1
        });
        
        if (phoneNumbers.length > 0) {
          success(`Phone number verified: ${process.env.TWILIO_PHONE_NUMBER}`);
          info(`SMS enabled: ${phoneNumbers[0].capabilities.sms}`);
          info(`Voice enabled: ${phoneNumbers[0].capabilities.voice}`);
        } else {
          warn(`Phone number ${process.env.TWILIO_PHONE_NUMBER} not found in account`);
        }
      } catch (err: any) {
        warn(`Could not verify phone number: ${err.message}`);
      }
    }

    // Check balance
    const balance = await client.balance.fetch();
    info(`Account balance: ${balance.currency} ${balance.balance}`);
    
    return true;
  } catch (err: any) {
    error(`Twilio connection failed: ${err.message}`);
    return false;
  }
}

async function testElevenLabs() {
  console.log('\n🎤 Testing ElevenLabs Connection...');
  
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('Missing ElevenLabs API key');
    }

    // Test API key validity
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const user = await response.json() as any;
    success('ElevenLabs authentication successful');
    info(`User: ${user.xi_api_key?.name || 'Unknown'}`);
    info(`Subscription: ${user.subscription?.tier || 'Unknown'}`);
    
    if (user.subscription?.character_count !== undefined) {
      const used = user.subscription.character_count;
      const limit = user.subscription.character_limit;
      const percentage = limit > 0 ? ((used / limit) * 100).toFixed(1) : '0';
      info(`Character usage: ${used.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)`);
    }

    // Test agent exists
    if (process.env.ELEVENLABS_AGENT_ID) {
      try {
        const agentResponse = await fetch(
          `https://api.elevenlabs.io/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}`,
          {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            }
          }
        );

        if (agentResponse.ok) {
          const agent = await agentResponse.json() as any;
          success(`Agent verified: ${agent.name || process.env.ELEVENLABS_AGENT_ID}`);
        } else if (agentResponse.status === 404) {
          warn(`Agent ID not found: ${process.env.ELEVENLABS_AGENT_ID}`);
        } else {
          warn(`Could not verify agent: ${agentResponse.status}`);
        }
      } catch (err: any) {
        warn(`Could not verify agent: ${err.message}`);
      }
    }

    return true;
  } catch (err: any) {
    error(`ElevenLabs connection failed: ${err.message}`);
    return false;
  }
}

async function testWebhooks() {
  console.log('\n🔗 Testing Webhook Configuration...');
  
  if (process.env.WEBHOOK_BASE_URL) {
    success(`Webhook base URL configured: ${process.env.WEBHOOK_BASE_URL}`);
    
    // Check if the URL is reachable
    try {
      const response = await fetch(`${process.env.WEBHOOK_BASE_URL}/health`, {
        method: 'GET',
        timeout: 5000
      } as any);
      
      if (response.ok) {
        success('Webhook endpoint is reachable');
      } else {
        warn(`Webhook endpoint returned ${response.status}`);
      }
    } catch (err: any) {
      warn(`Could not reach webhook endpoint: ${err.message}`);
    }
  } else {
    warn('WEBHOOK_BASE_URL not configured');
  }

  // Check webhook secrets
  if (process.env.ELEVENLABS_WEBHOOK_SECRET) {
    success('ElevenLabs webhook secret configured');
  } else {
    warn('ELEVENLABS_WEBHOOK_SECRET not configured (signature verification disabled)');
  }

  return true;
}

async function checkEnvironmentVariables() {
  console.log('\n🔧 Checking Environment Variables...');
  
  const required = [
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_AGENT_ID',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];

  const optional = [
    'ELEVENLABS_PHONE_NUMBER_ID',
    'ELEVENLABS_WEBHOOK_SECRET',
    'SUPABASE_SERVICE_KEY',
    'WEBHOOK_BASE_URL',
    'HUMAN_AGENT_NUMBER',
    'STORE_NAME',
    'STORE_ADDRESS'
  ];

  let allRequired = true;

  for (const key of required) {
    if (process.env[key]) {
      success(`${key} is set`);
    } else {
      error(`${key} is missing (REQUIRED)`);
      allRequired = false;
    }
  }

  console.log('\nOptional variables:');
  for (const key of optional) {
    if (process.env[key]) {
      info(`${key} is set`);
    } else {
      warn(`${key} is not set (optional)`);
    }
  }

  return allRequired;
}

async function main() {
  console.log('=' .repeat(50));
  console.log('🔍 BICI Voice Agent - API Connection Test');
  console.log('=' .repeat(50));

  const results = {
    env: await checkEnvironmentVariables(),
    supabase: await testSupabase(),
    twilio: await testTwilio(),
    elevenlabs: await testElevenLabs(),
    webhooks: await testWebhooks()
  };

  console.log('\n' + '=' .repeat(50));
  console.log('📋 Test Summary:');
  console.log('=' .repeat(50));

  const allPassed = Object.values(results).every(r => r);
  
  for (const [service, passed] of Object.entries(results)) {
    const status = passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`${service.padEnd(15)} : ${status}`);
  }

  console.log('=' .repeat(50));
  
  if (allPassed) {
    success('\n✅ All API connections are working!');
    process.exit(0);
  } else {
    error('\n❌ Some API connections failed. Check the errors above.');
    process.exit(1);
  }
}

// Run the tests
main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});