/** OpenAPI path definitions for all public /api/v1 routes. */

const authed = {
  security: [{ BearerAuth: [] }],
} as const;

const publicOp = {
  security: [] as [],
} as const;

const stdErrors = {
  "401": { $ref: "#/components/responses/Unauthorized" },
  "429": { $ref: "#/components/responses/RateLimited" },
} as const;

export const openApiPaths = {
  "/api/v1/openapi.json": {
    get: {
      tags: ["Documentation"],
      summary: "OpenAPI specification",
      operationId: "getOpenApiSpec",
      ...publicOp,
      responses: {
        "200": {
          description: "OpenAPI 3.1 document",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/v1/account": {
    get: {
      tags: ["Credits"],
      summary: "Get account summary",
      operationId: "getAccount",
      ...authed,
      responses: {
        "200": {
          description: "Account credit balance",
          content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } },
        },
        ...stdErrors,
      },
    },
  },
  "/api/v1/workflows": {
    get: {
      tags: ["Workflows"],
      summary: "List workflows",
      operationId: "listWorkflows",
      ...authed,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        "200": {
          description: "Paginated workflow list",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowsListResponse" } } },
        },
        ...stdErrors,
      },
    },
    post: {
      tags: ["Workflows"],
      summary: "Create workflow",
      operationId: "createWorkflow",
      ...authed,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowCreateRequest" } } },
      },
      responses: {
        "201": {
          description: "Workflow created",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowDocument" } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/workflows/estimate-credits": {
    post: {
      tags: ["Workflows"],
      summary: "Estimate workflow credits",
      operationId: "estimateWorkflowCredits",
      ...authed,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/WorkflowEstimateCreditsRequest" } },
        },
      },
      responses: {
        "200": {
          description: "Credit estimate",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WorkflowEstimateCreditsResponse" } },
          },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/workflows/validate-limits": {
    post: {
      tags: ["Workflows"],
      summary: "Validate provider input limits",
      operationId: "validateWorkflowLimits",
      ...authed,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/ValidateLimitsRequest" } } },
      },
      responses: {
        "200": {
          description: "Validation issues (empty when valid)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ValidateLimitsResponse" } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/workflows/{workflowId}": {
    get: {
      tags: ["Workflows"],
      summary: "Get workflow",
      operationId: "getWorkflow",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      responses: {
        "200": {
          description: "Workflow document",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowDocument" } } },
        },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
    put: {
      tags: ["Workflows"],
      summary: "Save workflow graph",
      description: "Replace nodes, edges, and viewport. Supports optimistic concurrency via `expectedVersion`.",
      operationId: "saveWorkflow",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowSaveRequest" } } },
      },
      responses: {
        "200": {
          description: "Workflow saved",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowDocument" } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        "409": { description: "Version conflict" },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
    patch: {
      tags: ["Workflows"],
      summary: "Update workflow metadata",
      operationId: "updateWorkflow",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowUpdateRequest" } } },
      },
      responses: {
        "200": {
          description: "Workflow updated",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowDocument" } } },
        },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
    delete: {
      tags: ["Workflows"],
      summary: "Delete workflow",
      operationId: "deleteWorkflow",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      responses: {
        "204": { description: "Workflow deleted" },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/workflows/{workflowId}/runs": {
    get: {
      tags: ["Runs"],
      summary: "List workflow runs",
      operationId: "listWorkflowRuns",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      responses: {
        "200": {
          description: "Recent runs",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowRunsListResponse" } } },
        },
        ...stdErrors,
      },
    },
    post: {
      tags: ["Runs"],
      summary: "Start workflow run",
      description:
        "Enqueue a workflow run. Poll `GET /api/v1/runs/{runId}` until status is terminal. " +
        "Optionally pass `idempotencyKey` to safely retry.",
      operationId: "createWorkflowRun",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WorkflowId" }],
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowRunCreateRequest" } } },
      },
      responses: {
        "201": {
          description: "Run enqueued",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowRunResponse" } } },
        },
        "402": { $ref: "#/components/responses/InsufficientCredits" },
        "400": { $ref: "#/components/responses/BadRequest" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/runs/{runId}": {
    get: {
      tags: ["Runs"],
      summary: "Get run status",
      description: "Returns run metadata and all node runs with outputs.",
      operationId: "getRun",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/RunId" }],
      responses: {
        "200": {
          description: "Run with node runs",
          content: { "application/json": { schema: { $ref: "#/components/schemas/RunFetchWithNodesResponse" } } },
        },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/runs/{runId}/cancel": {
    post: {
      tags: ["Runs"],
      summary: "Cancel workflow run",
      description: "Cancel a queued or running workflow run.",
      operationId: "cancelWorkflowRun",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/RunId" }],
      responses: {
        "200": {
          description: "Run cancelled",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowRunResponse" } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/system-workflows": {
    get: {
      tags: ["Workflows"],
      summary: "List system workflows",
      operationId: "listSystemWorkflows",
      ...authed,
      responses: {
        "200": {
          description: "System workflow templates",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SystemWorkflowsListResponse" } },
          },
        },
        ...stdErrors,
      },
    },
  },
  "/api/v1/system-workflows/{slug}": {
    get: {
      tags: ["Workflows"],
      summary: "Get system workflow",
      operationId: "getSystemWorkflow",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/SystemWorkflowSlug" }],
      responses: {
        "200": {
          description: "System workflow document",
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkflowDocument" } } },
        },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/nodes": {
    get: {
      tags: ["Nodes"],
      summary: "List node catalog",
      description: "Public node definitions for building workflows.",
      operationId: "listNodes",
      ...publicOp,
      responses: {
        "200": {
          description: "Node catalog",
          content: { "application/json": { schema: { $ref: "#/components/schemas/NodesListResponse" } } },
        },
      },
    },
  },
  "/api/v1/nodes/estimate-credits": {
    post: {
      tags: ["Nodes"],
      summary: "Estimate node credits",
      operationId: "estimateNodeCredits",
      ...authed,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/NodesEstimateCreditsRequest" } },
        },
      },
      responses: {
        "200": {
          description: "Per-node estimates",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NodesEstimateCreditsResponse" } },
          },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/api-keys": {
    get: {
      tags: ["API Keys"],
      summary: "List API keys",
      description: "Returns masked keys (prefix only). Full secrets are shown once at creation.",
      operationId: "listApiKeys",
      ...authed,
      responses: {
        "200": {
          description: "API keys",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiKeysListResponse" } } },
        },
        ...stdErrors,
      },
    },
    post: {
      tags: ["API Keys"],
      summary: "Create API key",
      operationId: "createApiKey",
      ...authed,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/ApiKeyCreateRequest" } } },
      },
      responses: {
        "201": {
          description: "API key created — store the secret immediately",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiKeyCreateResponse" } } },
        },
        "503": { description: "Unkey not configured" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/api-keys/{apiKeyId}": {
    delete: {
      tags: ["API Keys"],
      summary: "Revoke API key",
      operationId: "revokeApiKey",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/ApiKeyId" }],
      responses: {
        "204": { description: "Key revoked" },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/webhooks": {
    get: {
      tags: ["Webhooks"],
      summary: "List webhook endpoints",
      operationId: "listWebhooks",
      ...authed,
      responses: {
        "200": {
          description: "Registered webhook endpoints",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpointsListResponse" } },
          },
        },
        ...stdErrors,
      },
    },
    post: {
      tags: ["Webhooks"],
      summary: "Register webhook endpoint",
      operationId: "createWebhook",
      ...authed,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpointCreateRequest" } },
        },
      },
      responses: {
        "201": {
          description: "Webhook registered — store the signing secret immediately",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpointCreateResponse" } },
          },
        },
        ...stdErrors,
      },
    },
  },
  "/api/v1/webhooks/{webhookId}": {
    patch: {
      tags: ["Webhooks"],
      summary: "Update webhook endpoint",
      operationId: "updateWebhook",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WebhookId" }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpointUpdateRequest" } },
        },
      },
      responses: {
        "200": {
          description: "Webhook updated",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpointUpdateResponse" } },
          },
        },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
    delete: {
      tags: ["Webhooks"],
      summary: "Delete webhook endpoint",
      operationId: "deleteWebhook",
      ...authed,
      parameters: [{ $ref: "#/components/parameters/WebhookId" }],
      responses: {
        "204": { description: "Webhook deleted" },
        "404": { $ref: "#/components/responses/NotFound" },
        ...stdErrors,
      },
    },
  },
  "/api/v1/credits/balance": {
    get: {
      tags: ["Credits"],
      summary: "Get credit balance",
      operationId: "getCreditBalance",
      ...authed,
      responses: {
        "200": {
          description: "Current balance",
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreditBalanceResponse" } } },
        },
        ...stdErrors,
      },
    },
  },
  "/api/v1/credits/transactions": {
    get: {
      tags: ["Credits"],
      summary: "List credit transactions",
      operationId: "listCreditTransactions",
      ...authed,
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        { name: "cursor", in: "query", schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Ledger transactions",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreditTransactionsListResponse" } },
          },
        },
        ...stdErrors,
      },
    },
  },
  "/api/v1/uploads/config": {
    get: {
      tags: ["Uploads"],
      summary: "Get upload configuration",
      description: "Public upload limits and whether uploads are enabled.",
      operationId: "getUploadsConfig",
      ...publicOp,
      responses: {
        "200": {
          description: "Upload config",
          content: { "application/json": { schema: { $ref: "#/components/schemas/UploadsConfigResponse" } } },
        },
      },
    },
  },
  "/api/v1/uploads": {
    post: {
      tags: ["Uploads"],
      summary: "Upload a file",
      description: "Multipart upload. Field name must be `file`.",
      operationId: "uploadFile",
      ...authed,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary" } },
            },
          },
        },
      },
      responses: {
        "201": {
          description: "File uploaded",
          content: { "application/json": { schema: { $ref: "#/components/schemas/UploadResponse" } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        "503": { description: "Uploads not configured" },
        ...stdErrors,
      },
    },
  },
} as const;
