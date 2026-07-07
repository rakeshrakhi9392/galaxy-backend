/** Shared OpenAPI components (schemas, responses, parameters). */

const workflowGraphSchema = {
  type: "object",
  required: ["nodes", "edges"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "position"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          position: {
            type: "object",
            required: ["x", "y"],
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
          data: { type: "object", additionalProperties: true },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "source", "target"],
        properties: {
          id: { type: "string" },
          source: { type: "string" },
          target: { type: "string" },
          sourceHandle: { type: "string", nullable: true },
          targetHandle: { type: "string", nullable: true },
        },
      },
    },
    viewport: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" }, zoom: { type: "number" } },
    },
  },
} as const;

export const openApiComponents = {
  securitySchemes: {
    BearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "API Key",
      description: "Galaxy API key prefixed with `gal_`. Example: `Authorization: Bearer gal_live_…`",
    },
  },
  parameters: {
    WorkflowId: {
      name: "workflowId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    RunId: {
      name: "runId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    SystemWorkflowSlug: {
      name: "slug",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    ApiKeyId: {
      name: "apiKeyId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    WebhookId: {
      name: "webhookId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  },
  responses: {
    BadRequest: {
      description: "Invalid request",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorBody" } } },
    },
    Unauthorized: {
      description: "Missing or invalid API key",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorBody" } } },
    },
    NotFound: {
      description: "Resource not found",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorBody" } } },
    },
    RateLimited: {
      description: "Rate limit exceeded",
      headers: {
        "Retry-After": { schema: { type: "integer" }, description: "Seconds until the limit resets" },
      },
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorBody" } } },
    },
    InsufficientCredits: {
      description: "Not enough credits to start the run",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorBody" } } },
    },
  },
  schemas: {
    ApiErrorBody: {
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              enum: [
                "BAD_REQUEST",
                "NOT_FOUND",
                "UNAUTHORIZED",
                "FORBIDDEN",
                "RATE_LIMITED",
                "INSUFFICIENT_CREDITS",
                "VERSION_CONFLICT",
                "INVALID_GRAPH",
                "INTERNAL_ERROR",
              ],
            },
            message: { type: "string" },
            cause: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
            retryability: { type: "string", enum: ["none", "retry_after", "backoff"] },
          },
        },
      },
    },
    WorkflowDocument: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        thumbnailUrl: { type: "string", nullable: true },
        type: { type: "string", enum: ["USER", "SYSTEM"] },
        slug: { type: "string", nullable: true },
        nodes: workflowGraphSchema.properties.nodes,
        edges: workflowGraphSchema.properties.edges,
        viewport: workflowGraphSchema.properties.viewport,
        version: { type: "integer" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    WorkflowListItem: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        thumbnailUrl: { type: "string", nullable: true },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    SystemWorkflowListItem: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        slug: { type: "string" },
        thumbnailUrl: { type: "string", nullable: true },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    WorkflowsListResponse: {
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/WorkflowListItem" } },
        page: { type: "integer" },
        pageSize: { type: "integer" },
        total: { type: "integer" },
        hasMore: { type: "boolean" },
      },
    },
    SystemWorkflowsListResponse: {
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/SystemWorkflowListItem" } },
      },
    },
    WorkflowCreateRequest: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 500, nullable: true },
        nodes: workflowGraphSchema.properties.nodes,
        edges: workflowGraphSchema.properties.edges,
        graph: workflowGraphSchema,
        thumbnailUrl: { type: "string", nullable: true },
      },
    },
    WorkflowSaveRequest: {
      type: "object",
      properties: {
        nodes: workflowGraphSchema.properties.nodes,
        edges: workflowGraphSchema.properties.edges,
        viewport: workflowGraphSchema.properties.viewport,
        graph: workflowGraphSchema,
        expectedVersion: { type: "integer", minimum: 1 },
      },
    },
    WorkflowUpdateRequest: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 500, nullable: true },
        thumbnailUrl: { type: "string", nullable: true },
      },
    },
    WorkflowRun: {
      type: "object",
      properties: {
        id: { type: "string" },
        workflowId: { type: "string" },
        scope: { type: "string", enum: ["FULL", "SINGLE", "SELECTION"] },
        status: { type: "string", enum: ["QUEUED", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "SKIPPED"] },
        initiator: { type: "string", enum: ["UI", "API", "MCP"] },
        targetNodeIds: { type: "array", items: { type: "string" } },
        estimatedCredits: { type: "integer", nullable: true },
        actualCredits: { type: "integer", nullable: true },
        startedAt: { type: "string", format: "date-time", nullable: true },
        finishedAt: { type: "string", format: "date-time", nullable: true },
        errorSummary: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    WorkflowRunCreateRequest: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["FULL", "SINGLE", "SELECTION"], default: "FULL" },
        targetNodeIds: { type: "array", items: { type: "string" }, default: [] },
        idempotencyKey: { type: "string", maxLength: 128 },
        graph: workflowGraphSchema,
      },
    },
    WorkflowRunResponse: {
      type: "object",
      properties: { run: { $ref: "#/components/schemas/WorkflowRun" } },
    },
    WorkflowRunsListResponse: {
      type: "object",
      properties: { runs: { type: "array", items: { $ref: "#/components/schemas/WorkflowRun" } } },
    },
    NodeRun: {
      type: "object",
      properties: {
        id: { type: "string" },
        workflowRunId: { type: "string" },
        nodeId: { type: "string" },
        nodeType: { type: "string" },
        status: { type: "string" },
        resolvedInput: { nullable: true },
        resolvedOutput: { nullable: true },
        output: { nullable: true },
        provider: { type: "string", nullable: true },
        startedAt: { type: "string", format: "date-time", nullable: true },
        finishedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    RunFetchWithNodesResponse: {
      type: "object",
      properties: {
        run: { $ref: "#/components/schemas/WorkflowRun" },
        nodeRuns: { type: "array", items: { $ref: "#/components/schemas/NodeRun" } },
      },
    },
    NodeCatalogEntry: {
      type: "object",
      properties: {
        type: { type: "string" },
        ui: { type: "object", additionalProperties: true },
      },
    },
    NodesListResponse: {
      type: "object",
      properties: {
        nodes: { type: "array", items: { $ref: "#/components/schemas/NodeCatalogEntry" } },
      },
    },
    EstimateCreditsNode: {
      type: "object",
      required: ["type"],
      properties: {
        type: { type: "string" },
        data: { type: "object", additionalProperties: true },
        subModelId: { type: "string" },
      },
    },
    NodesEstimateCreditsRequest: {
      type: "object",
      required: ["nodes"],
      properties: {
        nodes: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { $ref: "#/components/schemas/EstimateCreditsNode" },
        },
      },
    },
    WorkflowEstimateCreditsRequest: {
      type: "object",
      properties: {
        nodes: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/EstimateCreditsNode" } },
        graph: workflowGraphSchema,
        targetNodeIds: { type: "array", items: { type: "string" }, default: [] },
      },
    },
    MicrocreditEstimate: {
      type: "object",
      properties: { microcredits: { type: "integer", minimum: 0 } },
    },
    NodesEstimateCreditsResponse: {
      type: "object",
      properties: {
        estimates: { type: "array", items: { $ref: "#/components/schemas/MicrocreditEstimate" } },
      },
    },
    WorkflowEstimateCreditsResponse: {
      type: "object",
      properties: {
        totalMicrocredits: { type: "integer", minimum: 0 },
        estimates: { type: "array", items: { $ref: "#/components/schemas/MicrocreditEstimate" } },
      },
    },
    ValidateLimitsNode: {
      type: "object",
      required: ["nodeId", "nodeType", "inputs"],
      properties: {
        nodeId: { type: "string" },
        nodeType: { type: "string" },
        label: { type: "string" },
        inputs: { type: "object", additionalProperties: true },
      },
    },
    ValidateLimitsRequest: {
      type: "object",
      required: ["nodes"],
      properties: {
        nodes: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/ValidateLimitsNode" } },
      },
    },
    ValidateLimitsIssue: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        nodeType: { type: "string" },
        label: { type: "string" },
        message: { type: "string" },
      },
    },
    ValidateLimitsResponse: {
      type: "object",
      properties: {
        issues: { type: "array", items: { $ref: "#/components/schemas/ValidateLimitsIssue" } },
      },
    },
    ApiKey: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        keyPrefix: { type: "string", description: "First 12 characters of the key" },
        lastUsedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        revokedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    ApiKeyCreateRequest: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
    },
    ApiKeyCreateResponse: {
      type: "object",
      properties: {
        apiKey: { $ref: "#/components/schemas/ApiKey" },
        secret: { type: "string", description: "Full API key — shown once" },
      },
    },
    ApiKeysListResponse: {
      type: "object",
      properties: { apiKeys: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } } },
    },
    WebhookEndpoint: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string", format: "uri" },
        events: {
          type: "array",
          items: { type: "string", enum: ["RUN_STARTED", "RUN_COMPLETED", "RUN_FAILED", "NODE_COMPLETED"] },
        },
        enabled: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    WebhookEndpointCreateRequest: {
      type: "object",
      required: ["url", "events"],
      properties: {
        url: { type: "string", format: "uri" },
        events: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: ["RUN_STARTED", "RUN_COMPLETED", "RUN_FAILED", "NODE_COMPLETED"] },
        },
        enabled: { type: "boolean", default: true },
      },
    },
    WebhookEndpointCreateResponse: {
      type: "object",
      properties: {
        webhook: { $ref: "#/components/schemas/WebhookEndpoint" },
        secret: { type: "string", description: "Signing secret — shown once" },
      },
    },
    WebhookEndpointUpdateRequest: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        events: {
          type: "array",
          items: { type: "string", enum: ["RUN_STARTED", "RUN_COMPLETED", "RUN_FAILED", "NODE_COMPLETED"] },
        },
        enabled: { type: "boolean" },
      },
    },
    WebhookEndpointUpdateResponse: {
      type: "object",
      properties: { webhook: { $ref: "#/components/schemas/WebhookEndpoint" } },
    },
    WebhookEndpointsListResponse: {
      type: "object",
      properties: { webhooks: { type: "array", items: { $ref: "#/components/schemas/WebhookEndpoint" } } },
    },
    WebhookPayload: {
      type: "object",
      description: "Outbound webhook event body",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["RUN_STARTED", "RUN_COMPLETED", "RUN_FAILED", "NODE_COMPLETED"] },
        createdAt: { type: "string", format: "date-time" },
        data: { type: "object" },
      },
    },
    CreditBalanceResponse: {
      type: "object",
      properties: {
        availableBalance: { type: "integer", minimum: 0 },
        formatted: { type: "string" },
        hasActiveSubscription: { type: "boolean" },
        isOrganization: { type: "boolean" },
      },
    },
    CreditTransaction: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["GRANT", "RUN_CHARGE", "RUN_REFUND", "ADJUSTMENT"] },
        amount: { type: "integer", minimum: 0 },
        balanceAfter: { type: "integer", minimum: 0 },
        referenceType: { type: "string", nullable: true },
        referenceId: { type: "string", nullable: true },
        workflowRunId: { type: "string", nullable: true },
        metadata: { nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CreditTransactionsListResponse: {
      type: "object",
      properties: {
        transactions: { type: "array", items: { $ref: "#/components/schemas/CreditTransaction" } },
        nextCursor: { type: "string", nullable: true },
      },
    },
    AccountResponse: {
      type: "object",
      properties: { creditBalance: { type: "integer", minimum: 0 } },
    },
    UploadsConfigResponse: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        maxAudioBytes: { type: "integer", nullable: true },
        maxVideoBytes: { type: "integer", nullable: true },
        maxImageBytes: { type: "integer", nullable: true },
        maxPdfBytes: { type: "integer", nullable: true },
        minAudioBytes: { type: "integer", nullable: true },
        minVideoBytes: { type: "integer", nullable: true },
      },
    },
    UploadResponse: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        mimeType: { type: "string", nullable: true },
        size: { type: "integer" },
        filename: { type: "string" },
      },
    },
  },
} as const;
