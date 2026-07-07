# Galaxy API Documentation (Mintlify)

Interactive API documentation hosted on [Mintlify](https://mintlify.com).

## Local preview

```bash
npm i -g mintlify
cd docs
mintlify dev
```

Open `http://localhost:3000` (Mintlify default port). Run from the **backend repo root** (`backend/docs/`).

Validate config without starting a server:

```bash
cd docs
mintlify validate
```

## Deploy to Mintlify hosted domain

Mintlify hosts docs at `{subdomain}.mintlify.app` (or a custom domain you configure later).

Configuration lives in `docs/docs.json` (Mintlify's current format). Preview locally with `mint dev` from the `docs/` folder.

### One-time setup

1. Push this repo to GitHub (if not already).
2. Go to [Mintlify Dashboard](https://dashboard.mintlify.com) → **New docs**.
3. Connect the GitHub repository.
4. Set **Docs directory** to `docs` (at the backend repo root).
5. Choose a subdomain, e.g. `galaxy-api` → live at `https://galaxy-api.mintlify.app`.
6. Click **Deploy**.

Mintlify auto-redeploys on every push to the default branch.

### After deploy

Update these URLs to your live Mintlify domain:

| Location | Field |
| --- | --- |
| `frontend/src/components/layout/AppSidebar.tsx` | API and MCP nav link |
| `docs/docs.json` | `navbar.primary.href` (if dashboard URL differs) |

Example sidebar link:

```tsx
href: "https://galaxy-api.mintlify.app/introduction"
```

## OpenAPI spec sync

The backend serves the live spec at `GET /api/v1/openapi.json`.

Regenerate the static copy in `docs/openapi.json` after API changes:

```bash
cd backend
pnpm generate:openapi
```

This runs `src/scripts/generateOpenApi.ts`, which writes the spec assembled from `src/lib/openapi/`. A Vitest coverage test ensures every public route is documented.

Mintlify will pick up the updated spec on the next deploy.

## Site structure

| Page | Content |
| --- | --- |
| `introduction.mdx` | Overview and doc map |
| `setup.mdx` | Local dev and env vars |
| `authentication.mdx` | API keys and rate limits |
| `quickstart.mdx` | First run in 4 steps |
| `workflows.mdx` | CRUD, runs, polling, idempotency |
| `nodes.mdx` | Node catalog and types |
| `webhooks.mdx` | Outbound events and signatures |
| `errors.mdx` | Error codes and retry behavior |
| `examples.mdx` | curl / Python / JS samples |
| `openapi.json` | OpenAPI 3.1 for API Reference tab |
