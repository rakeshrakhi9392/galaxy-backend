import { z } from "zod";
import type { WorkflowNode } from "../../schemas/graph";
import { executeLocalNode } from "../executeShared";
import { defineNode } from "../types";

export const REQUEST_DISPLAY_NAME = "Request-Inputs";

export const DynamicFieldTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "image",
  "audio",
  "video",
  "media",
  "file",
]);

export type DynamicFieldType = z.infer<typeof DynamicFieldTypeSchema>;

export const DynamicFieldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: DynamicFieldTypeSchema,
  value: z.string(),
});

export type DynamicField = z.infer<typeof DynamicFieldSchema>;

/** Request node dynamic field list (stored on node.data, validated pre-run and at execute). */
export const RequestDynamicFieldsSchema = z.array(DynamicFieldSchema).min(1);

/** Request nodes have no static wired inputs; dynamic fields live on node.data. */
export const RequestInputSchema = z.object({});

export type RequestInput = z.infer<typeof RequestInputSchema>;

/** Output is a map of field id → value produced at run time. */
export const RequestOutputSchema = z.record(z.string(), z.unknown());

export type RequestOutput = z.infer<typeof RequestOutputSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Validate request node.data.dynamicFields (throws ZodError on failure). */
export function validateRequestNodeData(nodeData: unknown): DynamicField[] {
  return RequestDynamicFieldsSchema.parse(asRecord(nodeData).dynamicFields);
}

/** Single source of truth: schemas + UI + execution for request. */
export const requestNode = defineNode({
  type: "request",
  ui: {
    title: REQUEST_DISPLAY_NAME,
    description:
      "Define the input fields for your workflow. These become the request parameters when running via Playground or API.",
    category: "input",
    body: "dynamic_fields",
    handles: [],
    fields: [],
    defaults: {
      label: REQUEST_DISPLAY_NAME,
      config: {},
      inputs: {},
      dynamicFields: [{ id: "field_default", name: "Input", type: "text", value: "" }],
    },
  },
  input: RequestInputSchema,
  output: RequestOutputSchema,
  execute: async (_resolvedInputs, ctx) => {
    const node =
      ctx.node ??
      ({
        id: ctx.nodeId,
        type: "request",
        position: { x: 0, y: 0 },
        data: ctx.nodeData,
      } as WorkflowNode);

    const { buildRequestOutput } = await import("@galaxy/schemas");

    return executeLocalNode(() => buildRequestOutput(node));
  },
});
