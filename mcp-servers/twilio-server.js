#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types');

class TwilioServer {
  constructor() {
    this.server = new Server(
      {
        name: 'twilio-server',
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
          name: 'send_sms',
          description: 'Send an SMS message via Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient phone number (E.164 format: +1234567890)'
              },
              body: {
                type: 'string',
                description: 'Message content'
              },
              from: {
                type: 'string',
                description: 'Twilio phone number (optional, uses default if not provided)'
              }
            },
            required: ['to', 'body']
          }
        },
        {
          name: 'make_call',
          description: 'Initiate a phone call via Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient phone number (E.164 format)'
              },
              from: {
                type: 'string',
                description: 'Twilio phone number (optional)'
              },
              twiml_url: {
                type: 'string',
                description: 'URL with TwiML instructions for the call'
              },
              webhook_url: {
                type: 'string',
                description: 'Webhook URL for call status updates'
              }
            },
            required: ['to']
          }
        },
        {
          name: 'get_call_logs',
          description: 'Retrieve recent call logs from Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of calls to retrieve (default: 20)',
                default: 20
              },
              phone_number: {
                type: 'string',
                description: 'Filter by specific phone number'
              },
              status: {
                type: 'string',
                description: 'Filter by call status (completed, busy, no-answer, etc.)'
              }
            }
          }
        },
        {
          name: 'get_sms_logs',
          description: 'Retrieve recent SMS logs from Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of messages to retrieve (default: 20)',
                default: 20
              },
              phone_number: {
                type: 'string',
                description: 'Filter by specific phone number'
              }
            }
          }
        },
        {
          name: 'lookup_phone',
          description: 'Lookup phone number information using Twilio Lookup API',
          inputSchema: {
            type: 'object',
            properties: {
              phone_number: {
                type: 'string',
                description: 'Phone number to lookup (E.164 format)'
              },
              country_code: {
                type: 'string',
                description: 'Country code if phone number is not in E.164 format'
              }
            },
            required: ['phone_number']
          }
        },
        {
          name: 'create_conference',
          description: 'Create a Twilio conference room',
          inputSchema: {
            type: 'object',
            properties: {
              friendly_name: {
                type: 'string',
                description: 'Conference room name'
              },
              record: {
                type: 'boolean',
                description: 'Whether to record the conference',
                default: false
              }
            },
            required: ['friendly_name']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'send_sms':
            return await this.sendSMS(args);
          case 'make_call':
            return await this.makeCall(args);
          case 'get_call_logs':
            return await this.getCallLogs(args);
          case 'get_sms_logs':
            return await this.getSMSLogs(args);
          case 'lookup_phone':
            return await this.lookupPhone(args);
          case 'create_conference':
            return await this.createConference(args);
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

  getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required');
    }

    const twilio = require('twilio');
    return twilio(accountSid, authToken);
  }

  async sendSMS(args) {
    const client = this.getTwilioClient();
    const fromNumber = args.from || process.env.TWILIO_PHONE_NUMBER;
    
    if (!fromNumber) {
      throw new Error('From phone number is required (provide via args.from or TWILIO_PHONE_NUMBER env var)');
    }

    const message = await client.messages.create({
      body: args.body,
      from: fromNumber,
      to: args.to
    });

    return {
      content: [
        {
          type: 'text',
          text: `SMS sent successfully!\nSID: ${message.sid}\nTo: ${message.to}\nStatus: ${message.status}`,
        },
      ],
    };
  }

  async makeCall(args) {
    const client = this.getTwilioClient();
    const fromNumber = args.from || process.env.TWILIO_PHONE_NUMBER;
    
    if (!fromNumber) {
      throw new Error('From phone number is required');
    }

    const callOptions = {
      from: fromNumber,
      to: args.to
    };

    if (args.twiml_url) {
      callOptions.url = args.twiml_url;
    }
    if (args.webhook_url) {
      callOptions.statusCallback = args.webhook_url;
      callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
    }

    const call = await client.calls.create(callOptions);

    return {
      content: [
        {
          type: 'text',
          text: `Call initiated successfully!\nSID: ${call.sid}\nTo: ${call.to}\nStatus: ${call.status}`,
        },
      ],
    };
  }

  async getCallLogs(args) {
    const client = this.getTwilioClient();
    
    const options = {
      limit: args.limit || 20
    };

    if (args.phone_number) {
      options.to = args.phone_number;
    }
    if (args.status) {
      options.status = args.status;
    }

    const calls = await client.calls.list(options);

    return {
      content: [
        {
          type: 'text',
          text: `Retrieved ${calls.length} call logs:\n` +
                calls.map(call => 
                  `- ${call.sid}: ${call.from} → ${call.to} (${call.status}) at ${call.dateCreated}`
                ).join('\n'),
        },
      ],
    };
  }

  async getSMSLogs(args) {
    const client = this.getTwilioClient();
    
    const options = {
      limit: args.limit || 20
    };

    if (args.phone_number) {
      options.to = args.phone_number;
    }

    const messages = await client.messages.list(options);

    return {
      content: [
        {
          type: 'text',
          text: `Retrieved ${messages.length} SMS logs:\n` +
                messages.map(msg => 
                  `- ${msg.sid}: ${msg.from} → ${msg.to} (${msg.status}) at ${msg.dateCreated}\n  Body: ${msg.body.substring(0, 50)}...`
                ).join('\n'),
        },
      ],
    };
  }

  async lookupPhone(args) {
    const client = this.getTwilioClient();
    
    try {
      const phoneNumber = await client.lookups.v1.phoneNumbers(args.phone_number)
        .fetch({
          countryCode: args.country_code,
          type: ['carrier', 'caller-name']
        });

      return {
        content: [
          {
            type: 'text',
            text: `Phone lookup results:\n` +
                  `Number: ${phoneNumber.phoneNumber}\n` +
                  `Country: ${phoneNumber.countryCode}\n` +
                  `Carrier: ${phoneNumber.carrier?.name || 'Unknown'}\n` +
                  `Type: ${phoneNumber.carrier?.type || 'Unknown'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Phone lookup failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async createConference(args) {
    const client = this.getTwilioClient();
    
    const conference = await client.conferences.create({
      friendlyName: args.friendly_name,
      record: args.record || false
    });

    return {
      content: [
        {
          type: 'text',
          text: `Conference created successfully!\nSID: ${conference.sid}\nName: ${conference.friendlyName}\nStatus: ${conference.status}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Twilio MCP server running on stdio');
  }
}

const server = new TwilioServer();
server.run().catch(console.error);