import { z } from "zod";
import { cuid, isoDateString } from "./primitives";
import {
  WorkflowEdgeSchema,
  WorkflowGraphSchema,
  WorkflowNodeSchema,
  WorkflowTypeSchema,
  WorkflowViewportSchema,
} from "./graph";
import { createScaffoldGraph } from "./workflowScaffold";

export {
  WorkflowGraphSchema,
  WorkflowNodeSchema,
  WorkflowEdgeSchema,
  WorkflowTypeSchema,
  WorkflowViewportSchema,
  parseWorkflowGraph,
  emptyWorkflowGraph,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowEdge,
} from "./graph";

/** Galaxy app API — flat workflow document returned by GET /workflows/:id */
export const WorkflowDocumentSchema = z.object({
  id: cuid,
  name: z.string().min(1),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  type: WorkflowTypeSchema,
  slug: z.string().min(1).nullable().optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  viewport: WorkflowViewportSchema.optional(),
  version: z.number().int().positive().optional(),
  updatedAt: isoDateString,
});

export const WorkflowListItemSchema = z.object({
  id: cuid,
  name: z.string().min(1),
  thumbnailUrl: z.string().nullable(),
  updatedAt: isoDateString,
});

export const SystemWorkflowListItemSchema = z.object({
  id: cuid,
  name: z.string().min(1),
  description: z.string().nullable(),
  slug: z.string().min(1),
  thumbnailUrl: z.string().nullable(),
  updatedAt: isoDateString,
});

export const SystemWorkflowsListResponseSchema = z.object({
  items: z.array(SystemWorkflowListItemSchema),
});

export const WorkflowsListResponseSchema = z.object({
  items: z.array(WorkflowListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const WorkflowsCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  graph: WorkflowGraphSchema.optional(),
  thumbnailUrl: z.string().nullable().optional(),
});

export const WorkflowsCreateResponseSchema = WorkflowDocumentSchema;

export const WorkflowFetchResponseSchema = WorkflowDocumentSchema;

export const WorkflowSaveRequestSchema = z
  .object({
    nodes: z.array(WorkflowNodeSchema).optional(),
    edges: z.array(WorkflowEdgeSchema).optional(),
    viewport: z
      .object({ x: z.number(), y: z.number(), zoom: z.number() })
      .optional(),
    graph: WorkflowGraphSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      (value.nodes !== undefined && value.edges !== undefined) ||
      value.graph !== undefined,
    { message: "Provide nodes+edges or graph" },
  );

export const WorkflowSaveResponseSchema = WorkflowDocumentSchema;

export const WorkflowUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    thumbnailUrl: z.string().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.thumbnailUrl !== undefined,
    { message: "At least one field is required" },
  );

export const WorkflowUpdateResponseSchema = WorkflowDocumentSchema;

/** @deprecated Use WorkflowDocumentSchema */
export const WorkflowSchema = WorkflowDocumentSchema;

/** @deprecated Use WorkflowSaveRequestSchema */
export const WorkflowSaveGraphRequestSchema = WorkflowSaveRequestSchema;

/** @deprecated Use WorkflowSaveResponseSchema */
export const WorkflowSaveGraphResponseSchema = WorkflowSaveResponseSchema;

export type WorkflowDocument = z.infer<typeof WorkflowDocumentSchema>;
export type Workflow = WorkflowDocument;
export type WorkflowListItem = z.infer<typeof WorkflowListItemSchema>;
export type SystemWorkflowListItem = z.infer<typeof SystemWorkflowListItemSchema>;
export type SystemWorkflowsListResponse = z.infer<typeof SystemWorkflowsListResponseSchema>;
export type WorkflowsListResponse = z.infer<typeof WorkflowsListResponseSchema>;

export function parseWorkflowsListResponse(data: unknown): WorkflowsListResponse {
  return WorkflowsListResponseSchema.parse(data);
}

export function parseSystemWorkflowsListResponse(data: unknown): SystemWorkflowsListResponse {
  return SystemWorkflowsListResponseSchema.parse(data);
}

export function parseWorkflowDocument(data: unknown): WorkflowDocument {
  return WorkflowDocumentSchema.parse(data);
}

export function savePayloadToGraph(
  payload: z.infer<typeof WorkflowSaveRequestSchema>,
): z.infer<typeof WorkflowGraphSchema> {
  if (payload.graph) {
    return payload.graph;
  }
  return {
    nodes: payload.nodes ?? [],
    edges: payload.edges ?? [],
    ...(payload.viewport ? { viewport: payload.viewport } : {}),
  };
}

export function createPayloadToGraph(
  payload: z.infer<typeof WorkflowsCreateRequestSchema>,
): z.infer<typeof WorkflowGraphSchema> {
  if (payload.graph) {
    return payload.graph;
  }
  const nodes = payload.nodes ?? [];
  const edges = payload.edges ?? [];
  if (nodes.length === 0 && edges.length === 0) {
    return createScaffoldGraph();
  }
  return { nodes, edges };
}
