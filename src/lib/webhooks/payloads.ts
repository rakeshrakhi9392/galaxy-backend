import type { WebhookEvent, WorkflowRun } from "@prisma/client";
import type { WebhookPayload } from "@/schemas/webhooks";
import { randomUUID } from "node:crypto";

function toRunSummary(run: WorkflowRun) {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    scope: run.scope,
    initiator: run.initiator,
    targetNodeIds: run.targetNodeIds,
    estimatedCredits: run.estimatedCredits,
    actualCredits: run.actualCredits,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errorSummary: run.errorSummary,
    createdAt: run.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function buildRunStartedPayload(run: WorkflowRun): WebhookPayload {
  return {
    id: randomUUID(),
    type: "RUN_STARTED",
    createdAt: new Date().toISOString(),
    data: { run: toRunSummary(run) },
  };
}

export function buildRunCompletedPayload(run: WorkflowRun): WebhookPayload {
  return {
    id: randomUUID(),
    type: "RUN_COMPLETED",
    createdAt: new Date().toISOString(),
    data: { run: toRunSummary(run) },
  };
}

export function buildRunFailedPayload(run: WorkflowRun, errorSummary: string | null): WebhookPayload {
  return {
    id: randomUUID(),
    type: "RUN_FAILED",
    createdAt: new Date().toISOString(),
    data: {
      run: toRunSummary(run),
      errorSummary,
    },
  };
}

export function buildNodeCompletedPayload(args: {
  runId: string;
  nodeRun: {
    id: string;
    nodeId: string;
    nodeType: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    provider: string | null;
  };
}): WebhookPayload {
  return {
    id: randomUUID(),
    type: "NODE_COMPLETED",
    createdAt: new Date().toISOString(),
    data: {
      runId: args.runId,
      nodeRun: {
        id: args.nodeRun.id,
        nodeId: args.nodeRun.nodeId,
        nodeType: args.nodeRun.nodeType,
        status: args.nodeRun.status,
        startedAt: args.nodeRun.startedAt?.toISOString() ?? null,
        finishedAt: args.nodeRun.finishedAt?.toISOString() ?? null,
        provider: args.nodeRun.provider,
      },
    },
  };
}

export function eventMatchesPayload(event: WebhookEvent, payload: WebhookPayload): boolean {
  return event === payload.type;
}
