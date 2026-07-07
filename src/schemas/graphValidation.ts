import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./graph";
import {
  isValidConnectionSourceHandle,
  isValidConnectionTargetHandle,
  resolveConnectionSourceDataType,
  resolveConnectionTargetDataType,
} from "./connectionHandleTypes";
import { areHandleTypesCompatible } from "./handleTypes";
import { isSingleIncomingHandle } from "./connectionPolicy";

export type GraphValidationIssue = {
  code:
    | "CYCLE_DETECTED"
    | "INVALID_EDGE"
    | "INVALID_HANDLE"
    | "DUPLICATE_INPUT"
    | "INCOMPATIBLE_TYPES";
  message: string;
  edgeId?: string;
};

export type HandleRegistryEntry = {
  type: string;
  handles: Array<{ id: string; kind: "input" | "output"; dataType?: string }>;
};

function buildAdjacency(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  excludeEdgeId?: string,
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (excludeEdgeId && e.id === excludeEdgeId) continue;
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
  }
  return adj;
}

/** Returns true when the directed graph contains a cycle (optionally including a candidate edge). */
export function hasCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  candidate?: WorkflowEdge,
): boolean {
  const adj = buildAdjacency(nodes, edges, candidate?.id);
  if (candidate && adj.has(candidate.source) && adj.has(candidate.target)) {
    adj.get(candidate.source)!.push(candidate.target);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    for (const next of adj.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    stack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

export function validateWorkflowGraphNoCycles(graph: WorkflowGraph): GraphValidationIssue[] {
  if (graph.nodes.length === 0) return [];
  if (hasCycle(graph.nodes, graph.edges)) {
    return [{ code: "CYCLE_DETECTED", message: "Connections cannot form a cycle." }];
  }
  return [];
}

function getNodeType(node: WorkflowNode): string | undefined {
  return typeof node.type === "string" ? node.type : undefined;
}

export function validateWorkflowGraph(
  graph: WorkflowGraph,
  registry: HandleRegistryEntry[],
): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n] as const));

  for (const edge of graph.edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) {
      issues.push({
        code: "INVALID_EDGE",
        message: "Edge references missing node.",
        edgeId: edge.id,
      });
      continue;
    }
    if (edge.source === edge.target) {
      issues.push({
        code: "INVALID_EDGE",
        message: "Cannot connect a node to itself.",
        edgeId: edge.id,
      });
      continue;
    }
    if (getNodeType(targetNode) === "request") {
      issues.push({
        code: "INVALID_EDGE",
        message: "Cannot connect into a request node.",
        edgeId: edge.id,
      });
      continue;
    }
    if (getNodeType(sourceNode) === "response") {
      issues.push({
        code: "INVALID_EDGE",
        message: "Cannot connect out of a response node.",
        edgeId: edge.id,
      });
      continue;
    }
    if (!isValidConnectionSourceHandle(sourceNode, edge.sourceHandle ?? null, registry)) {
      issues.push({
        code: "INVALID_HANDLE",
        message: "Invalid source handle.",
        edgeId: edge.id,
      });
      continue;
    }
    if (!isValidConnectionTargetHandle(targetNode, edge.targetHandle ?? null, registry)) {
      issues.push({
        code: "INVALID_HANDLE",
        message: "Invalid target handle.",
        edgeId: edge.id,
      });
      continue;
    }

    const sourceDataType = resolveConnectionSourceDataType(
      sourceNode,
      edge.sourceHandle ?? null,
      registry,
    );
    const targetDataType = resolveConnectionTargetDataType(
      targetNode,
      edge.targetHandle ?? null,
      registry,
    );

    if (
      sourceDataType &&
      targetDataType &&
      !areHandleTypesCompatible(sourceDataType, targetDataType)
    ) {
      issues.push({
        code: "INCOMPATIBLE_TYPES",
        message: `Incompatible connection: ${sourceDataType} cannot connect to ${targetDataType}.`,
        edgeId: edge.id,
      });
    }
  }

  const cycleIssues = validateWorkflowGraphNoCycles(graph);
  issues.push(...cycleIssues);

  const targetHandleCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    const targetNode = nodesById.get(edge.target);
    if (!targetNode || getNodeType(targetNode) === "response") continue;
    const handle = edge.targetHandle ?? "";
    const targetDataType = resolveConnectionTargetDataType(
      targetNode,
      handle,
      registry,
    );
    if (!isSingleIncomingHandle(handle, targetDataType)) continue;
    const handleKey = `${edge.target}:${handle}`;
    targetHandleCounts.set(handleKey, (targetHandleCounts.get(handleKey) ?? 0) + 1);
    if ((targetHandleCounts.get(handleKey) ?? 0) > 1) {
      issues.push({
        code: "DUPLICATE_INPUT",
        message: "That input already has a connection.",
        edgeId: edge.id,
      });
    }
  }

  return issues;
}
