#!/usr/bin/env node

/**
 * Script to create a BICI Shopify MCP server for ElevenLabs agent
 */

const axios = require('axios');
require('dotenv').config({ path: '../.env' });

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const MCP_SERVER_URL = 'https://bici-ryder-api.onrender.com/api/mcp';
const MCP_SERVER_NAME = 'BICI Ryder Shopify Store';

async function createMcpServer() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found in environment');
    process.exit(1);
  }
  
  console.log('Creating BICI Ryder MCP server...');
  console.log(`URL: ${MCP_SERVER_URL}`);
  console.log(`Name: ${MCP_SERVER_NAME}`);
  console.log('');
  
  try {
    // First test if the MCP endpoint is accessible
    console.log('🔍 Testing MCP endpoint...');
    const testResponse = await axios.post(MCP_SERVER_URL, {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (testResponse.data.result && testResponse.data.result.tools) {
      console.log(`✅ MCP endpoint working! Found ${testResponse.data.result.tools.length} tools`);
    } else {
      console.log('⚠️  MCP endpoint responded but no tools found');
    }
    
    // Create the MCP server in ElevenLabs
    console.log('📡 Creating MCP server in ElevenLabs...');
    const response = await axios.post(
      `${ELEVENLABS_API_BASE}/convai/mcp-servers`,
      {
        config: {
          url: MCP_SERVER_URL,
          name: MCP_SERVER_NAME
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ MCP Server created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.id) {
      console.log(`\n🆔 MCP Server ID: ${response.data.id}`);
      console.log('');
      console.log('💡 Next steps:');
      console.log('1. Copy this MCP Server ID');
      console.log('2. Add it to your agent configuration in the mcp_server_ids array');
      console.log('3. Remove the webhook-based tools from the agent config');
      console.log('4. Sync the agent with: convai sync --env dev');
    }
    
  } catch (error) {
    console.error('❌ Error:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - MCP endpoint may not be accessible');
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  createMcpServer();
}

module.exports = { createMcpServer };