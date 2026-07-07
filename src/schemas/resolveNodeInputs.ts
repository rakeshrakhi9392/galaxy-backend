import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./graph";
import {
  inputFieldFromHandle,
  isListMediaField,
  isMediaFieldKey,
  mergeWiredText,
  mergeWiredUrls,
  parseWiredBoolean,
  parseWiredNumber,
  valueToText,
  valueToUrlList,
} from "./connectionPolicy";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractSourceValue(
  sourceNode: WorkflowNode | undefined,
  sourceOutput: unknown,
  sourceHandle: string | null | undefined,
): unknown {
  if (!sourceHandle) return sourceOutput;

  if (sourceHandle.startsWith("field_")) {
    const data = asRecord(sourceNode?.data);
    const fields = data.dynamicFields;
    if (Array.isArray(fields)) {
      const field = fields.find(
        (item) =>
          item &&
          typeof item === "object" &&
          "id" in item &&
          (item as { id: string }).id === sourceHandle,
      ) as { value?: unknown; type?: string } | undefined;
      if (field) return field.value ?? "";
    }
    if (sourceOutput && typeof sourceOutput === "object") {
      return (sourceOutput as Record<string, unknown>)[sourceHandle] ?? "";
    }
    return "";
  }

  if (sourceHandle.startsWith("out:")) {
    const key = sourceHandle.slice(4);
    if (sourceOutput && typeof sourceOutput === "object" && !Array.isArray(sourceOutput)) {
      const record = sourceOutput as Record<string, unknown>;
      if (key in record) return record[key];
    }
    if (key === "output" && typeof sourceOutput === "string") return sourceOutput;
    if (key === "result" && Array.isArray(sourceOutput)) return sourceOutput;
    return sourceOutput;
  }

  return sourceOutput;
}

function setNestedInputValue(
  inputs: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: unknown = inputs;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] ?? "";
    const nextKey = parts[index + 1] ?? "";
    const isIndex = /^\d+$/.test(key);
    const nextIsIndex = /^\d+$/.test(nextKey);

    if (isIndex) {
      const array = current as unknown[];
      const arrayIndex = Number.parseInt(key, 10);
      const existing = array[arrayIndex];
      if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
        array[arrayIndex] = nextIsIndex ? [] : {};
      }
      current = array[arrayIndex];
      continue;
    }

    const record = asRecord(current);
    const existing = record[key];
    if (!existing || typeof existing !== "object") {
      record[key] = nextIsIndex ? [] : {};
    }
    current = record[key];
  }

  const lastPart = parts[parts.length - 1] ?? "";
  if (/^\d+$/.test(lastPart)) {
    (current as unknown[])[Number.parseInt(lastPart, 10)] = value;
    return;
  }

  asRecord(current)[lastPart] = value;
}

function getNestedInputValue(inputs: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = inputs;
  for (const part of parts) {
    if (current == null) return undefined;
    if (/^\d+$/.test(part)) {
      current = (current as unknown[])[Number.parseInt(part, 10)];
      continue;
    }
    current = asRecord(current)[part];
  }
  return current;
}

function applyWiredFieldValue(
  baseInputs: Record<string, unknown>,
  field: string,
  wiredValues: unknown[],
): void {
  if (field === "result") {
    baseInputs.result = wiredValues;
    return;
  }

  const localValue = field.includes(".")
    ? getNestedInputValue(baseInputs, field)
    : baseInputs[field];

  let next: unknown;

  if (isMediaFieldKey(field)) {
    const wiredUrls = mergeWiredUrls(wiredValues);
    if (isListMediaField(field)) {
      const localUrls = valueToUrlList(localValue);
      const seen = new Set(wiredUrls);
      const merged = [...wiredUrls];
      for (const url of localUrls) {
        if (seen.has(url)) continue;
        seen.add(url);
        merged.push(url);
      }
      next = merged;
    } else {
      next = wiredUrls[0] ?? (typeof localValue === "string" ? localValue : "");
    }
  } else if (typeof localValue === "number" || fieldLooksNumeric(field)) {
    const parsed = parseWiredNumber(mergeWiredText(wiredValues));
    next = parsed ?? localValue;
  } else if (typeof localValue === "boolean" || fieldLooksBoolean(field)) {
    const parsed = parseWiredBoolean(mergeWiredText(wiredValues));
    next = parsed ?? localValue;
  } else {
    const wiredText = mergeWiredText(wiredValues);
    next = wiredText.length > 0 ? wiredText : (localValue ?? "");
  }

  if (field.includes(".")) {
    setNestedInputValue(baseInputs, field, next);
  } else {
    baseInputs[field] = next;
  }
}

function fieldLooksNumeric(field: string): boolean {
  const leaf = field.includes(".") ? (field.split(".").pop() ?? field) : field;
  return (
    leaf === "temperature" ||
    leaf === "max_tokens" ||
    leaf === "top_p" ||
    leaf === "top_k" ||
    leaf === "seed" ||
    leaf === "n" ||
    leaf === "duration" ||
    leaf === "audio_volume" ||
    leaf.endsWith("_penalty") ||
    leaf.endsWith("_p") ||
    leaf.endsWith("_k") ||
    leaf.endsWith("_a")
  );
}

function fieldLooksBoolean(field: string): boolean {
  const leaf = field.includes(".") ? (field.split(".").pop() ?? field) : field;
  return leaf === "reasoning" || leaf === "response_format" || leaf.startsWith("enable_");
}

export function resolveNodeInputs(args: {
  node: WorkflowNode;
  graph: WorkflowGraph;
  outputsByNodeId: Record<string, unknown>;
}): Record<string, unknown> {
  const { node, graph, outputsByNodeId } = args;
  const data = asRecord(node.data);
  const baseInputs = { ...asRecord(data.inputs) };
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const valuesByField = new Map<string, unknown[]>();

  for (const edge of incoming) {
    const sourceNode = nodesById.get(edge.source);
    const sourceOutput = outputsByNodeId[edge.source];
    const field = inputFieldFromHandle(edge.targetHandle ?? null);
    if (!field) continue;

    const value = extractSourceValue(sourceNode, sourceOutput, edge.sourceHandle ?? null);
    const list = valuesByField.get(field) ?? [];
    list.push(value);
    valuesByField.set(field, list);
  }

  for (const [field, values] of valuesByField) {
    applyWiredFieldValue(baseInputs, field, values);
  }

  return baseInputs;
}

/** Topological order (sources first) for validation and pre-run output resolution. */
export function topologicalNodeOrder(graph: WorkflowGraph): WorkflowNode[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) break;
    const node = nodesById.get(nodeId);
    if (node) ordered.push(node);
    for (const nextId of adjacency.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(nextId) ?? 1) - 1;
      indegree.set(nextId, nextIndegree);
      if (nextIndegree === 0) queue.push(nextId);
    }
  }

  if (ordered.length < graph.nodes.length) {
    return graph.nodes;
  }

  return ordered;
}

/**
 * Best-effort upstream outputs available before a workflow run.
 * Seeds request field values and cached lastOutput, then walks the graph in
 * topological order so downstream wired-input validation sees upstream data.
 */
export function buildPreRunOutputsByNodeId(graph: WorkflowGraph): Record<string, unknown> {
  const outputsByNodeId: Record<string, unknown> = {};

  for (const node of topologicalNodeOrder(graph)) {
    if (node.type === "request") {
      outputsByNodeId[node.id] = buildRequestOutput(node);
      continue;
    }

    const lastOutput = asRecord(node.data).lastOutput;
    if (lastOutput !== undefined) {
      outputsByNodeId[node.id] = lastOutput;
    }
  }

  return outputsByNodeId;
}

export function buildRequestOutput(node: WorkflowNode): Record<string, unknown> {
  const data = asRecord(node.data);
  const fields = data.dynamicFields;
  const output: Record<string, unknown> = {};

  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (!field || typeof field !== "object" || !("id" in field)) continue;
      const record = field as { id: string; value?: unknown };
      output[record.id] = record.value ?? "";
    }
  }

  return output;
}

export function edgesForGraph(graph: unknown): WorkflowEdge[] {
  const parsed = graph as { edges?: WorkflowEdge[] };
  return Array.isArray(parsed?.edges) ? parsed.edges : [];
}

export { valueToText, valueToUrlList, mergeWiredText, mergeWiredUrls };

/** Count incoming edges wired to a specific input field (pre-run validation). */
export function countWiredInputsForField(
  graph: WorkflowGraph,
  nodeId: string,
  fieldKey: string,
): number {
  return graph.edges.filter(
    (edge) =>
      edge.target === nodeId &&
      inputFieldFromHandle(edge.targetHandle ?? null) === fieldKey,
  ).length;
}
