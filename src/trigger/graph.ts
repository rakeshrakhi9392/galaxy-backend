import { z } from "zod";
import type { WorkflowGraph, WorkflowNode } from "@galaxy/schemas";
import { parseWorkflowGraph, REQUEST_NODE_TYPE, resolveExecutionNodeIds } from "@galaxy/schemas";

export { REQUEST_NODE_TYPE, resolveExecutionNodeIds };

const ReactFlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1).optional(),
  data: z.unknown().optional(),
});

const ReactFlowEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const ReactFlowGraphSchema = z.object({
  nodes: z.array(ReactFlowNodeSchema),
  edges: z.array(ReactFlowEdgeSchema),
});

export type WorkflowNodeLegacy = z.infer<typeof ReactFlowNodeSchema>;

/**
 * Metadata label only — execution always follows the ID-count closure rules.
 * SELECTION is the stored value for multi-select ("partial") runs.
 */
export type WorkflowRunScope = "FULL" | "SINGLE" | "SELECTION";

export function parseWorkflowGraphForExecution(graph: unknown): WorkflowGraph {
  // IMPORTANT: execution scheduling must not auto-inject protected scaffold nodes,
  // otherwise scheduler planning utilities would operate on nodes the caller
  // didn't provide.
  return parseWorkflowGraph(graph);
}

/** Label a run from how many target node IDs arrived (none / one / two+). */
export function deriveRunScope(targetNodeIds: readonly string[]): WorkflowRunScope {
  if (targetNodeIds.length === 0) return "FULL";
  if (targetNodeIds.length === 1) return "SINGLE";
  return "SELECTION";
}

type GraphAdjacency = {
  nodesById: Map<string, WorkflowNode>;
  inDegree: Map<string, number>;
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, string[]>;
};

function buildAdjacency(g: WorkflowGraph): GraphAdjacency {
  const nodesById = new Map(g.nodes.map((n) => [n.id, n] as const));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, string[]>();

  for (const node of g.nodes) {
    inDegree.set(node.id, 0);
    outgoing.set(node.id, new Set());
    incoming.set(node.id, []);
  }

  for (const e of g.edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) continue;
    outgoing.get(e.source)!.add(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    incoming.get(e.target)!.push(e.source);
  }

  return { nodesById, inDegree, outgoing, incoming };
}

/**
 * DFS cycle check with a recursion stack.
 * A back-edge (neighbor still on the stack) means the graph is not a DAG.
 */
export function assertNoCycles(graph: unknown): void {
  const g = parseWorkflowGraphForExecution(graph);
  const { outgoing } = buildAdjacency(g);
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(id: string): void {
    if (stack.has(id)) {
      throw new Error("Graph has a cycle");
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const next of outgoing.get(id) ?? []) {
      dfs(next);
    }
    stack.delete(id);
  }

  for (const node of g.nodes) {
    dfs(node.id);
  }
}

/** True when walking downstream from `fromId` can reach `toId`. */
export function canReachDownstream(
  graph: unknown,
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;
  const g = parseWorkflowGraphForExecution(graph);
  const { outgoing } = buildAdjacency(g);
  const seen = new Set<string>();
  const stack = [fromId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const next of outgoing.get(id) ?? []) {
      if (next === toId) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }

  return false;
}

/**
 * Dependency counters for the ready-queue scheduler.
 * `pendingDeps` is the number of incoming edges in the (sub)graph;
 * `children` lists nodes unlocked when a parent succeeds.
 */
export type SchedulerGraph = {
  nodesById: Map<string, WorkflowNode>;
  pendingDeps: Map<string, number>;
  children: Map<string, string[]>;
  initialReady: string[];
};

export function buildSchedulerGraph(graph: unknown): SchedulerGraph {
  const g = parseWorkflowGraphForExecution(graph);
  return buildSchedulerGraphFromSubgraph(g);
}

/** Schedule a pre-resolved execution subgraph without re-injecting scaffold nodes. */
export function buildSchedulerGraphFromSubgraph(graph: WorkflowGraph): SchedulerGraph {
  assertNoCycles(graph);

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const pendingDeps = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const node of graph.nodes) {
    pendingDeps.set(node.id, 0);
    children.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    pendingDeps.set(edge.target, (pendingDeps.get(edge.target) ?? 0) + 1);
    children.get(edge.source)!.push(edge.target);
  }

  const initialReady: string[] = [];
  for (const [id, deps] of pendingDeps) {
    if (deps === 0) initialReady.push(id);
  }

  return { nodesById, pendingDeps, children, initialReady };
}

/** Kahn layer-by-layer: each layer contains nodes whose dependencies are satisfied. */
export function computeExecutionLayers(graph: unknown): WorkflowNode[][] {
  const g = parseWorkflowGraphForExecution(graph);
  const { nodesById, pendingDeps, children, initialReady } = buildSchedulerGraphFromSubgraph(g);

  const remainingInDegree = new Map(pendingDeps);
  const layers: WorkflowNode[][] = [];
  let ready = [...initialReady];
  let processed = 0;

  while (ready.length > 0) {
    const layerIds = ready;
    ready = [];
    const layer: WorkflowNode[] = [];

    for (const id of layerIds) {
      const node = nodesById.get(id);
      if (!node) continue;
      layer.push(node);
      processed += 1;

      for (const target of children.get(id) ?? []) {
        const next = (remainingInDegree.get(target) ?? 0) - 1;
        remainingInDegree.set(target, next);
        if (next === 0) ready.push(target);
      }
    }

    layers.push(layer);
  }

  if (processed !== g.nodes.length) {
    throw new Error("Graph has a cycle or disconnected invalid edges");
  }

  return layers;
}

export function topoSortReactFlowGraph(graph: unknown): WorkflowNode[] {
  return computeExecutionLayers(graph).flat();
}

/** Selected nodes plus every ancestor along wired edges (union of upstream closures). */
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

function collectDownstreamNodeIds(
  outgoing: Map<string, Set<string>>,
  sourceNodeIds: string[],
): Set<string> {
  const descendants = new Set<string>();
  const stack = [...sourceNodeIds];

  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const target of outgoing.get(id) ?? []) {
      if (descendants.has(target)) continue;
      descendants.add(target);
      stack.push(target);
    }
  }

  return descendants;
}

export function resolveNodesForScope(
  graph: unknown,
  scope: WorkflowRunScope,
  targetNodeIds: string[],
): Set<string> {
  void scope;
  return resolveExecutionNodeIds(graph, targetNodeIds);
}

/**
 * Plan layers for only the execution set, using only edges whose endpoints are
 * both inside that set, in dependency order.
 */
export function planScopedExecution(
  graph: unknown,
  scope: WorkflowRunScope,
  targetNodeIds: string[],
): WorkflowNode[][] {
  void scope;
  const allowed = resolveExecutionNodeIds(graph, targetNodeIds);
  if (allowed.size === 0) return [];

  const g = parseWorkflowGraphForExecution(graph);
  const subgraph: WorkflowGraph = {
    nodes: g.nodes.filter((node) => allowed.has(node.id)),
    edges: g.edges.filter(
      (edge) => allowed.has(edge.source) && allowed.has(edge.target),
    ),
  };

  return computeExecutionLayers(subgraph);
}

export function filterNodesForRunScope(
  sorted: WorkflowNode[],
  graph: unknown,
  scope: WorkflowRunScope,
  targetNodeIds: string[],
): WorkflowNode[] {
  const allowed = resolveNodesForScope(graph, scope, targetNodeIds);
  return sorted.filter((n) => allowed.has(n.id));
}

export function getDownstreamNodeIds(graph: unknown, sourceNodeIds: string[]): Set<string> {
  const g = parseWorkflowGraphForExecution(graph);
  const { outgoing } = buildAdjacency(g);
  return collectDownstreamNodeIds(outgoing, sourceNodeIds);
}

/** Induced subgraph for the run closure (nodes + internal edges only). */
export function buildExecutionSubgraph(
  graph: unknown,
  targetNodeIds: readonly string[],
): WorkflowGraph {
  const allowed = resolveExecutionNodeIds(graph, targetNodeIds);
  const g = parseWorkflowGraphForExecution(graph);
  return {
    nodes: g.nodes.filter((node) => allowed.has(node.id)),
    edges: g.edges.filter(
      (edge) => allowed.has(edge.source) && allowed.has(edge.target),
    ),
  };
}
