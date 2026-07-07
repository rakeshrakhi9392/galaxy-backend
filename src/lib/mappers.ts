import type { Prisma, RunStatus, WorkflowRunScope, WorkflowType } from "@prisma/client";
import { graphFromUnknown } from "@/lib/graphNormalize";
import type { WorkflowDocument, WorkflowGraph } from "@galaxy/schemas";

type DbWorkflow = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  type: WorkflowType;
  graph: Prisma.JsonValue;
  version: number;
  thumbnailUrl: string | null;
  slug: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbWorkflowListItem = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  updatedAt: Date;
};

type DbWorkflowRun = {
  id: string;
  workflowId: string;
  scope: WorkflowRunScope;
  status: RunStatus;
  initiator: "UI" | "API" | "MCP";
  targetNodeIds: string[];
  triggerRunId: string | null;
  estimatedCredits: number | null;
  actualCredits: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbProviderAttempt = {
  id: string;
  nodeRunId: string;
  provider: string;
  status: "SUCCESS" | "FAILED" | "TIMEOUT" | "SKIPPED";
  durationMs: number | null;
  error: string | null;
  errorCode: string | null;
  createdAt: Date;
};

type DbNodeRun = {
  id: string;
  workflowRunId: string;
  nodeId: string;
  nodeType: string;
  attempt: number;
  status: RunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  resolvedInput: Prisma.JsonValue | null;
  resolvedOutput: Prisma.JsonValue | null;
  provider: string | null;
  error: Prisma.JsonValue | null;
  logPreview: string | null;
  estimatedCredits: number | null;
  actualCredits: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export function storedGraphToWorkflowGraph(graph: Prisma.JsonValue): WorkflowGraph {
  return graphFromUnknown(graph);
}

export function toWorkflowDocument(w: DbWorkflow): WorkflowDocument {
  const graph = storedGraphToWorkflowGraph(w.graph);
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? null,
    thumbnailUrl: w.thumbnailUrl ?? null,
    type: w.type,
    ...(w.slug ? { slug: w.slug } : {}),
    nodes: graph.nodes,
    edges: graph.edges,
    ...(graph.viewport ? { viewport: graph.viewport } : {}),
    version: w.version,
    updatedAt: w.updatedAt.toISOString(),
  };
}

/** @deprecated Use toWorkflowDocument */
export function toWorkflowApi(w: DbWorkflow) {
  return toWorkflowDocument(w);
}

export function toWorkflowListItemApi(w: DbWorkflowListItem) {
  return {
    id: w.id,
    name: w.name,
    thumbnailUrl: w.thumbnailUrl ?? null,
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function toSystemWorkflowListItemApi(w: {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  thumbnailUrl: string | null;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? null,
    slug: w.slug,
    thumbnailUrl: w.thumbnailUrl ?? null,
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function toWorkflowRunApi(r: DbWorkflowRun) {
  return {
    id: r.id,
    workflowId: r.workflowId,
    scope: r.scope,
    status: r.status,
    initiator: r.initiator,
    targetNodeIds: r.targetNodeIds,
    triggerRunId: r.triggerRunId ?? null,
    estimatedCredits: r.estimatedCredits,
    actualCredits: r.actualCredits,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    errorSummary: r.errorSummary ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toProviderAttemptApi(a: DbProviderAttempt) {
  return {
    id: a.id,
    nodeRunId: a.nodeRunId,
    provider: a.provider,
    status: a.status,
    durationMs: a.durationMs,
    error: a.error ?? null,
    errorCode: a.errorCode ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toNodeRunApi(
  r: DbNodeRun,
  providerAttempts?: DbProviderAttempt[],
) {
  return {
    id: r.id,
    workflowRunId: r.workflowRunId,
    nodeId: r.nodeId,
    nodeType: r.nodeType,
    attempt: r.attempt,
    status: r.status,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    resolvedInput: (r.resolvedInput ?? null) as unknown,
    resolvedOutput: (r.resolvedOutput ?? null) as unknown,
    input: (r.resolvedInput ?? null) as unknown,
    output: (r.resolvedOutput ?? null) as unknown,
    provider: r.provider ?? null,
    error: (r.error ?? null) as unknown,
    logPreview: r.logPreview ?? null,
    estimatedCredits: r.estimatedCredits,
    actualCredits: r.actualCredits,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ...(providerAttempts
      ? { providerAttempts: providerAttempts.map(toProviderAttemptApi) }
      : {}),
  };
}
