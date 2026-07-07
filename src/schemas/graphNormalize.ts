import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./graph";
import { ensureWorkflowScaffold } from "./workflowScaffold";

type DynamicField = {
  id: string;
  name: string;
  type: string;
  value: string;
};

const DEFAULT_OUTPUT_HANDLE_BY_TYPE: Record<string, string> = {
  llm: "out:output",
  "gpt-image-2": "out:result",
  "kling-v3-pro": "out:result",
  "merge-video": "out:video_url",
  "merge-av": "out:video_url",
  "extract-audio": "out:audio_url",
};

const LEGACY_SOURCE_OUTPUT_HANDLE: Record<string, Record<string, string>> = {
  llm: {
    out: "out:output",
    "out:result": "out:output",
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultRequestField(nodeId: string): DynamicField {
  return {
    id: `field_${nodeId}_default`,
    name: "Input",
    type: "text",
    value: "",
  };
}

function getRequestFields(node: WorkflowNode): DynamicField[] {
  const data = asRecord(node.data);
  return Array.isArray(data.dynamicFields) ? (data.dynamicFields as DynamicField[]) : [];
}

function migrateNodeType(type: string | undefined): string {
  if (type === "trigger") return "request";
  if (type === "output") return "response";
  return type ?? "unknown";
}

function migrateNode(node: WorkflowNode): WorkflowNode {
  const type = migrateNodeType(node.type);
  const data = { ...asRecord(node.data) };

  if (type === "request") {
    if (!Array.isArray(data.dynamicFields) || data.dynamicFields.length === 0) {
      data.dynamicFields = [defaultRequestField(node.id)];
    }
    data.label = data.label ?? "Request-Inputs";
    data.config = data.config ?? {};
    data.inputs = data.inputs ?? {};
  }

  if (type === "response") {
    data.label = data.label ?? "Response";
    data.config = data.config ?? {};
    data.inputs = data.inputs ?? {};
  }

  if (type === "llm") {
    data.label = data.label ?? "Gemini Flash Latest";
    data.config = data.config ?? {};
    const inputs = asRecord(data.inputs);
    if (typeof data.prompt === "string" && inputs.prompt === undefined) {
      inputs.prompt = data.prompt;
    }
    if (!inputs.prompt) inputs.prompt = "";
    data.inputs = inputs;
    delete data.prompt;
  }

  return { ...node, type, data };
}

function resolveSourceOutputHandle(
  sourceType: string | undefined,
  sourceHandle: string | null,
  sourceNode: WorkflowNode | undefined,
  edgeSourceId: string,
): string | null {
  if (sourceType === "request") {
    const fields = sourceNode ? getRequestFields(sourceNode) : [];
    if (sourceHandle && sourceHandle !== "out") {
      return fields.some((field) => field.id === sourceHandle)
        ? sourceHandle
        : (fields[0]?.id ?? `field_${edgeSourceId}_default`);
    }
    return fields[0]?.id ?? `field_${edgeSourceId}_default`;
  }

  if (!sourceType) return sourceHandle;

  const legacy = sourceHandle ? LEGACY_SOURCE_OUTPUT_HANDLE[sourceType]?.[sourceHandle] : undefined;
  if (legacy) return legacy;

  if (!sourceHandle || sourceHandle === "out") {
    return DEFAULT_OUTPUT_HANDLE_BY_TYPE[sourceType] ?? sourceHandle;
  }

  return sourceHandle;
}

function resolveTargetInputHandle(
  targetType: string | undefined,
  targetHandle: string | null,
): string | null {
  if (targetType === "response") {
    if (!targetHandle || targetHandle === "in") return "result";
    return targetHandle;
  }

  if (targetType === "llm") {
    if (!targetHandle || targetHandle === "in") return "in:prompt";
    return targetHandle;
  }

  if (targetHandle === "in") {
    return "in:prompt";
  }

  return targetHandle;
}

function migrateEdge(edge: WorkflowEdge, nodesById: Map<string, WorkflowNode>): WorkflowEdge {
  const targetNode = nodesById.get(edge.target);
  const sourceNode = nodesById.get(edge.source);
  const targetType = targetNode?.type;
  const sourceType = sourceNode?.type;
  const edgeData = asRecord((edge as Record<string, unknown>).data);
  const rawTargetHandle =
    edge.targetHandle ?? (typeof edgeData.targetHandle === "string" ? edgeData.targetHandle : null);

  const sourceHandle = resolveSourceOutputHandle(
    sourceType,
    edge.sourceHandle ?? null,
    sourceNode,
    edge.source,
  );
  const targetHandle = resolveTargetInputHandle(targetType, rawTargetHandle);

  return {
    ...edge,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  };
}

function syncRequestSourceHandles(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    if (!sourceNode || sourceNode.type !== "request" || !edge.sourceHandle) continue;

    const fields = getRequestFields(sourceNode);
    if (fields.length === 0) continue;

    if (!fields.some((field) => field.id === edge.sourceHandle)) {
      edge.sourceHandle = fields[0]!.id;
      continue;
    }

    const defaultFieldId = `field_${sourceNode.id}_default`;
    if (
      edge.sourceHandle === defaultFieldId &&
      !fields.some((field) => field.id === defaultFieldId) &&
      fields[0]
    ) {
      edge.sourceHandle = fields[0].id;
    }
  }

  return Array.from(nodesById.values());
}

export function normalizeWorkflowGraph(raw: unknown): WorkflowGraph {
  const parsed = asRecord(raw);
  const nodes = Array.isArray(parsed.nodes) ? (parsed.nodes as WorkflowNode[]) : [];
  const edges = Array.isArray(parsed.edges) ? (parsed.edges as WorkflowEdge[]) : [];
  const viewport = parsed.viewport;

  let migratedNodes = nodes.map(migrateNode);
  const nodesById = new Map(migratedNodes.map((node) => [node.id, node]));
  const migratedEdges = edges.map((edge) => migrateEdge(edge, nodesById));
  migratedNodes = syncRequestSourceHandles(migratedNodes, migratedEdges);

  return ensureWorkflowScaffold({
    nodes: migratedNodes,
    edges: migratedEdges,
    ...(viewport && typeof viewport === "object" ? { viewport: viewport as WorkflowGraph["viewport"] } : {}),
  });
}

export function graphFromUnknown(raw: unknown): WorkflowGraph {
  if (!raw || typeof raw !== "object") {
    return { nodes: [], edges: [] };
  }
  return normalizeWorkflowGraph(raw);
}
