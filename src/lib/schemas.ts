import { z } from "zod";
import { cuid, isoDateString, WorkflowGraphSchema } from "@galaxy/schemas";

export {
  cuid,
  isoDateString,
  WorkflowGraphSchema,
  WorkflowNodeSchema,
  WorkflowEdgeSchema,
  WorkflowTypeSchema,
  WorkflowDocumentSchema,
  WorkflowSchema,
  WorkflowListItemSchema,
  SystemWorkflowListItemSchema,
  SystemWorkflowsListResponseSchema,
  WorkflowsListResponseSchema,
  WorkflowsListQuerySchema,
  pageToSkip,
  WorkflowsCreateRequestSchema,
  WorkflowsCreateResponseSchema,
  WorkflowFetchResponseSchema,
  WorkflowSaveRequestSchema,
  WorkflowSaveGraphRequestSchema,
  WorkflowSaveResponseSchema,
  WorkflowSaveGraphResponseSchema,
  WorkflowUpdateRequestSchema,
  WorkflowUpdateResponseSchema,
  savePayloadToGraph,
  createPayloadToGraph,
  parseWorkflowDocument,
  ApiKeySchema,
  ApiKeysListResponseSchema,
  ApiKeyCreateRequestSchema,
  ApiKeyCreateResponseSchema,
  ApiErrorCodeSchema,
  ApiRetryabilitySchema,
  ApiErrorBodySchema,
  WebhookEventTypeSchema,
  WebhookEndpointSchema,
  WebhookEndpointsListResponseSchema,
  WebhookEndpointCreateRequestSchema,
  WebhookEndpointCreateResponseSchema,
  WebhookEndpointUpdateRequestSchema,
  WebhookEndpointUpdateResponseSchema,
  WebhookPayloadSchema,
  parseWorkflowsListResponse,
  parseSystemWorkflowsListResponse,
  type WorkflowDocument,
  type Workflow,
  type WorkflowListItem,
  type SystemWorkflowListItem,
  type SystemWorkflowsListResponse,
  type WorkflowsListResponse,
  type WorkflowsListQuery,
  type ApiKey,
  type WebhookEndpoint,
  type WebhookPayload,
  type ApiErrorCode,
  type ApiRetryability,
  type ApiErrorBody,
} from "@galaxy/schemas";

// ---- runs ----
export const WorkflowRunScopeSchema = z.enum(["FULL", "SINGLE", "SELECTION"]);
export const RunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);

export const RunInitiatorSchema = z.enum(["UI", "API", "MCP"]);

export const ProviderAttemptStatusSchema = z.enum([
  "SUCCESS",
  "FAILED",
  "TIMEOUT",
  "SKIPPED",
]);

export const WorkflowRunSchema = z.object({
  id: cuid,
  workflowId: cuid,
  scope: WorkflowRunScopeSchema,
  status: RunStatusSchema,
  initiator: RunInitiatorSchema,
  targetNodeIds: z.array(z.string()),
  triggerRunId: z.string().nullable().optional(),
  estimatedCredits: z.number().int().nullable(),
  actualCredits: z.number().int().nullable(),
  startedAt: isoDateString.nullable(),
  finishedAt: isoDateString.nullable(),
  errorSummary: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const WorkflowRunCreateRequestSchema = z.object({
  scope: WorkflowRunScopeSchema.default("FULL"),
  targetNodeIds: z.array(z.string()).default([]),
  idempotencyKey: z.string().min(1).max(128).optional(),
  graph: WorkflowGraphSchema.optional(),
});

export const WorkflowRunCreateResponseSchema = z.object({
  run: WorkflowRunSchema,
});

export const RunFetchResponseSchema = z.object({
  run: WorkflowRunSchema,
});

export const ProviderAttemptSchema = z.object({
  id: cuid,
  nodeRunId: cuid,
  provider: z.string().min(1),
  status: ProviderAttemptStatusSchema,
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
  errorCode: z.string().nullable(),
  createdAt: isoDateString,
});

export const NodeRunSchema = z.object({
  id: cuid,
  workflowRunId: cuid,
  nodeId: z.string().min(1),
  nodeType: z.string().min(1),
  attempt: z.number().int().positive(),
  status: RunStatusSchema,
  startedAt: isoDateString.nullable(),
  finishedAt: isoDateString.nullable(),
  resolvedInput: z.unknown().nullable(),
  resolvedOutput: z.unknown().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  provider: z.string().nullable(),
  error: z.unknown().nullable(),
  logPreview: z.string().nullable().optional(),
  estimatedCredits: z.number().int().nullable(),
  actualCredits: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  providerAttempts: z.array(ProviderAttemptSchema).optional(),
});

export const RunFetchWithNodesResponseSchema = z.object({
  run: WorkflowRunSchema,
  nodeRuns: z.array(NodeRunSchema),
});

export const WorkflowRunsListResponseSchema = z.object({
  runs: z.array(WorkflowRunSchema),
});
