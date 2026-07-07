# Galaxy Workflow Builder — Backend

Next.js REST API, workflow orchestrator, provider runtime, Prisma/PostgreSQL persistence, Trigger.dev durable execution, and MCP server.

---

## Live URLs

| Resource | URL |
| --- | --- |
| API base | `https://YOUR-API.vercel.app/api/v1` |
| OpenAPI | `https://YOUR-API.vercel.app/api/v1/openapi.json` |
| MCP | `https://YOUR-API.vercel.app/api/mcp` |
| Docs (Mintlify) | `https://YOUR-SUBDOMAIN.mintlify.app` |

---

## Architecture

```
REST /api/v1          Clerk JWT  +  API keys (gal_…)
        │
        ▼
Route handlers ──► Prisma/PostgreSQL (workflows, runs, credits, audit)
        │
        ▼
Trigger.dev ──► orchestrate-workflow-run
        │
        ├── topological waves (parallel within, sequential across)
        ├── inline: request, response nodes
        └── child tasks: execute-node-{type}
                │
                ▼
        Provider chain (retries, timeout, fallback)
                │
                ▼
        OpenRouter · FFmpeg · webhook stubs (image/video)
```

| Layer | Path | Responsibility |
| --- | --- | --- |
| Schemas | `src/schemas/` (`@galaxy/schemas`) | Shared Zod — API, UI, execution |
| Node catalog | `src/nodes/catalog/` | One file per node type |
| Providers | `src/providers/` | Swappable `NodeProvider` implementations |
| Orchestrator | `src/lib/runOrchestration.ts` | DAG validation, waves, credits |
| Trigger tasks | `src/trigger/tasks/` | Durable node execution |
| OpenAPI | `src/lib/openapi/` + `docs/openapi.json` | Generated spec |
| Docs | `docs/` | Mintlify site |

### Execution model

1. `POST /workflows/:id/runs` creates a `WorkflowRun` and enqueues `orchestrate-workflow-run`.
2. Orchestrator topologically sorts the graph, rejects cycles, batches nodes into waves.
3. Remote nodes dispatch via `batch.triggerByTaskAndWait`.
4. Each task runs `executeNode` → `runProviderChain` with per-provider retries.
5. Progress streams via Trigger realtime metadata + `WorkflowNodeRun` rows.

### Auth

| Method | Use case |
| --- | --- |
| Clerk JWT | Browser sessions (via frontend) |
| API key `gal_…` | Programmatic REST + MCP |
| `AUTH_DISABLED=true` | Local dev only — maps to seeded mock user |

---

## Design decisions

### `@galaxy/schemas` as single source of truth

Workflow graphs, node I/O, API bodies, and UI field config share Zod schemas. No duplicated TypeScript interfaces.

### Node catalog + codegen

Each node is a config object in `catalog/<type>.ts`. `pnpm generate:nodes` syncs the Trigger task registry and frontend `nodeRegistry.ts`.

### Provider chain abstraction

Orchestrator never imports provider SDKs. Nodes declare ordered provider lists; swapping backends requires zero orchestrator changes.

### Trigger.dev for orchestration

Long-lived, parallel, webhook-capable execution with `triggerAndWait`, `wait.forToken`, and deployed FFmpeg workers.

---

## Trade-offs

| Choice | Benefit | Cost |
| --- | --- | --- |
| Next.js route handlers | Same stack as frontend | Not a dedicated API framework |
| Stub image/video providers | Demonstrates webhook-wait without paid keys | Not production integrations |
| `DEV_API_KEY` fallback | Simple reviewer testing | Not full Unkey lifecycle in dev |
| Credit ledger in Postgres | Auditable billing | No optimistic concurrency yet |

---

## Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 14+
- Trigger.dev account
- Clerk account (UI auth)
- Optional: OpenRouter, Transloadit, Unkey

---

## Setup

### 1. Install

```bash
pnpm install
cp .env.example .env
```

### 2. Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TRIGGER_SECRET_KEY` | Yes | Trigger.dev secret |
| `TRIGGER_PROJECT_REF` | Yes | Trigger project ref |
| `CLERK_SECRET_KEY` | UI auth | Clerk backend secret |
| `CLERK_PUBLISHABLE_KEY` | UI auth | Clerk publishable key |
| `FRONTEND_URL` | Yes | JWT audience — frontend origin |
| `DEV_API_KEY` | Dev | Default `gal_dev_test_key_12345` |
| `OPENROUTER_API_KEY` | Optional | Real LLM runs |
| `UNKEY_ROOT_KEY`, `UNKEY_API_ID` | Prod | API key management |

### 3. Database

```bash
pnpm db:migrate
pnpm seed
```

Seeds:

- Demo user `user_mock_clerk_123` / `demo@galaxy.ai`
- System workflow templates
- "Demo workflow" (request → LLM → response)
- Dev API key record matching `DEV_API_KEY`

### 4. Run

```bash
# Terminal 1 — API (:4010)
pnpm dev

# Terminal 2 — Trigger worker
pnpm trigger:dev
```

### 5. Verify

```bash
curl http://localhost:4010/api/v1/nodes

curl http://localhost:4010/api/v1/workflows \
  -H "Authorization: Bearer gal_dev_test_key_12345"
```

---

## Deploy

### API (Vercel / Railway)

1. Set all env vars from `.env.example`.
2. `pnpm build && pnpm start` (or platform default).
3. Run migrations + seed against production DB:

```bash
DATABASE_URL="postgresql://…" pnpm db:migrate
DATABASE_URL="postgresql://…" pnpm seed
```

4. Deploy Trigger worker:

```bash
pnpm exec trigger deploy
```

**Never** set `AUTH_DISABLED=true` in production.

### Mintlify docs

Docs live in `docs/`. Connect this repo in [Mintlify Dashboard](https://dashboard.mintlify.com), set docs directory to `docs`.

```bash
pnpm generate:openapi   # refresh docs/openapi.json
```

See `docs/README.md` for details.

---

## Codegen

```bash
pnpm generate:nodes     # → ../frontend/src/generated/nodeRegistry.ts (monorepo)
pnpm generate:openapi   # → docs/openapi.json
```

Both run automatically on `pnpm build`.

---

## Testing

```bash
pnpm test               # unit tests
pnpm test:watch
pnpm test:integration   # requires TRIGGER_INTEGRATION=1 + trigger:dev
pnpm lint
```

---

## Extending

### Add a node

1. Create `src/nodes/catalog/<type>.ts`
2. Add Zod schemas in `src/schemas/nodes/`
3. Register in `src/nodes/catalog/index.ts`
4. `pnpm generate:nodes`

### Add a provider

1. Implement `NodeProvider` in `src/providers/<name>/`
2. Wire into node's provider index
3. No orchestrator changes

---

## If there were more time

- **Live OpenAI / Kling providers** behind existing `NodeProvider` interface
- **Unkey everywhere** — create, revoke, rate-limit without dev fallback
- **Optimistic concurrency** on credit balance updates
- **CI pipeline** — lint, test, build, OpenAPI diff on every PR
- **docker-compose** for Postgres + auto-seed
- **Structured logging** with run/node/provider correlation IDs

---

## Related

- Frontend repo: React Flow editor
- Submission checklist: `SUBMISSION.md` (monorepo root)
