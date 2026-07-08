import type { WorkflowGraph } from "./graph";
import { parseWorkflowGraph } from "./graph";

export const REQUEST_NODE_TYPE = "request";

type GraphAdjacency = {
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, string[]>;
};

function buildAdjacency(g: WorkflowGraph): GraphAdjacency {
  const nodesById = new Set(g.nodes.map((node) => node.id));
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, string[]>();

  for (const node of g.nodes) {
    outgoing.set(node.id, new Set());
    incoming.set(node.id, []);
  }

  for (const edge of g.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    outgoing.get(edge.source)!.add(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }

  return { outgoing, incoming };
}

/** Selected nodes plus every ancestor along wired edges. */
function collectUpstreamNodeIds(
  incoming: Map<string, string[]>,
  targetNodeIds: string[],
): Set<string> {
  const allowed = new Set<string>();
  const stack = [...targetNodeIds];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (allowed.has(id)) continue;
    allowed.add(id);
    for (const src of incoming.get(id) ?? []) {
      stack.push(src);
    }
  }

  return allowed;
}

/** Roots plus every descendant along wired edges. */
function collectDownstreamClosure(
  outgoing: Map<string, Set<string>>,
  rootNodeIds: string[],
): Set<string> {
  const allowed = new Set<string>();
  const stack = [...rootNodeIds];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (allowed.has(id)) continue;
    allowed.add(id);
    for (const target of outgoing.get(id) ?? []) {
      stack.push(target);
    }
  }

  return allowed;
}

/**
 * Execution set for a run.
 *
 * - No target IDs (full): every Request Inputs node, then all nodes reachable
 *   downstream. Nodes with no path from Request Inputs are excluded.
 * - One or more target IDs (single / partial): each target plus all upstream
 *   ancestors; union of those closures.
 */
export function resolveExecutionNodeIds(
  graph: unknown,
  targetNodeIds: readonly string[],
): Set<string> {
  let g: WorkflowGraph;
  try {
    g = parseWorkflowGraph(graph);
  } catch {
    return new Set();
  }
  const { incoming, outgoing } = buildAdjacency(g);

  if (targetNodeIds.length === 0) {
    const requestIds = g.nodes
      .filter((node) => node.type === REQUEST_NODE_TYPE)
      .map((node) => node.id);
    return collectDownstreamClosure(outgoing, requestIds);
  }

  return collectUpstreamNodeIds(incoming, [...targetNodeIds]);
}
