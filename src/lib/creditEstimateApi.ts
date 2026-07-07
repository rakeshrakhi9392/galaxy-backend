import { z } from "zod";
import { WorkflowGraphSchema } from "@galaxy/schemas";
import { ApiError } from "@/lib/api";
import {
  estimateExecutionSubgraphBreakdown,
  estimateNodeCreditsFromResolved,
} from "@/lib/estimateNodeCredits";
import { nodeRegistry } from "@/nodes/registry";

/** Galaxy API parity: batch node estimate cap. */
export const MAX_BATCH_ESTIMATE_NODES = 100;

/** Galaxy API parity: workflow estimate cap (editor node limit). */
export const MAX_WORKFLOW_ESTIMATE_NODES = 100;

export const EstimateCreditsNodeSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  subModelId: z.string().min(1).optional(),
});

export const NodesEstimateCreditsRequestSchema = z.object({
  nodes: z.array(EstimateCreditsNodeSchema).min(1).max(MAX_BATCH_ESTIMATE_NODES),
});

/** Galaxy flat list mode, or editor graph + target closure (matches run creation). */
export const WorkflowEstimateCreditsRequestSchema = z
  .object({
    nodes: z.array(EstimateCreditsNodeSchema).max(MAX_WORKFLOW_ESTIMATE_NODES).optional(),
    graph: WorkflowGraphSchema.optional(),
    targetNodeIds: z.array(z.string()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.graph) return;
    if (!value.nodes?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Either graph or a non-empty nodes array is required",
        path: ["nodes"],
      });
    }
  });

export const NodeMicrocreditEstimateSchema = z.object({
  microcredits: z.number().int().nonnegative(),
});

export const NodesEstimateCreditsResponseSchema = z.object({
  estimates: z.array(NodeMicrocreditEstimateSchema),
});

export const WorkflowEstimateCreditsResponseSchema = z.object({
  totalMicrocredits: z.number().int().nonnegative(),
  estimates: z.array(NodeMicrocreditEstimateSchema),
});

export const CreditBalanceResponseSchema = z.object({
  availableBalance: z.number().int().nonnegative(),
  formatted: z.string(),
  hasActiveSubscription: z.boolean(),
  isOrganization: z.boolean(),
});

export type EstimateCreditsNodeInput = z.infer<typeof EstimateCreditsNodeSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertKnownNodeType(type: string): void {
  if (!nodeRegistry[type]) {
    throw new ApiError(400, "BAD_REQUEST", `Unknown node type: ${type}`);
  }
}

/** Normalize Galaxy-style `data` (+ optional subModelId) into execution inputs. */
export function resolveEstimateNodeInputs(
  data: unknown,
  subModelId?: string,
): Record<string, unknown> {
  const record = asRecord(data);
  const nestedInputs = asRecord(record.inputs);
  const merged =
    Object.keys(nestedInputs).length > 0
      ? { ...nestedInputs, ...record }
      : { ...record };
  delete merged.inputs;
  if (subModelId) {
    merged.mode = subModelId;
  }
  return merged;
}

export function estimateMicrocreditsForNode(node: EstimateCreditsNodeInput): number {
  assertKnownNodeType(node.type);
  const inputs = resolveEstimateNodeInputs(node.data, node.subModelId);
  return estimateNodeCreditsFromResolved(node.type, inputs);
}

/** Batch estimate — one entry per request node, input order preserved. */
export function estimateNodesMicrocredits(nodes: EstimateCreditsNodeInput[]): {
  estimates: Array<{ microcredits: number }>;
} {
  const estimates = nodes.map((node) => ({
    microcredits: estimateMicrocreditsForNode(node),
  }));
  return { estimates };
}

/**
 * Workflow total estimate — sum of per-node microcredits.
 * Invariant: totalMicrocredits === sum(estimates[].microcredits).
 */
export function estimateWorkflowMicrocredits(nodes: EstimateCreditsNodeInput[]): {
  totalMicrocredits: number;
  estimates: Array<{ microcredits: number }>;
} {
  const { estimates } = estimateNodesMicrocredits(nodes);
  const totalMicrocredits = estimates.reduce((sum, item) => sum + item.microcredits, 0);
  return { totalMicrocredits, estimates };
}

/** Subgraph-aware estimate — same engine as run pre-check / charging. */
export function estimateWorkflowGraphMicrocredits(
  graphSnapshot: unknown,
  targetNodeIds: readonly string[],
): { totalMicrocredits: number; estimates: Array<{ microcredits: number }> } {
  return estimateExecutionSubgraphBreakdown(graphSnapshot, targetNodeIds);
}

export function resolveWorkflowEstimatePayload(
  body: z.infer<typeof WorkflowEstimateCreditsRequestSchema>,
): { totalMicrocredits: number; estimates: Array<{ microcredits: number }> } {
  if (body.graph) {
    return estimateWorkflowGraphMicrocredits(body.graph, body.targetNodeIds);
  }
  return estimateWorkflowMicrocredits(body.nodes ?? []);
}

/** Human-readable balance (millions / thousands), matching Galaxy `formatted`. */
export function formatMicrocreditBalance(microcredits: number): string {
  if (microcredits >= 1_000_000) {
    return `${(microcredits / 1_000_000).toFixed(2)}M`;
  }
  if (microcredits >= 1_000) {
    return `${(microcredits / 1_000).toFixed(0)}K`;
  }
  if (microcredits <= 0) {
    return "0.00M";
  }
  return `${(microcredits / 1_000_000).toFixed(4)}M`;
}

export function buildCreditBalanceResponse(availableBalance: number) {
  return {
    availableBalance,
    formatted: formatMicrocreditBalance(availableBalance),
    hasActiveSubscription: true,
    isOrganization: false,
  };
}
