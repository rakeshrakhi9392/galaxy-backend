import { randomUUID } from "node:crypto";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@galaxy/schemas";
import { validateWorkflowGraph } from "@galaxy/schemas";
import { getNodeDefinition, listNodeDefinitions } from "@/nodes/registry";
import { McpToolError } from "@/mcp/errors";
import {
  createScaffoldGraph,
  isScaffoldNode,
  type RequestFieldInput,
} from "@/schemas/workflowScaffold";

export type { RequestFieldInput };

const COLUMN_WIDTH = 420;
const ROW_HEIGHT = 220;

function nodeHandleRegistry() {
  return listNodeDefinitions().map((def) => ({
    type: def.type,
    handles: def.ui.handles.map((handle) => ({
      id: handle.id,
      kind: handle.kind,
      dataType: handle.dataType,
    })),
  }));
}

function assertValidGraph(graph: WorkflowGraph): void {
  const issues = validateWorkflowGraph(graph, nodeHandleRegistry());
  if (issues.length > 0) {
    throw new McpToolError("INVALID_GRAPH", issues[0]!.message);
  }
}

function saveGraph(graph: WorkflowGraph): WorkflowGraph {
  assertValidGraph(graph);
  return graph;
}

function createRequestField(name: string, type: RequestFieldInput["type"], value = "") {
  const id = `field_${randomUUID().slice(0, 8)}`;
  return { id, name, type, value };
}

export { createScaffoldGraph };

export function graphFromStored(value: unknown): WorkflowGraph {
  if (!value || typeof value !== "object") {
    throw new McpToolError("INVALID_GRAPH", "Workflow graph is missing or invalid.");
  }
  const record = value as WorkflowGraph;
  return {
    nodes: Array.isArray(record.nodes) ? [...record.nodes] : [],
    edges: Array.isArray(record.edges) ? [...record.edges] : [],
    ...(record.viewport ? { viewport: record.viewport } : {}),
  };
}

function findNode(graph: WorkflowGraph, nodeId: string): WorkflowNode {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new McpToolError("NOT_FOUND", `Node not found: ${nodeId}`);
  }
  return node;
}

function formatPorts(node: WorkflowNode) {
  const def = getNodeDefinition(node.type);
  const inputs = def.ui.handles
    .filter((handle) => handle.kind === "input")
    .map((handle) => handle.id);
  const outputs = def.ui.handles
    .filter((handle) => handle.kind === "output")
    .map((handle) => handle.id);

  if (node.type === "request") {
    const fields =
      (node.data as { dynamicFields?: Array<{ id: string; name: string; type: string }> })
        ?.dynamicFields ?? [];
    return {
      inputs: [],
      outputs: fields.map((field) => field.id),
      requestFields: fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
      })),
    };
  }

  return { inputs, outputs, requestFields: [] as Array<{ id: string; name: string; type: string }> };
}

export function addNodeToGraph(
  graph: WorkflowGraph,
  nodeType: string,
  options?: {
    column?: number;
    row?: number;
    inputs?: Record<string, unknown>;
    label?: string;
  },
): { graph: WorkflowGraph; node: WorkflowNode; ports: ReturnType<typeof formatPorts> } {
  let def;
  try {
    def = getNodeDefinition(nodeType);
  } catch {
    throw new McpToolError("BAD_REQUEST", `Unknown node type: ${nodeType}`);
  }

  const column = options?.column ?? 1;
  const row = options?.row ?? 0;
  const nodeId = `node_${randomUUID().slice(0, 8)}`;
  const position = { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT };

  if (nodeType === "request") {
    const node: WorkflowNode = {
      id: nodeId,
      type: "request",
      position,
      data: {
        label: options?.label ?? def.ui.title,
        config: {},
        inputs: {},
        dynamicFields: [createRequestField("Input", "text", "")],
      },
    };
    const nextGraph: WorkflowGraph = {
      ...graph,
      nodes: [...graph.nodes, node],
    };
    return {
      graph: saveGraph(nextGraph),
      node,
      ports: formatPorts(node),
    };
  }

  if (nodeType === "response") {
    const node: WorkflowNode = {
      id: nodeId,
      type: "response",
      position,
      data: {
        label: options?.label ?? def.ui.title,
        config: {},
        inputs: {},
      },
    };
    const nextGraph: WorkflowGraph = {
      ...graph,
      nodes: [...graph.nodes, node],
    };
    return {
      graph: saveGraph(nextGraph),
      node,
      ports: formatPorts(node),
    };
  }

  const node: WorkflowNode = {
    id: nodeId,
    type: nodeType,
    position: { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
    data: {
      label: options?.label ?? def.ui.title,
      config: def.ui.defaults?.config ?? {},
      inputs: { ...(def.ui.defaults?.inputs as Record<string, unknown> | undefined), ...(options?.inputs ?? {}) },
    },
  };

  const nextGraph: WorkflowGraph = {
    ...graph,
    nodes: [...graph.nodes, node],
  };

  return {
    graph: saveGraph(nextGraph),
    node,
    ports: formatPorts(node),
  };
}

export function updateNodeInGraph(
  graph: WorkflowGraph,
  nodeId: string,
  inputs: Record<string, unknown>,
): { graph: WorkflowGraph; node: WorkflowNode } {
  const node = findNode(graph, nodeId);
  if (node.type === "request" || node.type === "response") {
    throw new McpToolError("BAD_REQUEST", "Use dedicated workflow tools for request/response nodes.");
  }

  const data = (node.data ?? {}) as Record<string, unknown>;
  const existingInputs =
    data.inputs && typeof data.inputs === "object" && !Array.isArray(data.inputs)
      ? (data.inputs as Record<string, unknown>)
      : {};

  const updatedNode: WorkflowNode = {
    ...node,
    data: {
      ...data,
      inputs: { ...existingInputs, ...inputs },
    },
  };

  const nextGraph: WorkflowGraph = {
    ...graph,
    nodes: graph.nodes.map((item) => (item.id === nodeId ? updatedNode : item)),
  };

  return { graph: saveGraph(nextGraph), node: updatedNode };
}

export function connectNodesInGraph(
  graph: WorkflowGraph,
  sourceNodeId: string,
  sourceHandle: string,
  targetNodeId: string,
  targetHandle: string,
): { graph: WorkflowGraph; edge: WorkflowEdge } {
  findNode(graph, sourceNodeId);
  findNode(graph, targetNodeId);

  const edge: WorkflowEdge = {
    id: `edge_${randomUUID().slice(0, 8)}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle,
    targetHandle,
  };

  const nextGraph: WorkflowGraph = {
    ...graph,
    edges: [...graph.edges, edge],
  };

  return { graph: saveGraph(nextGraph), edge };
}

export function disconnectNodesInGraph(
  graph: WorkflowGraph,
  options: { edgeId?: string; sourceNodeId?: string; targetNodeId?: string },
): WorkflowGraph {
  let edges = graph.edges;

  if (options.edgeId) {
    const exists = edges.some((edge) => edge.id === options.edgeId);
    if (!exists) {
      throw new McpToolError("NOT_FOUND", `Edge not found: ${options.edgeId}`);
    }
    edges = edges.filter((edge) => edge.id !== options.edgeId);
  } else if (options.sourceNodeId && options.targetNodeId) {
    const match = edges.find(
      (edge) => edge.source === options.sourceNodeId && edge.target === options.targetNodeId,
    );
    if (!match) {
      throw new McpToolError(
        "NOT_FOUND",
        `No edge from ${options.sourceNodeId} to ${options.targetNodeId}`,
      );
    }
    edges = edges.filter((edge) => edge.id !== match.id);
  } else {
    throw new McpToolError("BAD_REQUEST", "Provide edgeId or sourceNodeId + targetNodeId.");
  }

  return saveGraph({ ...graph, edges });
}

export function deleteNodeFromGraph(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  const node = findNode(graph, nodeId);
  if (isScaffoldNode(node)) {
    throw new McpToolError("BAD_REQUEST", "Cannot delete scaffold request/response nodes.");
  }

  const nextGraph: WorkflowGraph = {
    nodes: graph.nodes.filter((item) => item.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    ...(graph.viewport ? { viewport: graph.viewport } : {}),
  };

  return saveGraph(nextGraph);
}

export function applyRequestValuesToGraph(
  graph: WorkflowGraph,
  values: Record<string, unknown>,
): WorkflowGraph {
  const requestNode = graph.nodes.find((node) => node.type === "request");
  if (!requestNode) {
    throw new McpToolError("BAD_REQUEST", "Workflow has no request node.");
  }

  const data = (requestNode.data ?? {}) as {
    dynamicFields?: Array<{ id: string; name: string; type: string; value: string }>;
  };
  const fields = data.dynamicFields ?? [];
  if (fields.length === 0) {
    throw new McpToolError("BAD_REQUEST", "Request node has no input fields.");
  }

  const updatedFields = fields.map((field) => {
    const byId = values[field.id];
    const byName = values[field.name];
    const raw = byId !== undefined ? byId : byName;
    if (raw === undefined) return field;
    return { ...field, value: String(raw) };
  });

  const updatedNode: WorkflowNode = {
    ...requestNode,
    data: { ...data, dynamicFields: updatedFields },
  };

  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === requestNode.id ? updatedNode : node)),
  };
}

export function listNodeTypesForMcp(category?: string) {
  return listNodeDefinitions()
    .filter((def) => !category || def.ui.category === category)
    .map((def) => ({
      type: def.type,
      title: def.ui.title,
      description: def.ui.description ?? null,
      category: def.ui.category ?? null,
      inputs: def.ui.handles.filter((handle) => handle.kind === "input").map((handle) => handle.id),
      outputs: def.ui.handles.filter((handle) => handle.kind === "output").map((handle) => handle.id),
      pricing: def.ui.pricing ?? null,
    }));
}

export function describeNodePorts(node: WorkflowNode) {
  return formatPorts(node);
}
