import { z } from "zod";
import type { WorkflowNode } from "../../schemas/graph";
import {
  buildResponseResultsFromUpstream,
  resolveResponseFieldBindings,
} from "../../schemas/responseFields";
import { executeLocalNode } from "../executeShared";
import { defineNode } from "../types";

export const RESPONSE_DISPLAY_NAME = "Response";

export const ResponseInputSchema = z.object({
  result: z.array(z.unknown()).optional(),
});

export type ResponseInput = z.infer<typeof ResponseInputSchema>;

export const ResponseOutputSchema = z.object({
  /** Named outputs keyed by response field name (from edges / renames). */
  results: z.record(z.string(), z.unknown()),
});

export type ResponseOutput = z.infer<typeof ResponseOutputSchema>;

/** Single source of truth: schemas + UI + execution for response. */
export const responseNode = defineNode({
  type: "response",
  ui: {
    title: RESPONSE_DISPLAY_NAME,
    description:
      "Connect node outputs here to define what your workflow returns. These values appear as results in Playground and API responses.",
    category: "output",
    body: "response_bindings",
    handles: [{ id: "result", label: "result", kind: "input", dataType: "any" }],
    fields: [],
    defaults: {
      label: RESPONSE_DISPLAY_NAME,
      config: {},
      inputs: {},
    },
  },
  input: ResponseInputSchema,
  output: ResponseOutputSchema,
  execute: async (_responseInput, ctx) => {
    const node =
      ctx.node ??
      ({
        id: ctx.nodeId,
        type: "response",
        position: { x: 0, y: 0 },
        data: ctx.nodeData,
      } as WorkflowNode);
    const graph = ctx.graph ?? { nodes: [node], edges: [] };
    const nodesById = new Map(graph.nodes.map((item) => [item.id, item]));
    const bindings = resolveResponseFieldBindings(node.id, node.data, graph.edges, nodesById);
    const upstreamOutputs = ctx.upstreamOutputs ?? {};

    return executeLocalNode(() => ({
      results: buildResponseResultsFromUpstream(bindings, nodesById, upstreamOutputs),
    }));
  },
});
