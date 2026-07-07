import type { WorkflowNode } from "./graph";
import type { HandleRegistryEntry } from "./graphValidation";
import { isKlingV3ProElementHandle, klingV3ProElementHandleDataType } from "./nodes/kling-v3-pro";
import { resolveHandleDataType, type HandleDataType, type TypedHandle } from "./handleTypes";

export function buildHandleRegistryFromUi(
  entries: Array<{ type: string; handles: TypedHandle[] }>,
): HandleRegistryEntry[] {
  return entries.map((entry) => ({
    type: entry.type,
    handles: entry.handles.map((handle) => ({
      id: handle.id,
      kind: handle.kind,
      dataType: handle.dataType,
    })),
  }));
}

export function requestFieldHandleDataType(fieldType: string | undefined): HandleDataType {
  switch (fieldType) {
    case "text":
      return "text";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      return "any";
  }
}

function readRequestFieldType(
  node: WorkflowNode,
  sourceHandle: string | null | undefined,
): HandleDataType {
  if (!sourceHandle) return "any";
  const fields = (node.data as { dynamicFields?: Array<{ id: string; type: string }> } | undefined)
    ?.dynamicFields;
  const field = Array.isArray(fields) ? fields.find((item) => item.id === sourceHandle) : undefined;
  return requestFieldHandleDataType(field?.type);
}

function normalizeSourceHandleId(
  nodeType: string | undefined,
  sourceHandle: string | null | undefined,
): string | null | undefined {
  if (nodeType === "llm" && (sourceHandle === "out" || sourceHandle === "out:result")) {
    return "out:output";
  }
  return sourceHandle;
}

export function resolveConnectionSourceDataType(
  sourceNode: WorkflowNode,
  sourceHandle: string | null | undefined,
  registry: HandleRegistryEntry[],
): HandleDataType {
  const nodeType = typeof sourceNode.type === "string" ? sourceNode.type : undefined;
  if (nodeType === "request") {
    return readRequestFieldType(sourceNode, sourceHandle);
  }

  const normalizedHandle = normalizeSourceHandleId(nodeType, sourceHandle);
  return (
    resolveHandleDataType(
      registry as Array<{ type: string; handles: TypedHandle[] }>,
      nodeType,
      normalizedHandle,
      "output",
    ) ?? "any"
  );
}

export function resolveConnectionTargetDataType(
  targetNode: WorkflowNode,
  targetHandle: string | null | undefined,
  registry: HandleRegistryEntry[],
): HandleDataType {
  const nodeType = typeof targetNode.type === "string" ? targetNode.type : undefined;
  if (nodeType === "response") return "any";
  if (nodeType === "kling-v3-pro" && targetHandle) {
    const dynamicType = klingV3ProElementHandleDataType(targetHandle);
    if (dynamicType) return dynamicType;
  }

  return (
    resolveHandleDataType(
      registry as Array<{ type: string; handles: TypedHandle[] }>,
      nodeType,
      targetHandle,
      "input",
    ) ?? "any"
  );
}

export function isValidConnectionSourceHandle(
  sourceNode: WorkflowNode,
  sourceHandle: string | null | undefined,
  registry: HandleRegistryEntry[],
): boolean {
  const nodeType = typeof sourceNode.type === "string" ? sourceNode.type : undefined;
  if (nodeType === "request") {
    if (!sourceHandle) return false;
    const fields = (sourceNode.data as { dynamicFields?: Array<{ id: string }> } | undefined)
      ?.dynamicFields;
    return Array.isArray(fields) && fields.some((field) => field.id === sourceHandle);
  }

  const normalizedHandle = normalizeSourceHandleId(nodeType, sourceHandle);
  if (!normalizedHandle) return false;
  const entry = registry.find((item) => item.type === nodeType);
  return (
    entry?.handles.some((handle) => handle.kind === "output" && handle.id === normalizedHandle) ??
    false
  );
}

export function isValidConnectionTargetHandle(
  targetNode: WorkflowNode,
  targetHandle: string | null | undefined,
  registry: HandleRegistryEntry[],
): boolean {
  const nodeType = typeof targetNode.type === "string" ? targetNode.type : undefined;
  if (nodeType === "response") {
    return (targetHandle ?? "result") === "result";
  }

  const entry = registry.find((item) => item.type === nodeType);
  if (!entry || !targetHandle) return false;
  if (nodeType === "kling-v3-pro" && isKlingV3ProElementHandle(targetHandle)) {
    return true;
  }
  return entry.handles.some((handle) => handle.kind === "input" && handle.id === targetHandle);
}
