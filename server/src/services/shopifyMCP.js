const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const path = require('path');

class ShopifyMCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('🔌 Connecting to Shopify MCP server...');
      
      // Path to the MCP server - use absolute path
      const mcpServerPath = path.resolve(__dirname, '../../mcp-servers/shopify/index.js');
      
      console.log('🔍 MCP server path:', mcpServerPath);
      
      // Check if the file exists
      const fs = require('fs');
      if (!fs.existsSync(mcpServerPath)) {
        throw new Error(`MCP server file not found at: ${mcpServerPath}`);
      }
      
      // Spawn the MCP server process
      const serverProcess = spawn('node', [mcpServerPath], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          // Pass through Shopify credentials from environment
          SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
          SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN
        }
      });

      // Create transport
      this.transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout
      });

      // Create client
      this.client = new Client({
        name: 'bici-shopify-client',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {}
        }
      });

      // Connect to server
      await this.client.connect(this.transport);
      
      console.log('✅ Connected to Shopify MCP server');
      
      // List available tools
      const tools = await this.client.listTools();
      console.log('🛠️  Available Shopify tools:', tools.tools.map(t => t.name).join(', '));
      
      this.isConnected = true;
      return this;

    } catch (error) {
      console.error('❌ Failed to connect to Shopify MCP server:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async callTool(toolName, args = {}) {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected. Call connect() first.');
    }

    try {
      console.log(`🔧 Calling Shopify MCP tool: ${toolName}`, args);
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });
      
      console.log(`✅ Tool ${toolName} completed successfully`);
      return result;
      
    } catch (error) {
      console.error(`❌ Tool ${toolName} failed:`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.isConnected = false;
      console.log('🔌 Disconnected from Shopify MCP server');
    }
  }
}

// Global client instance
let globalClient = null;

async function setupShopifyMCP() {
  if (!globalClient) {
    console.log('🚀 Setting up new Shopify MCP client...');
    globalClient = new ShopifyMCPClient();
    await globalClient.connect();
  }
  return globalClient;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (globalClient) {
    await globalClient.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (globalClient) {
    await globalClient.disconnect();
  }
  process.exit(0);
});

module.exports = {
  ShopifyMCPClient,
  setupShopifyMCP
};