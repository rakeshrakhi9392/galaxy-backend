/**
 * Frontend-safe execute helpers (no Prisma / provider runtime imports).
 * Catalog nodes import from here so @galaxy/schemas can load in the browser.
 */
import type { WorkflowGraph, WorkflowNode } from "../schemas/graph";
import {
  formatProviderLimitError,
  type ProviderLimitViolation,
} from "../schemas/providerInputLimits";
import type { ProviderContext } from "../providers/contextTypes";

export type NodeExecuteContext = {
  workflowRunId: string;
  nodeId: string;
  nodeRunId?: string;
  nodeType: string;
  nodeData: unknown;
  node?: WorkflowNode;
  graph?: WorkflowGraph;
  /** Resolved outputs from upstream nodes in the current run (node id → output). */
  upstreamOutputs?: Record<string, unknown>;
  providerCtx: ProviderContext;
};

export type NodeExecuteResult<TOutput = unknown> = {
  output: TOutput;
  sleptMs: number;
  provider: string | null;
};

export async function assertNoLimitViolations(
  nodeType: string,
  violations: ProviderLimitViolation[] | Promise<ProviderLimitViolation[]>,
): Promise<void> {
  const resolved = await violations;
  if (resolved.length === 0) return;
  throw new Error(`[${nodeType}] ${formatProviderLimitError(resolved)}`);
}

/** Local plumbing nodes (request/response) — short deterministic delay, no provider. */
export async function executeLocalNode<TOutput>(
  buildOutput: () => TOutput,
): Promise<NodeExecuteResult<TOutput>> {
  const sleptMs = 250;
  await new Promise((resolve) => setTimeout(resolve, sleptMs));
  return {
    output: buildOutput(),
    sleptMs,
    provider: null,
  };
}
