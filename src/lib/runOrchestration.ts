import type { Prisma, RunStatus, WorkflowRunScope } from "@prisma/client";
import { z } from "zod";
import { CATALOG_NODE_TYPES, type WorkflowNode } from "@galaxy/schemas";
import { prisma } from "@/lib/prisma";
import { executeNode, type ExecuteNodeInput, type ExecuteNodeOutput } from "@/lib/executeNode";
import { isLocalNodeType } from "@/nodes/localNodeTypes";
import {
  buildExecutionSubgraph,
  buildSchedulerGraphFromSubgraph,
  parseWorkflowGraphForExecution,
} from "@/trigger/graph";
import { resolveNodeInputs } from "@/lib/resolveNodeInputs";
import { estimateNodeCreditsFromResolved, estimateExecutionSubgraphCredits } from "@/lib/estimateNodeCredits";
import {
  deductRunCharge,
  getCreditBalance,
  InsufficientCreditsError,
  assertSufficientCredits,
} from "@/lib/creditsLedger";
import { readLogPreviewFromError } from "@/lib/nodeRunLog";
import { buildRunErrorSummary } from "@/lib/runFailureSummary";
import { emitWebhookEvent } from "@/lib/webhooks/emit";
import {
  buildNodeCompletedPayload,
  buildRunCompletedPayload,
  buildRunFailedPayload,
  buildRunStartedPayload,
} from "@/lib/webhooks/payloads";

async function emitEarlyRunFailed(run: { id: string; ownerId: string }, errorSummary: string) {
  const failedRun = await prisma.workflowRun.findUnique({ where: { id: run.id } });
  if (!failedRun) return;
  emitWebhookEvent({
    userId: run.ownerId,
    payload: buildRunFailedPayload(failedRun, errorSummary),
    workflowRunId: run.id,
  });
}

async function skipNodeForInsufficientCredits(args: {
  workflowRunId: string;
  node: WorkflowNode;
  required: number;
  balance: number;
}) {
  const message = `Insufficient credits: need ${args.required.toLocaleString()}, balance ${args.balance.toLocaleString()}.`;
  await prisma.nodeRun.create({
    data: {
      workflowRunId: args.workflowRunId,
      nodeId: args.node.id,
      nodeType: args.node.type ?? "unknown",
      attempt: 1,
      status: "SKIPPED",
      finishedAt: new Date(),
      provider: null,
      estimatedCredits: args.required,
      error: {
        code: "INSUFFICIENT_CREDITS",
        message,
        required: args.required,
        balance: args.balance,
      } as Prisma.InputJsonValue,
    },
  });
}
export type ExecuteNodeFn = (input: ExecuteNodeInput) => Promise<ExecuteNodeOutput>;

async function executeNodeInline(item: LayerExecutionItem): Promise<LayerExecutionResult> {
  const startedAt = Date.now();
  try {
    const output = await executeNode(item.input);
    return {
      nodeId: item.nodeId,
      ok: true,
      output,
      durationMs: output.sleptMs ?? Date.now() - startedAt,
    };
  } catch (error) {
    return {
      nodeId: item.nodeId,
      ok: false,
      error,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function executeWaveItems(
  waveItems: LayerExecutionItem[],
  startNodeBatch: StartNodeBatchFn,
): Promise<LayerExecutionResult[]> {
  const localItems = waveItems.filter((item) => isLocalNodeType(item.input.nodeType));
  const remoteItems = waveItems.filter((item) => !isLocalNodeType(item.input.nodeType));

  const results: LayerExecutionResult[] = [];

  for (const item of localItems) {
    results.push(await executeNodeInline(item));
  }

  if (remoteItems.length > 0) {
    results.push(...(await startNodeBatch(remoteItems)));
  }

  return results;
}

export type LayerExecutionItem = {
  nodeRunId: string;
  nodeId: string;
  input: ExecuteNodeInput;
  nodeCreditEstimate: number;
};
export type LayerExecutionResult =
  | { nodeId: string; ok: true; output: ExecuteNodeOutput; durationMs: number }
  | { nodeId: string; ok: false; error: unknown; durationMs: number };

/**
 * Dispatch a ready wave via per-node Trigger tasks.
 * One `batch.triggerByTaskAndWait` (or single `triggerAndWait`) per wave — never concurrent waits.
 */
export type StartNodeBatchFn = (
  items: LayerExecutionItem[],
) => Promise<LayerExecutionResult[]>;

/** @deprecated Use `StartNodeBatchFn` */
export type StartHeavyBatchFn = StartNodeBatchFn;

export type OrchestrationProgress = {
  /** Total nodes in the execution subgraph (field name kept for Trigger metadata compat). */
  layersTotal: number;
  /** Nodes that reached a terminal status (success / failed / skipped). */
  layersCompleted: number;
  runningNodeIds: string[];
  nodeStatuses: Record<string, RunStatus>;
  nodeTypes: Record<string, string>;
  /** Node ids in the order they began executing (for run history UI). */
  nodeExecutionOrder: string[];
};

function toJsonError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export const ORCHESTRATOR_INTERRUPTED_CODE = "ORCHESTRATOR_INTERRUPTED";
export const RUN_CANCELLED_MID_NODE_CODE = "RUN_CANCELLED_MID_NODE";

export const ORCHESTRATOR_INTERRUPTED_MESSAGE =
  "Workflow orchestrator stopped before this node finished.";

export const RUN_CANCELLED_MID_NODE_MESSAGE =
  "Run was cancelled while this node was executing.";

export type OrchestrationResult = {
  ok: boolean;
  hadFailures: boolean;
  cancelled: boolean;
  errorSummary: string | null;
};

/**
 * Mark any node runs still `RUNNING` as `FAILED` so a crashed or cancelled
 * orchestrator cannot strand nodes in a non-terminal state.
 */
export async function sweepOrphanedRunningNodeRuns(args: {
  workflowRunId: string;
  reason: string;
  code?: string;
  nodeStatuses?: Record<string, RunStatus>;
  terminalIds?: Set<string>;
}): Promise<string[]> {
  const stuck = await prisma.nodeRun.findMany({
    where: { workflowRunId: args.workflowRunId, status: "RUNNING" },
    select: { id: true, nodeId: true },
  });

  if (stuck.length === 0) return [];

  const error = {
    code: args.code ?? ORCHESTRATOR_INTERRUPTED_CODE,
    message: args.reason,
  } as Prisma.InputJsonValue;

  await prisma.nodeRun.updateMany({
    where: { id: { in: stuck.map((row) => row.id) } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      error,
    },
  });

  for (const row of stuck) {
    args.nodeStatuses && (args.nodeStatuses[row.nodeId] = "FAILED");
    args.terminalIds?.add(row.nodeId);
  }

  return stuck.map((row) => row.nodeId);
}

function buildExecuteInput(args: {
  workflowRunId: string;
  nodeRunId: string;
  node: WorkflowNode;
  graph: ReturnType<typeof parseWorkflowGraphForExecution>;
  resolvedInputs: Record<string, unknown>;
  outputsByNodeId: Record<string, unknown>;
}): ExecuteNodeInput {
  const nodeType = z.enum(CATALOG_NODE_TYPES).parse(args.node.type);
  return {
    workflowRunId: args.workflowRunId,
    nodeRunId: args.nodeRunId,
    nodeId: args.node.id,
    nodeType,
    node: args.node,
    graph: args.graph,
    nodeData: args.node.data ?? null,
    resolvedInputs: args.resolvedInputs,
    upstream: args.outputsByNodeId,
  };
}

async function createSkippedNodeRun(args: {
  workflowRunId: string;
  node: WorkflowNode;
  reason: string;
}) {
  await prisma.nodeRun.create({
    data: {
      workflowRunId: args.workflowRunId,
      nodeId: args.node.id,
      nodeType: args.node.type ?? "unknown",
      attempt: 1,
      status: "SKIPPED",
      finishedAt: new Date(),
      provider: null,
      error: { message: args.reason } as Prisma.InputJsonValue,
    },
  });
}

async function isRunStillActive(runId: string): Promise<boolean> {
  const current = await prisma.workflowRun.findFirst({
    where: { id: runId },
    select: { status: true },
  });
  return current?.status === "RUNNING";
}

/**
 * Ready-queue DAG scheduler (layer / wave based).
 *
 * - Execution set is the scoped subgraph (downstream of Request Inputs, or
 *   upstream closure of selected targets) — disconnected nodes are ignored.
 * - `assertNoCycles` runs before any work (via `buildSchedulerGraph`).
 * - A node is ready when all parents in the subgraph are terminal and readiness rules pass.
 * - Response nodes run when any parent succeeded (partial multi-path runs).
 * - Other nodes require every parent to have succeeded.
 * - Ready nodes in the same wave run via one `startNodeBatch` call
 *   (Trigger: `batch.triggerByTaskAndWait` — a single wait, not Promise.race of waits).
 * - Failed branches skip only their serial descendants; independent paths continue.
 */
export async function orchestrateWorkflowRunCore(args: {
  workflowId: string;
  runId: string;
  startNodeBatch: StartNodeBatchFn;
  /** @deprecated Use `startNodeBatch` */
  startHeavyBatch?: StartNodeBatchFn;
  onProgress?: (progress: OrchestrationProgress) => void | Promise<void>;
}) {
  const startNodeBatch = args.startNodeBatch ?? args.startHeavyBatch;
  if (!startNodeBatch) {
    throw new Error("orchestrateWorkflowRunCore requires startNodeBatch");
  }
  const run = await prisma.workflowRun.findFirst({
    where: { id: args.runId, workflowId: args.workflowId },
  });
  if (!run) throw new Error("WorkflowRun not found");

  const startedAt = run.startedAt ?? new Date();
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt },
  });

  emitWebhookEvent({
    userId: run.ownerId,
    payload: buildRunStartedPayload({ ...run, status: "RUNNING", startedAt }),
    workflowRunId: run.id,
  });

  const fullGraph = parseWorkflowGraphForExecution(run.graphSnapshot);
  const scope = run.scope as WorkflowRunScope;
  void scope;

  const subgraph = buildExecutionSubgraph(run.graphSnapshot, run.targetNodeIds);

  if (subgraph.nodes.length === 0) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: "No nodes to execute",
      },
    });
    await emitEarlyRunFailed(run, "No nodes to execute");
    return { ok: false as const, hadFailures: true, cancelled: false, errorSummary: "No nodes to execute" };
  }

  let scheduler: ReturnType<typeof buildSchedulerGraphFromSubgraph>;
  try {
    scheduler = buildSchedulerGraphFromSubgraph(subgraph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: message,
      },
    });
    await emitEarlyRunFailed(run, message);
    return { ok: false as const, hadFailures: true, cancelled: false, errorSummary: message };
  }

  const { nodesById, pendingDeps, children } = scheduler;
  const parents = new Map<string, string[]>();
  for (const node of subgraph.nodes) {
    parents.set(node.id, []);
  }
  for (const edge of subgraph.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    parents.get(edge.target)!.push(edge.source);
  }

  const ready: string[] = [...scheduler.initialReady];
  const skippedIds = new Set<string>();
  const terminalIds = new Set<string>();

  const outputsByNodeId: Record<string, unknown> = {};
  const nodeStatuses: Record<string, RunStatus> = {};
  const nodeExecutionOrder: string[] = [];
  const nodeTypes: Record<string, string> = {};
  const recordNodeExecutionStart = (nodeId: string) => {
    if (!nodeExecutionOrder.includes(nodeId)) {
      nodeExecutionOrder.push(nodeId);
    }
  };
  for (const node of subgraph.nodes) {
    nodeTypes[node.id] = node.type ?? "unknown";
  }

  const nodesTotal = subgraph.nodes.length;
  const estimatedCredits = estimateExecutionSubgraphCredits(run.graphSnapshot, run.targetNodeIds);

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { estimatedCredits },
  });

  try {
    await assertSufficientCredits(run.ownerId, estimatedCredits);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorSummary: error.message,
        },
      });
      await emitEarlyRunFailed(run, error.message);
      return { ok: false as const, hadFailures: true, cancelled: false, errorSummary: error.message };
    }
    throw error;
  }

  let actualCreditsTotal = 0;
  let hadFailures = false;
  let firstErrorMessage: string | null = null;
  let firstFailedNodeId: string | null = null;
  let firstFailedNodeType: string | null = null;
  let cancelled = false;
  let creditExhausted = false;

  const recordFirstFailure = (nodeId: string, message: string) => {
    hadFailures = true;
    if (!firstErrorMessage) {
      firstErrorMessage = message;
      firstFailedNodeId = nodeId;
      firstFailedNodeType = nodeTypes[nodeId] ?? nodesById.get(nodeId)?.type ?? "unknown";
    }
  };

  const ownerId = run.ownerId;

  const resolveCreditsForNode = (node: WorkflowNode) => {
    const resolvedInputs = resolveNodeInputs({
      node,
      graph: fullGraph,
      outputsByNodeId,
    });
    return {
      resolvedInputs,
      credits: estimateNodeCreditsFromResolved(node.type ?? "unknown", resolvedInputs),
    };
  };

  const handleCreditExhaustion = async (node: WorkflowNode, required: number, balance: number) => {
    creditExhausted = true;
    const message = `Insufficient credits: need ${required.toLocaleString()}, balance ${balance.toLocaleString()}.`;
    recordFirstFailure(node.id, message);
    await skipNodeForInsufficientCredits({
      workflowRunId: run.id,
      node,
      required,
      balance,
    });
    nodeStatuses[node.id] = "SKIPPED";
    recordNodeExecutionStart(node.id);
    terminalIds.add(node.id);
    skippedIds.add(node.id);
    await notifyParentTerminal(node.id);
  };

  const skipScheduledNode = async (nodeId: string, reason: string) => {
    if (terminalIds.has(nodeId) || skippedIds.has(nodeId)) return;
    const node = nodesById.get(nodeId);
    if (!node) return;

    skippedIds.add(nodeId);
    await createSkippedNodeRun({
      workflowRunId: run.id,
      node,
      reason,
    });
    nodeStatuses[nodeId] = "SKIPPED";
    recordNodeExecutionStart(nodeId);
    terminalIds.add(nodeId);

    for (let i = ready.length - 1; i >= 0; i -= 1) {
      if (ready[i] === nodeId) ready.splice(i, 1);
    }

    await notifyParentTerminal(nodeId);
  };

  const markResponseAwaitingInputs = async (childId: string) => {
    if (nodeTypes[childId] !== "response") return;
    if (terminalIds.has(childId) || skippedIds.has(childId)) return;
    if (nodeStatuses[childId] === "RUNNING") return;

    nodeStatuses[childId] = "RUNNING";
    recordNodeExecutionStart(childId);
    await emitProgress([]);
  };

  const evaluateChildReadiness = async (childId: string) => {
    if (terminalIds.has(childId) || skippedIds.has(childId)) return;
    const node = nodesById.get(childId);
    if (!node) return;

    const parentIds = parents.get(childId) ?? [];
    const uniqueParentIds = [...new Set(parentIds)];
    const pendingParents = uniqueParentIds.filter((parentId) => !terminalIds.has(parentId));
    if (pendingParents.length > 0) {
      if ((pendingDeps.get(childId) ?? 0) <= 0) {
        await skipScheduledNode(
          childId,
          "Skipped because an upstream node did not complete",
        );
      }
      return;
    }

    const parentStatuses = uniqueParentIds.map((parentId) => nodeStatuses[parentId]);
    const anyParentSucceeded = parentStatuses.some((status) => status === "SUCCESS");
    const allParentsSucceeded =
      uniqueParentIds.length === 0 || parentStatuses.every((status) => status === "SUCCESS");

    const isResponseNode = nodeTypes[childId] === "response" || node.type === "response";

    if (isResponseNode) {
      if (anyParentSucceeded) {
        if (!ready.includes(childId)) ready.push(childId);
      } else {
        await skipScheduledNode(childId, "No successful upstream inputs");
      }
      return;
    }

    if (allParentsSucceeded) {
      if (!ready.includes(childId)) ready.push(childId);
      return;
    }

    await skipScheduledNode(childId, "Skipped because an upstream node failed");
  };

  const notifyParentTerminal = async (parentId: string) => {
    for (const childId of children.get(parentId) ?? []) {
      if (terminalIds.has(childId) || skippedIds.has(childId)) continue;
      const next = (pendingDeps.get(childId) ?? 0) - 1;
      pendingDeps.set(childId, next);
      if (nodeTypes[childId] === "response" && next > 0) {
        await markResponseAwaitingInputs(childId);
      }
      if (next === 0) {
        await evaluateChildReadiness(childId);
      }
    }
  };

  const reconcileUnscheduledNodes = async () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of subgraph.nodes) {
        if (terminalIds.has(node.id) || skippedIds.has(node.id)) continue;
        const uniqueParentIds = [...new Set(parents.get(node.id) ?? [])];
        if (!uniqueParentIds.every((parentId) => terminalIds.has(parentId))) continue;
        changed = true;
        await evaluateChildReadiness(node.id);
      }
    }
  };

  const skipRemainingUnscheduledNodes = async () => {
    for (const node of subgraph.nodes) {
      if (terminalIds.has(node.id) || skippedIds.has(node.id)) continue;
      await skipScheduledNode(node.id, "Skipped because an upstream node did not complete");
    }
  };

  const runReadyQueue = async () => {
    while (ready.length > 0) {
      if (!(await isRunStillActive(run.id))) {
        cancelled = true;
        break;
      }

      const waveIds = ready.splice(0, ready.length);
      const waveItems: LayerExecutionItem[] = [];

      for (const id of waveIds) {
        if (skippedIds.has(id) || terminalIds.has(id)) continue;
        const node = nodesById.get(id);
        if (!node) continue;
        if (!(await canAffordNode(node))) {
          creditExhausted = true;
          break;
        }
        const item = await prepareItem(node);
        if (item) waveItems.push(item);
      }

      if (creditExhausted) {
        ready.length = 0;
        break;
      }

      if (waveItems.length === 0) {
        if (waveIds.every((id) => terminalIds.has(id) || skippedIds.has(id) || !nodesById.has(id))) {
          continue;
        }
        for (const id of waveIds) {
          if (!terminalIds.has(id) && !skippedIds.has(id) && nodesById.has(id)) {
            await skipScheduledNode(id, "Node could not be scheduled");
          }
        }
        continue;
      }

      await emitProgress(waveItems.map((item) => item.nodeId));

      const results = await executeWaveItems(waveItems, startNodeBatch);
      const resultsByNodeId = new Map(results.map((result) => [result.nodeId, result]));

      for (const item of waveItems) {
        const settled = resultsByNodeId.get(item.nodeId) ?? {
          nodeId: item.nodeId,
          ok: false as const,
          error: new Error("Missing batch result for node"),
          durationMs: 0,
        };

        if (settled.ok) {
          await applySuccess(settled, item.nodeRunId, item.nodeCreditEstimate, {
            unlock: !cancelled,
          });
        } else {
          await applyFailure(settled, item.nodeRunId);
        }
      }

      await emitProgress([]);

      if (cancelled) {
        ready.length = 0;
        break;
      }
    }
  };

  const canAffordNode = async (node: WorkflowNode): Promise<boolean> => {
    const { credits } = resolveCreditsForNode(node);
    if (credits <= 0) return true;
    const balance = await getCreditBalance(ownerId);
    if (balance >= credits) return true;
    await handleCreditExhaustion(node, credits, balance);
    return false;
  };

  const emitProgress = async (runningNodeIds: string[]) => {
    await args.onProgress?.({
      layersTotal: nodesTotal,
      layersCompleted: terminalIds.size,
      runningNodeIds,
      nodeStatuses: { ...nodeStatuses },
      nodeTypes,
      nodeExecutionOrder: [...nodeExecutionOrder],
    });
  };

  const applySuccess = async (
    result: Extract<LayerExecutionResult, { ok: true }>,
    nodeRunId: string,
    nodeCredit: number,
    options?: { unlock?: boolean },
  ) => {
    outputsByNodeId[result.nodeId] = result.output.output;
    const resolvedProvider = result.output.provider;
    const nodeType = nodeTypes[result.nodeId] ?? "unknown";

    if (resolvedProvider != null) {
      const hasProviderAttempts = await prisma.providerAttempt.count({
        where: { nodeRunId },
      });
      if (hasProviderAttempts === 0) {
        await prisma.providerAttempt.create({
          data: {
            nodeRunId,
            provider: resolvedProvider,
            status: "SUCCESS",
            durationMs: result.durationMs,
          },
        });
      }
    }

    try {
      await deductRunCharge({
        userId: ownerId,
        amount: nodeCredit,
        workflowRunId: run.id,
        nodeRunId,
        nodeId: result.nodeId,
        nodeType,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        const node = nodesById.get(result.nodeId);
        if (node) {
          await prisma.nodeRun.update({
            where: { id: nodeRunId },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              resolvedOutput: result.output.output as Prisma.InputJsonValue,
              provider: resolvedProvider,
              error: {
                code: "INSUFFICIENT_CREDITS",
                message: error.message,
                required: error.required,
                balance: error.balance,
              } as Prisma.InputJsonValue,
            },
          });
          nodeStatuses[result.nodeId] = "FAILED";
          terminalIds.add(result.nodeId);
          creditExhausted = true;
          recordFirstFailure(result.nodeId, error.message);
          await notifyParentTerminal(result.nodeId);
        }
        return;
      }
      throw error;
    }

    actualCreditsTotal += nodeCredit;

    await prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        resolvedOutput: result.output.output as Prisma.InputJsonValue,
        provider: resolvedProvider,
        actualCredits: nodeCredit,
        ...(result.output.logPreview ? { logPreview: result.output.logPreview } : {}),
      },
    });

    nodeStatuses[result.nodeId] = "SUCCESS";
    terminalIds.add(result.nodeId);
    if (options?.unlock !== false) {
      await notifyParentTerminal(result.nodeId);
    }

    const completedNodeRun = {
      id: nodeRunId,
      nodeId: result.nodeId,
      nodeType: nodeTypes[result.nodeId] ?? "unknown",
      status: "SUCCESS" as const,
      startedAt: null as Date | null,
      finishedAt: new Date(),
      provider: resolvedProvider,
    };
    emitWebhookEvent({
      userId: ownerId,
      payload: buildNodeCompletedPayload({
        runId: run.id,
        nodeRun: completedNodeRun,
      }),
      workflowRunId: run.id,
    });
  };
  const applyFailure = async (
    result: Extract<LayerExecutionResult, { ok: false }>,
    nodeRunId: string,
  ) => {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    recordFirstFailure(result.nodeId, message);
    const logPreview = readLogPreviewFromError(result.error);

    await prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: toJsonError(result.error) as Prisma.InputJsonValue,
        ...(logPreview ? { logPreview } : {}),
      },
    });

    nodeStatuses[result.nodeId] = "FAILED";
    terminalIds.add(result.nodeId);
    await notifyParentTerminal(result.nodeId);
  };

  const prepareItem = async (node: WorkflowNode): Promise<LayerExecutionItem | null> => {
    const nodeType = node.type ?? "unknown";
    const { resolvedInputs, credits: nodeCreditEstimate } = resolveCreditsForNode(node);

    const nodeRun = await prisma.nodeRun.create({
      data: {
        workflowRunId: run.id,
        nodeId: node.id,
        nodeType,
        attempt: 1,
        status: "RUNNING",
        startedAt: new Date(),
        resolvedInput: resolvedInputs as Prisma.InputJsonValue,
        provider: null,
        estimatedCredits: nodeCreditEstimate,
      },
    });

    nodeStatuses[node.id] = "RUNNING";
    recordNodeExecutionStart(node.id);

    return {
      nodeRunId: nodeRun.id,
      nodeId: node.id,
      input: buildExecuteInput({
        workflowRunId: run.id,
        nodeRunId: nodeRun.id,
        node,
        graph: fullGraph,
        resolvedInputs,
        outputsByNodeId,
      }),
      nodeCreditEstimate,
    };
  };

  const finalizeRun = async (
    finalStatus: RunStatus,
    errorSummary: string | null,
  ): Promise<string | null> => {
    let summary = errorSummary;
    if (summary && firstFailedNodeId) {
      summary = buildRunErrorSummary({
        message: summary,
        nodeId: firstFailedNodeId,
        nodeType: firstFailedNodeType ?? undefined,
      });
    }

    if (finalStatus === "CANCELLED") {
      const orphaned = await sweepOrphanedRunningNodeRuns({
        workflowRunId: run.id,
        reason: RUN_CANCELLED_MID_NODE_MESSAGE,
        code: RUN_CANCELLED_MID_NODE_CODE,
        nodeStatuses,
        terminalIds,
      });
      if (orphaned.length > 0 && !summary) {
        summary = "Run was cancelled while nodes were still executing.";
      }
    } else {
      await sweepOrphanedRunningNodeRuns({
        workflowRunId: run.id,
        reason: ORCHESTRATOR_INTERRUPTED_MESSAGE,
        code: ORCHESTRATOR_INTERRUPTED_CODE,
        nodeStatuses,
        terminalIds,
      });
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        errorSummary: summary,
        actualCredits: actualCreditsTotal,
      },
    });

    const finishedRun = {
      ...run,
      status: finalStatus,
      finishedAt: new Date(),
      errorSummary: summary,
      actualCredits: actualCreditsTotal,
    };
    if (finalStatus === "SUCCESS") {
      emitWebhookEvent({
        userId: run.ownerId,
        payload: buildRunCompletedPayload(finishedRun),
        workflowRunId: run.id,
      });
    } else if (finalStatus === "FAILED") {
      emitWebhookEvent({
        userId: run.ownerId,
        payload: buildRunFailedPayload(finishedRun, summary),
        workflowRunId: run.id,
      });
    }

    await emitProgress([]);
    return summary;
  };

  try {
  await runReadyQueue();
  if (!cancelled && !creditExhausted) {
    await reconcileUnscheduledNodes();
    await runReadyQueue();
    await skipRemainingUnscheduledNodes();
  }
  } catch (err) {
    const crashMessage = err instanceof Error ? err.message : String(err);
    if (!firstErrorMessage) firstErrorMessage = crashMessage;
    hadFailures = true;

    await sweepOrphanedRunningNodeRuns({
      workflowRunId: run.id,
      reason: ORCHESTRATOR_INTERRUPTED_MESSAGE,
      code: ORCHESTRATOR_INTERRUPTED_CODE,
      nodeStatuses,
      terminalIds,
    });

    await finalizeRun("FAILED", firstErrorMessage);
    return {
      ok: false,
      hadFailures: true,
      cancelled: false,
      errorSummary: firstErrorMessage,
    };
  }

  const finalStatus = cancelled
    ? "CANCELLED"
    : hadFailures || creditExhausted
      ? "FAILED"
      : "SUCCESS";

  const errorSummary =
    hadFailures || creditExhausted ? firstErrorMessage : null;

  const resolvedSummary = await finalizeRun(finalStatus, errorSummary);

  return {
    ok: !hadFailures && !cancelled,
    hadFailures: hadFailures || cancelled,
    cancelled,
    errorSummary: resolvedSummary,
  };
}
