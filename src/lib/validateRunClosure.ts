import type { WorkflowGraph, WorkflowNode } from "@galaxy/schemas";
import {
  buildPreRunOutputsByNodeId,
  inputFieldFromHandle,
  resolveNodeInputs,
} from "@galaxy/schemas";
import { nodeRegistry } from "@/nodes/registry";
import { resolveFieldLabel } from "@/nodes/fieldMeta";
import type { NodeUiField } from "@/nodes/types";
import {
  buildExecutionSubgraph,
  resolveExecutionNodeIds,
} from "@/trigger/graph";

export type RunClosureValidationResult =
  | { ok: true; nodeIds: string[] }
  | { ok: false; message: string };

/**
 * Resolve configured inputs for a node.
 * Canonical shape is `data.inputs`; top-level keys are accepted for legacy/test graphs.
 */
function nodeInputsRecord(node: WorkflowNode): Record<string, unknown> {
  const data =
    node.data && typeof node.data === "object" && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : {};
  const nested =
    data.inputs && typeof data.inputs === "object" && !Array.isArray(data.inputs)
      ? (data.inputs as Record<string, unknown>)
      : {};
  return { ...data, ...nested };
}

function hasConfiguredValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasConfiguredValue(item));
  return true;
}

function isImageDataType(dataType: string | undefined): boolean {
  return dataType === "image" || dataType === "image_list";
}

/**
 * Mode-aware required checks. Image inputs are only required for modes that
 * consume pixels; text/media required flags are honored as declared.
 */
function fieldRequiredForNode(node: WorkflowNode, field: NodeUiField): boolean {
  if (!field.required) return false;

  if (!isImageDataType(field.dataType)) return true;

  const mode = String(nodeInputsRecord(node).mode ?? "");

  if (node.type === "gpt-image-2" && field.key === "image") {
    return mode === "image_to_image" || mode === "edit" || mode === "inpaint";
  }

  if (node.type === "kling-v3-pro" && field.key === "start_image_url") {
    return mode === "image_to_video" || mode === "start_end";
  }

  return true;
}

function edgeTargetsField(
  targetHandle: string | null | undefined,
  field: NodeUiField,
): boolean {
  if (!field.handleId) return false;
  if (targetHandle === field.handleId) return true;
  return inputFieldFromHandle(targetHandle) === field.key;
}

function fieldSatisfiedInClosure(
  node: WorkflowNode,
  field: NodeUiField,
  incomingByTarget: Map<string, Array<{ targetHandle: string | null | undefined }>>,
  subgraph: WorkflowGraph,
  preRunOutputs: Record<string, unknown>,
): boolean {
  const inputs = nodeInputsRecord(node);
  if (hasConfiguredValue(inputs[field.key])) return true;

  const incoming = incomingByTarget.get(node.id) ?? [];
  if (incoming.some((edge) => edgeTargetsField(edge.targetHandle, field))) return true;

  const resolved = resolveNodeInputs({
    node,
    graph: subgraph,
    outputsByNodeId: preRunOutputs,
  });
  return hasConfiguredValue(resolved[field.key]);
}

/**
 * Validate required inputs against the same execution closure that will run.
 * Nodes outside the set are ignored.
 */
export function validateRunClosureInputs(
  graph: unknown,
  targetNodeIds: readonly string[],
): RunClosureValidationResult {
  const nodeIds = [...resolveExecutionNodeIds(graph, targetNodeIds)];
  if (nodeIds.length === 0) {
    return {
      ok: false,
      message:
        targetNodeIds.length === 0
          ? "No nodes to execute. Full runs start from Request Inputs and follow connections downstream."
          : "No nodes to execute for the given selection.",
    };
  }

  const subgraph = buildExecutionSubgraph(graph, targetNodeIds);
  const preRunOutputs = buildPreRunOutputsByNodeId(subgraph);
  const incomingByTarget = new Map<
    string,
    Array<{ targetHandle: string | null | undefined }>
  >();

  for (const edge of subgraph.edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push({ targetHandle: edge.targetHandle });
    incomingByTarget.set(edge.target, list);
  }

  for (const node of subgraph.nodes) {
    const def = nodeRegistry[node.type ?? ""];
    if (!def) continue;

    for (const field of def.ui.fields) {
      if (!fieldRequiredForNode(node, field)) continue;
      if (fieldSatisfiedInClosure(node, field, incomingByTarget, subgraph, preRunOutputs)) {
        continue;
      }

      return {
        ok: false,
        message: `${def.ui.title}: ${resolveFieldLabel(field, nodeInputsRecord(node))} is required for this run (missing value and no connection inside the run set).`,
      };
    }
  }

  return { ok: true, nodeIds };
}
