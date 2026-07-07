export type ResponseFieldSourceNode = {
  id?: string;
  type?: string | null;
  data?: unknown;
};

export type ResponseFieldEdge = {
  id: string;
  source: string;
  target?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Normalize a display label into a stable response field key. */
export function toResponseFieldKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "output";
}

export function isResponseResultEdge(edge: ResponseFieldEdge, responseNodeId: string): boolean {
  if (edge.target !== responseNodeId) return false;
  return (edge.targetHandle ?? "result") === "result";
}

export function defaultResponseFieldName(
  sourceNode: ResponseFieldSourceNode | undefined,
  sourceHandle: string | null | undefined,
): string {
  const data = asRecord(sourceNode?.data);

  if (sourceNode?.type === "request" && sourceHandle) {
    const fields = data.dynamicFields;
    if (Array.isArray(fields)) {
      const field = fields.find(
        (item) =>
          item &&
          typeof item === "object" &&
          "id" in item &&
          (item as { id: string }).id === sourceHandle,
      ) as { name?: unknown } | undefined;
      if (typeof field?.name === "string" && field.name.trim()) {
        return toResponseFieldKey(field.name);
      }
    }
    return toResponseFieldKey(sourceHandle);
  }

  if (typeof data.label === "string" && data.label.trim()) {
    return toResponseFieldKey(data.label);
  }

  return toResponseFieldKey(sourceNode?.type ?? "output");
}

function ensureUniqueName(name: string, used: Map<string, number>): string {
  const count = (used.get(name) ?? 0) + 1;
  used.set(name, count);
  if (count === 1) return name;
  const unique = `${name}_${count}`;
  used.set(unique, (used.get(unique) ?? 0) + 1);
  return unique;
}

export function readResponseFieldNameOverrides(nodeData: unknown): Record<string, string> {
  const data = asRecord(nodeData);
  const config = asRecord(data.config);
  const fieldNames = config.fieldNames;
  if (!fieldNames || typeof fieldNames !== "object" || Array.isArray(fieldNames)) {
    return {};
  }

  const overrides: Record<string, string> = {};
  for (const [edgeId, value] of Object.entries(fieldNames)) {
    if (typeof value === "string" && value.trim()) {
      overrides[edgeId] = value.trim();
    }
  }
  return overrides;
}

export type ResponseFieldBinding = {
  edgeId: string;
  sourceNodeId: string;
  sourceHandle: string | null;
  name: string;
};

/**
 * One binding per incoming edge on the Response `result` handle.
 * Names come from overrides (rename) or the source node/field, with uniqueness.
 */
export function resolveResponseFieldBindings(
  responseNodeId: string,
  responseNodeData: unknown,
  edges: ResponseFieldEdge[],
  nodesById: Map<string, ResponseFieldSourceNode>,
): ResponseFieldBinding[] {
  const overrides = readResponseFieldNameOverrides(responseNodeData);
  const incoming = edges.filter((edge) => isResponseResultEdge(edge, responseNodeId));
  const used = new Map<string, number>();

  return incoming.map((edge) => {
    const override = overrides[edge.id];
    const base =
      override ??
      defaultResponseFieldName(nodesById.get(edge.source), edge.sourceHandle ?? null);
    const name = ensureUniqueName(base, used);
    return {
      edgeId: edge.id,
      sourceNodeId: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      name,
    };
  });
}

/** Build the named results object returned by the Response node. */
export function buildResponseResults(
  bindings: ResponseFieldBinding[],
  values: unknown[],
): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (!binding) continue;
    results[binding.name] = values[index];
  }
  return results;
}

function extractBindingSourceValue(
  sourceNode: ResponseFieldSourceNode | undefined,
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
      ) as { value?: unknown } | undefined;
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

/**
 * Build response results from bindings and per-source upstream outputs.
 * Omits bindings whose source did not succeed (partial multi-path runs).
 */
export function buildResponseResultsFromUpstream(
  bindings: ResponseFieldBinding[],
  nodesById: Map<string, ResponseFieldSourceNode>,
  upstreamOutputs: Record<string, unknown>,
): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  for (const binding of bindings) {
    if (!(binding.sourceNodeId in upstreamOutputs)) continue;
    const sourceOutput = upstreamOutputs[binding.sourceNodeId];
    results[binding.name] = extractBindingSourceValue(
      nodesById.get(binding.sourceNodeId),
      sourceOutput,
      binding.sourceHandle,
    );
  }
  return results;
}
