import { openApiComponents } from "./components";
import { openApiPaths } from "./paths";

/** OpenAPI 3.1 specification for the Galaxy public REST API. */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Galaxy Workflow API",
    version: "1.0.0",
    description:
      "Execute AI workflows programmatically. Authenticate with a Bearer API key (`gal_…`). " +
      "Rate limits apply per API key via Unkey. Outbound webhooks emit run lifecycle events.",
    contact: {
      name: "Galaxy",
      url: "https://galaxy.ai",
    },
  },
  servers: [
    { url: "https://api.galaxy.ai", description: "Production" },
    { url: "http://localhost:4010", description: "Local backend" },
  ],
  tags: [
    { name: "Documentation", description: "Machine-readable API specification" },
    { name: "Workflows", description: "Workflow CRUD and execution" },
    { name: "Runs", description: "Workflow run status and history" },
    { name: "Nodes", description: "Node catalog and credit estimation" },
    { name: "API Keys", description: "Manage programmatic access keys" },
    { name: "Webhooks", description: "Outbound webhook endpoint registration" },
    { name: "Credits", description: "Account credit balance and ledger" },
    { name: "Uploads", description: "File upload configuration and proxy" },
  ],
  paths: openApiPaths,
  components: openApiComponents,
  security: [{ BearerAuth: [] }],
} as const;

export type OpenApiSpec = typeof openApiSpec;
