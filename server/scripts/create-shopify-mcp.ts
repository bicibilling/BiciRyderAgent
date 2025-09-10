#!/usr/bin/env tsx

/**
 * Script to create a Shopify MCP server for ElevenLabs agent
 * This will create an MCP server that connects to the BICI Shopify store
 */

import axios from 'axios';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const SHOPIFY_MCP_URL = 'https://bici.cc/api/mcp';
const MCP_SERVER_NAME = 'BICI Shopify Store';

interface McpServerConfig {
  url: string;
  name: string;
}

interface CreateMcpServerPayload {
  config: McpServerConfig;
}

async function createShopifyMcpServer(apiKey: string): Promise<void> {
  console.log('Creating Shopify MCP server for BICI store...');
  
  try {
    const payload: CreateMcpServerPayload = {
      config: {
        url: SHOPIFY_MCP_URL,
        name: MCP_SERVER_NAME
      }
    };

    console.log('MCP Server Configuration:');
    console.log(`  Name: ${payload.config.name}`);
    console.log(`  URL: ${payload.config.url}`);
    console.log('');

    const response = await axios.post(
      `${ELEVENLABS_API_BASE}/convai/mcp-servers`,
      payload,
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ MCP Server created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Save the MCP server ID for later use
    if (response.data && response.data.id) {
      console.log(`\n🆔 MCP Server ID: ${response.data.id}`);
      console.log('Save this ID - you\'ll need it to configure the agent.');
    }

  } catch (error: any) {
    console.error('❌ Error creating MCP server:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      // Handle specific error cases
      if (error.response.status === 401) {
        console.error('\n💡 Tip: Check your API key is correct and has the right permissions');
      } else if (error.response.status === 400) {
        console.error('\n💡 Tip: The MCP server URL might not be valid or accessible');
      }
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    
    throw error;
  }
}

async function testShopifyMcpEndpoint(): Promise<boolean> {
  console.log('Testing Shopify MCP endpoint accessibility...');
  
  try {
    const response = await axios.post(
      SHOPIFY_MCP_URL,
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
        params: {}
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Shopify MCP endpoint is accessible');
    console.log('Available tools:', JSON.stringify(response.data, null, 2));
    return true;
    
  } catch (error: any) {
    console.log('⚠️  Shopify MCP endpoint test failed:');
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    
    console.log('\n💡 This might be expected - some stores may require specific headers or have restrictions.');
    console.log('   The MCP server creation can still proceed.');
    return false;
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY environment variable is required');
    console.error('Usage: ELEVENLABS_API_KEY=your_key npx tsx scripts/create-shopify-mcp.ts');
    process.exit(1);
  }

  console.log('🛍️  BICI Shopify MCP Server Setup');
  console.log('==================================\n');
  
  // Test the Shopify endpoint first
  await testShopifyMcpEndpoint();
  console.log('');
  
  // Create the MCP server
  await createShopifyMcpServer(apiKey);
  
  console.log('\n🎉 Setup complete!');
  console.log('\nNext steps:');
  console.log('1. Copy the MCP Server ID from above');
  console.log('2. Update your agent configuration to include this MCP server');
  console.log('3. Sync your agent with: convai sync --env prod');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });
}

export { createShopifyMcpServer, testShopifyMcpEndpoint };