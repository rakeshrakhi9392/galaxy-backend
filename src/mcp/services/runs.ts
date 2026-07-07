import type { RunStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNodeRunApi, toWorkflowRunApi } from "@/lib/mappers";
import { graphFromUnknown } from "@/lib/graphNormalize";
import { enqueueWorkflowRun } from "@/lib/orchestrator";
import { validateRunClosureInputs } from "@/lib/validateRunClosure";
import { deriveRunScope, parseWorkflowGraphForExecution } from "@/trigger/graph";
import { estimateExecutionSubgraphCredits } from "@/lib/estimateNodeCredits";
import { assertSufficientCredits, InsufficientCreditsError } from "@/lib/creditsLedger";
import { findReadableWorkflow } from "@/lib/workflowAccess";
import { cancelWorkflowRunForUser } from "@/lib/runs/cancelRun";
import { ApiError } from "@/lib/api";
import { McpToolError } from "@/mcp/errors";
import {
  findWorkflowForRun,
  getRequestFieldSchema,
  graphSnapshotFromWorkflow,
} from "@/mcp/services/workflows";

export async function listWorkflowRuns(ownerId: string, workflowId: string, limit = 50) {
  const workflow = await findReadableWorkflow(workflowId, ownerId);
  if (!workflow) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }

  const runs = await prisma.workflowRun.findMany({
    where: { workflowId, ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return { runs: runs.map(toWorkflowRunApi) };
}

export async function startWorkflowRun(args: {
  ownerId: string;
  workflowRef: string;
  values?: Record<string, unknown>;
  targetNodeIds?: string[];
  idempotencyKey?: string;
  apiKeyId?: string;
}) {
  const workflow = await findWorkflowForRun(args.workflowRef, args.ownerId);
  const graphSnapshot = graphSnapshotFromWorkflow(workflow.graph, args.values);
  const requestSchema = getRequestFieldSchema(graphSnapshot);

  if (args.values === undefined && requestSchema && requestSchema.length > 0) {
    return {
      status: "needs_input" as const,
      workflowId: workflow.id,
      workflowName: workflow.name,
      requestFields: requestSchema,
      message: "Provide values for request fields and call start_run again.",
    };
  }

  const targetNodeIds = [...new Set(args.targetNodeIds ?? [])];
  const scope = deriveRunScope(targetNodeIds);
  const graph = parseWorkflowGraphForExecution(graphSnapshot);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  for (const nodeId of targetNodeIds) {
    if (!nodeIds.has(nodeId)) {
      throw new McpToolError("BAD_REQUEST", `Unknown node id: ${nodeId}`);
    }
  }

  const closure = validateRunClosureInputs(graphSnapshot, targetNodeIds);
  if (!closure.ok) {
    throw new McpToolError("BAD_REQUEST", closure.message);
  }

  const estimatedCredits = estimateExecutionSubgraphCredits(graphSnapshot, targetNodeIds);
  try {
    await assertSufficientCredits(args.ownerId, estimatedCredits);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      throw new McpToolError(
        "INSUFFICIENT_CREDITS",
        `${error.message} (required: ${error.required}, balance: ${error.balance})`,
      );
    }
    throw error;
  }

  if (args.idempotencyKey) {
    const existing = await prisma.workflowRun.findFirst({
      where: {
        workflowId: workflow.id,
        ownerId: args.ownerId,
        idempotencyKey: args.idempotencyKey,
      },
    });
    if (existing) {
      return { run: toWorkflowRunApi(existing), created: false as const };
    }
  }

  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      ownerId: args.ownerId,
      scope,
      targetNodeIds,
      graphSnapshot: graphSnapshot as Prisma.InputJsonValue,
      idempotencyKey: args.idempotencyKey,
      initiator: "MCP",
      apiKeyId: args.apiKeyId,
      status: "QUEUED",
      estimatedCredits,
    },
  });

  await enqueueWorkflowRun({ workflowId: workflow.id, runId: run.id });
  const hydrated = await prisma.workflowRun.findUnique({ where: { id: run.id } });
  return { run: toWorkflowRunApi(hydrated ?? run), created: true as const };
}

export async function getRunStatus(ownerId: string, runId: string) {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, ownerId },
    include: {
      nodeRuns: {
        orderBy: { createdAt: "asc" },
        include: { providerAttempts: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!run) {
    throw new McpToolError("NOT_FOUND", "Run not found");
  }

  const terminal = ["SUCCESS", "FAILED", "CANCELLED"].includes(run.status);
  const responseNodeRun = run.nodeRuns.find((nodeRun) => nodeRun.nodeType === "response");
  const responseOutput = responseNodeRun?.resolvedOutput;

  return {
    run: toWorkflowRunApi(run),
    nodeRuns: run.nodeRuns.map((nodeRun) => toNodeRunApi(nodeRun, nodeRun.providerAttempts)),
    completed: terminal,
    stillRunning: !terminal,
    results: responseOutput ?? null,
    pollAgain: !terminal,
  };
}

export async function cancelWorkflowRun(ownerId: string, runId: string) {
  try {
    return await cancelWorkflowRunForUser(ownerId, runId);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new McpToolError(error.code, error.message);
    }
    throw error;
  }
}

export function listRunsForOwnerFilter(
  ownerId: string,
  filters?: { workflowId?: string; status?: RunStatus; limit?: number },
) {
  return prisma.workflowRun.findMany({
    where: {
      ownerId,
      ...(filters?.workflowId ? { workflowId: filters.workflowId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 50,
  });
}

export async function listRuns(
  ownerId: string,
  filters?: { workflowId?: string; status?: RunStatus; limit?: number },
) {
  const runs = await listRunsForOwnerFilter(ownerId, filters);
  return { runs: runs.map(toWorkflowRunApi) };
}
