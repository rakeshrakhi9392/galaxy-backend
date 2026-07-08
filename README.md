# Galaxy Workflow Builder — Backend

Next.js REST API, workflow orchestrator, provider runtime, Prisma/PostgreSQL persistence, Trigger.dev durable execution, and MCP server.

---

## Live URLs

| Resource | URL |
| --- | --- |
| API base | `https://galaxy-backend-kappa.vercel.app/api/v1` |
| OpenAPI | `https://galaxy-backend-kappa.vercel.app/api/v1/openapi.json` |
| MCP | `https://galaxy-backend-kappa.vercel.app/api/mcp` |
| Docs (Mintlify) | `https://abcd-311b96b4.mintlify.app` |

---

## Setup Instructions

### Prerequisites

Node.js 22+, pnpm 9+, PostgreSQL 14+, Trigger.dev account, Clerk account

### Commands

```bash
pnpm install
cp .env.example .env
# fill in .env (see below)

pnpm db:migrate
pnpm seed

# Terminal 1
pnpm dev

# Terminal 2
pnpm trigger:dev
```

**Verify:**

```bash
curl http://localhost:4010/api/v1/nodes

curl http://localhost:4010/api/v1/workflows \
  -H "Authorization: Bearer gal_dev_test_key_12345"
```

**Also:**

```bash
pnpm test
pnpm lint
pnpm generate:nodes
pnpm generate:openapi
```

**Deploy:**

```bash
pnpm build
pnpm exec trigger deploy
```

### Environment Variables

| Variable | Example / Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://galaxy:galaxy@localhost:5432/galaxy` |
| `TRIGGER_SECRET_KEY` | from Trigger.dev dashboard |
| `TRIGGER_PROJECT_REF` | `proj_xxxx` |
| `FRONTEND_URL` | `http://localhost:3000` |
| `CLERK_SECRET_KEY` | from Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | from Clerk dashboard |
| `DEV_API_KEY` | `gal_dev_test_key_12345` |
| `OPENROUTER_API_KEY` | for real LLM runs |
| `TRANSLOADIT_AUTH_KEY` | for file uploads |
| `TRANSLOADIT_AUTH_SECRET` | for file uploads |
| `UNKEY_ROOT_KEY` | for API key mgmt (prod) |
| `UNKEY_API_ID` | for API key mgmt (prod) |
| `AUTH_DISABLED` | `true` — local auth bypass only |
| `TRIGGER_INTEGRATION` | `1` — for integration tests |

---

## Architecture Overview

```
Clients (Browser · REST API · MCP)
              │
              ▼
        /api/v1  +  /api/mcp
    Clerk JWT  ·  API keys (gal_…)
              │
              ▼
       Next.js Route Handlers
              │
              ▼
         Prisma / PostgreSQL
   workflows · runs · credits · webhooks
              │
              ▼
   Trigger.dev: orchestrate-workflow-run
              │
              ▼
   orchestrateWorkflowRunCore (scheduler)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
request/response    execute-node-{type}
(inline)            (Trigger child tasks)
                          │
                          ▼
                    executeNode
                          │
                          ▼
                   Provider chain
                          │
                          ▼
              OpenRouter · FFmpeg · stubs
```

### Layers

| Layer | Location | Role |
| --- | --- | --- |
| **Schemas** | `src/schemas/` (`@galaxy/schemas`) | Shared Zod types for graphs, node I/O, API, and UI config |
| **Node catalog** | `src/nodes/catalog/` | One file per node — schemas, UI, credits, execution |
| **Orchestrator** | `src/lib/runOrchestration.ts` | DAG scheduling, waves, credits, partial results |
| **Trigger tasks** | `src/trigger/` | Durable orchestrator + per-node child tasks |
| **Providers** | `src/providers/` | OpenRouter, FFmpeg, webhook stubs |
| **API** | `src/app/api/v1/` | REST endpoints, auth, rate limits |
| **MCP** | `src/mcp/` + `/api/mcp` | MCP server for external agents |
| **Docs** | `docs/` | Mintlify + OpenAPI spec |

### Execution Flow

1. Client calls `POST /api/v1/workflows/:id/runs`
2. Backend snapshots the graph, checks credits, creates `WorkflowRun`
3. Trigger runs `orchestrate-workflow-run`
4. Scheduler groups ready nodes into **waves** (parallel within a wave, sequential across waves)
5. Each remote node runs as `execute-node-{type}` via `batch.triggerByTaskAndWait`
6. Node calls provider chain → validates output with Zod
7. Results saved to `NodeRun` + streamed via Trigger Realtime
8. Credits deducted per successful node; webhooks fired on lifecycle events

### Key Design Points

- **Single source of truth** — `@galaxy/schemas` drives API, UI config, validation, and execution contracts
- **Framework-agnostic core** — scheduling logic is plain TypeScript; Trigger.dev is the execution adapter
- **Immutable snapshots** — each run stores its own graph copy for reproducible history
- **Provider abstraction** — orchestrator never talks to external APIs directly
- **One client path** — UI, REST, and MCP all use the same run creation pipeline

---

## Design Decisions & Trade-offs

### 1. Schema-Driven Node Architecture

Every workflow node is defined as a single contract containing its Zod schemas, UI configuration, credit estimation, and execution logic. The same definitions are shared across the frontend, backend, REST API, and MCP server, making it easy to add new node types without modifying the orchestrator. The trade-off is tighter coupling to the shared schema package, but it provides a single source of truth and prevents frontend/backend drift.

### 2. Parallel DAG Execution with Trigger.dev

The workflow engine executes independent nodes in parallel while respecting graph dependencies through topological execution. Trigger.dev is used as the execution engine, while the orchestration logic remains framework-agnostic and independently testable. This improves scalability and enables efficient execution of complex workflows, with the trade-off of introducing an external orchestration dependency.

### 3. Immutable Workflow Snapshots

Each workflow run stores an immutable snapshot of the workflow graph at execution time instead of reading the latest workflow definition. This guarantees reproducible executions, reliable debugging, and accurate execution history even if a workflow is edited while a run is in progress. The trade-off is additional storage per run, which could be optimized in the future through snapshot deduplication.

---

## What I'd Improve With More Time

- **Credit Reservation:** Reserve estimated credits before execution and capture only actual usage to prevent race conditions during concurrent runs.
- **Asynchronous Webhooks:** Move webhook delivery to background jobs with retries and dead-letter handling so external endpoints don't delay workflow completion.
- **Provider Retry Budget:** Add a configurable limit on provider retry attempts per workflow run to avoid excessive retries and unnecessary API usage.
- **Snapshot Deduplication:** Store workflow graph snapshots using hash-based deduplication to reduce storage while preserving reproducibility.
- **Scheduled & Event Triggers:** Support cron schedules and event-driven executions (e.g., webhooks) using the existing execution pipeline.
- **Per-User Concurrency Limits:** Limit the number of simultaneous workflow executions per user with queueing to ensure fair resource utilization.
