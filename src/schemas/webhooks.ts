import { z } from "zod";
import { cuid, isoDateString } from "./primitives";

export const WebhookEventTypeSchema = z.enum([
  "RUN_STARTED",
  "RUN_COMPLETED",
  "RUN_FAILED",
  "NODE_COMPLETED",
]);

export const WebhookEndpointSchema = z.object({
  id: cuid,
  url: z.string().url(),
  events: z.array(WebhookEventTypeSchema).min(1),
  enabled: z.boolean(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const WebhookEndpointsListResponseSchema = z.object({
  webhooks: z.array(WebhookEndpointSchema),
});

export const WebhookEndpointCreateRequestSchema = z.object({
  url: z.string().url(),
  events: z.array(WebhookEventTypeSchema).min(1),
  enabled: z.boolean().default(true),
});

export const WebhookEndpointCreateResponseSchema = z.object({
  webhook: WebhookEndpointSchema,
  /** Signing secret — shown once at creation only. */
  secret: z.string().min(1),
});

export const WebhookEndpointUpdateRequestSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(WebhookEventTypeSchema).min(1).optional(),
  enabled: z.boolean().optional(),
});

export const WebhookEndpointUpdateResponseSchema = z.object({
  webhook: WebhookEndpointSchema,
});

export const WebhookRunSummarySchema = z.object({
  id: cuid,
  workflowId: cuid,
  status: z.string(),
  scope: z.string(),
  initiator: z.string(),
  targetNodeIds: z.array(z.string()),
  estimatedCredits: z.number().int().nullable(),
  actualCredits: z.number().int().nullable(),
  startedAt: isoDateString.nullable(),
  finishedAt: isoDateString.nullable(),
  errorSummary: z.string().nullable(),
  createdAt: isoDateString,
});

export const WebhookNodeRunSummarySchema = z.object({
  id: cuid,
  nodeId: z.string(),
  nodeType: z.string(),
  status: z.string(),
  startedAt: isoDateString.nullable(),
  finishedAt: isoDateString.nullable(),
  provider: z.string().nullable().optional(),
});

export const WebhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("RUN_STARTED"),
    createdAt: isoDateString,
    data: z.object({ run: WebhookRunSummarySchema }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("RUN_COMPLETED"),
    createdAt: isoDateString,
    data: z.object({ run: WebhookRunSummarySchema }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("RUN_FAILED"),
    createdAt: isoDateString,
    data: z.object({
      run: WebhookRunSummarySchema,
      errorSummary: z.string().nullable(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("NODE_COMPLETED"),
    createdAt: isoDateString,
    data: z.object({
      runId: cuid,
      nodeRun: WebhookNodeRunSummarySchema,
    }),
  }),
]);

export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
