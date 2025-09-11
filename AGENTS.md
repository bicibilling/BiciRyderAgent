# Agents

This project uses ElevenLabs Conversational AI “agents” for voice and text. Agents are defined as JSON configuration files and referenced by environment variables. The backend enriches the agent with dynamic variables (customer context, business hours, greeting) via webhooks.

## Where Things Live
- Agent registry: `agents.json` (root) and `server/agents.json` — friendly names and config pointers.
- Agent configs (app-level): `agent_configs/prod/*.json` — main agent definitions (ASR/TTS, prompt, webhooks, widget, language presets).
- Agent configs (server reference): `server/agent_configs/prod/*.json` — historical/alternate versions for reference.
- Backend config/env: `server/src/config/*.config.ts` (ElevenLabs, Twilio, Redis, Supabase).
- Webhooks: `server/src/webhooks/elevenlabs.webhook.ts` and `server/src/webhooks/twilio.webhook.ts`.
- Greeting/dynamic variables helper: `server/src/utils/greeting.helper.ts`.

## Active Agent Selection
- Runtime uses environment variables, not the JSON registry, to decide which agent handles calls.
  - `ELEVENLABS_AGENT_ID`: the live agent to connect for calls and SMS-generated responses (via WebSocket API).
  - `ELEVENLABS_PHONE_NUMBER_ID`: the ElevenLabs phone number resource (if using ElevenLabs telephony).
- The JSON registry (`agents.json`) is a source of truth for available configs and IDs, but the server reads `ELEVENLABS_AGENT_ID` directly at runtime.

## Key Agent Config Fields
Common fields in `agent_configs/prod/*.json` (names may vary per agent):
- `conversation_config.asr`: ASR provider and input format (e.g., ElevenLabs, `pcm_16000`).
- `conversation_config.tts`: TTS model/voice and output format (e.g., `eleven_turbo_v2`, `ulaw_8000`).
- `conversation_config.turn`: turn-taking and silence thresholds.
- `conversation_config.conversation`: `text_only`, `max_duration_seconds`, and enabled client events.
- `webhooks`: events like `conversation_initiation` and `post_call` pointing to your backend.
- `agent.first_message`: should use `{{dynamic_greeting}}`.
- `agent.dynamic_variables.dynamic_variable_placeholders`: all dynamic vars your webhook supplies.
- `agent.prompt`: the system prompt, temperature, tool/mcp settings, and optional RAG.
- `language_presets`: per-language overrides for first message and prompt.

See examples:
- Unified: `agent_configs/prod/bici_unified_agent.json`
- Voice: `agent_configs/prod/bike_agent.json`
- Multilingual: `agent_configs/prod/bike_agent_new.json`

## Dynamic Variables Enrichment
On inbound calls or SMS, the backend builds context and returns dynamic variables consumed by the agent:
- Source: `server/src/webhooks/elevenlabs.webhook.ts` and `server/src/webhooks/twilio.webhook.ts`.
- Helpers: `server/src/utils/greeting.helper.ts` for time/day context and cached greetings.
- Examples of variables provided:
  - `dynamic_greeting`, `customer_name`, `customer_phone`
  - `conversation_context`, `previous_summary`, `lead_status`, `bike_interest`
  - `organization_name`, `organization_id`, `location_address`, `business_hours`
  - Auxiliary like `greeting_opener`, `greeting_variation` for outbound continuity

Tip: Keep `agent.first_message` as `{{dynamic_greeting}}` and avoid repeating the full introduction later in the prompt.

## Webhooks and Call/SMS Flow
- ElevenLabs webhooks (configure in ElevenLabs dashboard):
  - `POST /webhooks/elevenlabs/conversation-initiation` — supplies dynamic variables at call start.
  - `POST /webhooks/elevenlabs/post-call` — transcript, analysis, metadata; persisted to Supabase.
- SMS (via Twilio in this codebase):
  - `POST /webhooks/twilio/sms` — receive inbound SMS, build context, generate response through ElevenLabs WS, send SMS back.
  - `POST /webhooks/twilio/sms/status` — delivery status updates.

See: `server/src/app.ts` → `setupWebhooks(app)` and `server/src/webhooks/index.ts`.

## Human Escalation and Transfers
- Human control: `server/src/services/humanControl.service.ts` with Redis-backed session tracking.
- Call sessions: `server/src/services/callSession.service.ts` caches and updates session state.
- ElevenLabs transfer endpoint is wired in config: `server/src/config/elevenlabs.config.ts` (`endpoints.transfer`).
- The system prompts instruct immediate transfer when customers ask for a human during business hours.

## Adding or Changing an Agent
1) Create or edit a config in `agent_configs/prod/*.json`.
2) Register it in `agents.json` with a friendly name and optional `agent_id`.
3) In ElevenLabs dashboard, ensure the agent’s webhooks point to your deployed backend.
4) Set `ELEVENLABS_AGENT_ID` in `server/.env` to the desired agent.
5) Verify voice settings (ASR/TTS formats) match your telephony path (e.g., `ulaw_8000` for PSTN).
6) Test end-to-end (inbound call, dynamic variables applied, transfer flow, post-call webhook stored).

## Required Environment Variables (Server)
- ElevenLabs: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET`
- Twilio (SMS): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- App: `WEBHOOK_BASE_URL`, `JWT_SECRET`

See sample in `README.md` and `server/.env.example`.

## Telephony Routing Notes
- Voice: This code assumes inbound calls ultimately reach the ElevenLabs agent (either by using an ElevenLabs-provisioned number or by forwarding from your carrier/PBX to that number).
- If you keep an external number (e.g., Zoom Phone), configure call forwarding/auto-receptionist to the ElevenLabs number. Enable “preserve original caller ID” so the backend receives the real `caller_id`.
- Transfers back to humans: The agent can transfer to any PSTN/DID (e.g., a Zoom user, ring group, or queue). Configure the target number in your prompt/logic.

## Operational Details
- Context/greeting caching: Redis-backed caches in `redis.service.ts` to speed up context building.
- Business hours and store info: `server/src/config/elevenlabs.config.ts`.
- Logging: `server/src/utils/logger.ts` (avoid `console.log`).
- Tests: server Jest tests under `server/src/__tests__` (integration, e2e, performance).

