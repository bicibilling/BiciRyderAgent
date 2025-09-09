# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express + TypeScript backend (`src/`, `dist/`, `scripts/`, `public/`). Tests live in `server/src/__tests__` (e2e, integration, performance, helpers).
- `client/`: React + Vite + TypeScript dashboard (`src/`, `dist/`). Tailwind is configured via `tailwind.config.js`.
- Root utilities: `agent_configs/`, `agents.json`, `database/`, `knowledge-base/`, `logs/`, `scripts/`.
- Environment files: `.env`, `.env.example` at root and in `server/`.

## Build, Test, and Development Commands
- Install all: `npm run install:all` — installs root, server, and client deps.
- Develop both: `npm run dev` — runs `server` and `client` concurrently.
- Backend only: `npm run server:dev` (or `cd server && npm run dev`).
- Frontend only: `npm run client:dev` (or `cd client && npm run dev`).
- Build for deploy: `npm run build` (uses `render-build.sh`).
- Start API: `npm start` (serves built server on port 3001).
- Server tests: `cd server && npm test`.
  - Subsets: `npm run test:unit | test:integration | test:e2e | test:performance`.

## Coding Style & Naming Conventions
- Language: TypeScript in `server/` and `client/`.
- Indentation: 2 spaces; keep existing import/grouping patterns.
- Files: kebab-case in server (e.g., `conversation.service.ts`); PascalCase for React components.
- Identifiers: camelCase for vars/functions; PascalCase for types/interfaces; UPPER_SNAKE_CASE for env vars.
- Logging: use `server/src/utils/logger.ts` in backend (avoid `console.log`).

## Testing Guidelines
- Framework: Jest (ts-jest) for server. Tests end with `.test.ts` or live under `__tests__/`.
- Coverage: Jest outputs to `server/coverage` (text, lcov, html). Aim to cover new/changed code paths.
- Env: use `server/src/__tests__/.env.test` and helpers in `server/src/__tests__/helpers`.
- Run targeted suites, e.g., `npm --prefix server run test:integration`.

## Commit & Pull Request Guidelines
- Commits: imperative, concise, scoped (e.g., “Fix SMS JSON parsing in webhook”).
- PRs: include summary, rationale, linked issues, test plan and results; screenshots/GIFs for UI changes; note env/config changes (`.env.example`).
- Keep changes focused; update docs when behavior or commands change.

## Security & Configuration Tips
- Secrets: never commit `.env`; start from `.env.example` (`cp .env.example .env` in root and `server/`).
- Node: use Node >= 18 and npm >= 9. CORS and ports are set in `server/src/app.ts` (API default 3001; Vite dev 5173).
- Third-party: Twilio, ElevenLabs, Supabase, and Redis require valid credentials; see `server/src/config/*.config.ts`.
