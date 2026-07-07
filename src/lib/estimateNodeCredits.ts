import type { WorkflowGraph, WorkflowNode } from "@galaxy/schemas";
import { getNodeDefinition } from "@/nodes/registry";
import {
  buildPreRunOutputsByNodeId,
  resolveNodeInputs,
} from "@/lib/resolveNodeInputs";
import {
  buildExecutionSubgraph,
  parseWorkflowGraphForExecution,
} from "@/trigger/graph";
import { isLocalNodeType } from "@/nodes/localNodeTypes";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultInputsForType(nodeType: string): Record<string, unknown> {
  try {
    const def = getNodeDefinition(nodeType);
    return asRecord(asRecord(def.ui.defaults).inputs);
  } catch {
    return {};
  }
}

/** Live credit estimate for one node from resolved execution inputs. */
export function estimateNodeCreditsFromResolved(
  nodeType: string,
  resolvedInputs: Record<string, unknown> = {},
): number {
  const merged = { ...defaultInputsForType(nodeType), ...resolvedInputs };

  try {
    const def = getNodeDefinition(nodeType);
    if (def.estimateCredits) {
      return def.estimateCredits(merged);
    }
    return def.ui.pricing?.estimateCredits ?? 0;
  } catch {
    return 0;
  }
}

function isChargeableNode(node: WorkflowNode): boolean {
  return !isLocalNodeType(node.type ?? "");
}

/**
 * Sum per-node estimates for the execution subgraph using wired + static inputs.
 * Walks nodes in topological order so upstream request outputs inform downstream estimates.
 */
export function estimateExecutionSubgraphBreakdown(
  graphSnapshot: unknown,
  targetNodeIds: readonly string[],
): { totalMicrocredits: number; estimates: Array<{ microcredits: number }> } {
  const fullGraph = parseWorkflowGraphForExecution(graphSnapshot);
  const subgraph = buildExecutionSubgraph(graphSnapshot, targetNodeIds);
  const outputsByNodeId = buildPreRunOutputsByNodeId(fullGraph);

  const estimates: Array<{ microcredits: number }> = [];
  let totalMicrocredits = 0;

  for (const node of subgraph.nodes) {
    if (!isChargeableNode(node)) continue;
    const resolvedInputs = resolveNodeInputs({
      node,
      graph: fullGraph,
      outputsByNodeId,
    });
    const microcredits = estimateNodeCreditsFromResolved(node.type ?? "unknown", resolvedInputs);
    estimates.push({ microcredits });
    totalMicrocredits += microcredits;
  }

  return { totalMicrocredits, estimates };
}

export function estimateExecutionSubgraphCredits(
  graphSnapshot: unknown,
  targetNodeIds: readonly string[],
): number {
  return estimateExecutionSubgraphBreakdown(graphSnapshot, targetNodeIds).totalMicrocredits;
}

/** Estimate credits for a single node within a graph (pre-run validation). */
export function estimateNodeCreditsForGraphNode(
  graph: WorkflowGraph,
  node: WorkflowNode,
): number {
  if (!isChargeableNode(node)) return 0;
  const outputsByNodeId = buildPreRunOutputsByNodeId(graph);
  const resolvedInputs = resolveNodeInputs({
    node,
    graph,
    outputsByNodeId,
  });
  return estimateNodeCreditsFromResolved(node.type ?? "unknown", resolvedInputs);
}
