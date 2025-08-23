#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types');

class ElevenLabsServer {
  constructor() {
    this.server = new Server(
      {
        name: 'elevenlabs-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_agent',
          description: 'Create a new ElevenLabs conversational AI agent',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Agent name'
              },
              prompt: {
                type: 'string', 
                description: 'System prompt for the agent'
              },
              voice_id: {
                type: 'string',
                description: 'ElevenLabs voice ID'
              },
              language: {
                type: 'string',
                description: 'Agent language (e.g., "en")',
                default: 'en'
              }
            },
            required: ['name', 'prompt']
          }
        },
        {
          name: 'update_agent',
          description: 'Update an existing ElevenLabs agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID to update'
              },
              name: {
                type: 'string',
                description: 'Agent name'
              },
              prompt: {
                type: 'string',
                description: 'System prompt for the agent'
              },
              voice_id: {
                type: 'string', 
                description: 'ElevenLabs voice ID'
              }
            },
            required: ['agent_id']
          }
        },
        {
          name: 'list_agents',
          description: 'List all ElevenLabs conversational AI agents',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'get_agent',
          description: 'Get details of a specific agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID'
              }
            },
            required: ['agent_id']
          }
        },
        {
          name: 'list_voices',
          description: 'List available ElevenLabs voices',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'get_conversations',
          description: 'Get conversation history for an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID'
              },
              limit: {
                type: 'number',
                description: 'Number of conversations to retrieve',
                default: 10
              }
            },
            required: ['agent_id']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_agent':
            return await this.createAgent(args);
          case 'update_agent':
            return await this.updateAgent(args);
          case 'list_agents':
            return await this.listAgents();
          case 'get_agent':
            return await this.getAgent(args);
          case 'list_voices':
            return await this.listVoices();
          case 'get_conversations':
            return await this.getConversations(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async makeElevenLabsRequest(endpoint, options = {}) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }

    const url = `https://api.elevenlabs.io/v1${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async createAgent(args) {
    const agentConfig = {
      name: args.name,
      conversation_config: {
        agent: {
          prompt: args.prompt,
          llm: {
            model: 'gpt-4',
            temperature: 0.2
          },
          language: args.language || 'en',
          tools: []
        },
        tts: {
          model: 'eleven_multilingual_v2',
          voice_id: args.voice_id || 'pNInz6obpgDQGcFmaJgB',
          audio_format: {
            format: 'pcm',
            sample_rate: 44100
          }
        },
        asr: {
          model: 'nova-2-general',
          language: 'auto'
        },
        conversation: {
          max_duration_seconds: 1800,
          text_only: false
        }
      }
    };

    const result = await this.makeElevenLabsRequest('/convai/agents', {
      method: 'POST',
      body: JSON.stringify(agentConfig),
    });

    return {
      content: [
        {
          type: 'text',
          text: `Agent created successfully! ID: ${result.agent_id}`,
        },
      ],
    };
  }

  async updateAgent(args) {
    const updateConfig = {};
    if (args.name) updateConfig.name = args.name;
    if (args.prompt) {
      updateConfig.conversation_config = {
        agent: { prompt: args.prompt }
      };
    }
    if (args.voice_id) {
      updateConfig.conversation_config = {
        ...updateConfig.conversation_config,
        tts: { voice_id: args.voice_id }
      };
    }

    await this.makeElevenLabsRequest(`/convai/agents/${args.agent_id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateConfig),
    });

    return {
      content: [
        {
          type: 'text',
          text: `Agent ${args.agent_id} updated successfully!`,
        },
      ],
    };
  }

  async listAgents() {
    const result = await this.makeElevenLabsRequest('/convai/agents');
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${result.agents.length} agents:\n` +
                result.agents.map(agent => 
                  `- ${agent.name} (ID: ${agent.agent_id})`
                ).join('\n'),
        },
      ],
    };
  }

  async getAgent(args) {
    const result = await this.makeElevenLabsRequest(`/convai/agents/${args.agent_id}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `Agent Details:\n` +
                `Name: ${result.name}\n` +
                `ID: ${result.agent_id}\n` +
                `Language: ${result.conversation_config?.agent?.language || 'N/A'}\n` +
                `Voice ID: ${result.conversation_config?.tts?.voice_id || 'N/A'}`,
        },
      ],
    };
  }

  async listVoices() {
    const result = await this.makeElevenLabsRequest('/voices');
    
    return {
      content: [
        {
          type: 'text',
          text: `Available voices:\n` +
                result.voices.slice(0, 10).map(voice => 
                  `- ${voice.name} (ID: ${voice.voice_id})`
                ).join('\n') +
                (result.voices.length > 10 ? `\n... and ${result.voices.length - 10} more` : ''),
        },
      ],
    };
  }

  async getConversations(args) {
    const result = await this.makeElevenLabsRequest(
      `/convai/agents/${args.agent_id}/conversations?limit=${args.limit || 10}`
    );
    
    return {
      content: [
        {
          type: 'text',
          text: `Recent conversations for agent ${args.agent_id}:\n` +
                result.conversations.map(conv => 
                  `- ${conv.conversation_id}: ${new Date(conv.created_at).toLocaleString()}`
                ).join('\n'),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('ElevenLabs MCP server running on stdio');
  }
}

const server = new ElevenLabsServer();
server.run().catch(console.error);