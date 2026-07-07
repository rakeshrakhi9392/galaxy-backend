import type { z } from "zod";
import { ExtractAudioInputSchema, ExtractAudioOutputSchema } from "./nodes/extract-audio";
import { MergeVideoInputSchema, MergeVideoOutputSchema } from "./nodes/merge-video";
import { MergeAvInputSchema, MergeAvOutputSchema } from "./nodes/merge-av";
import { GptImage2InputSchema, GptImage2OutputSchema } from "./nodes/gpt-image-2";
import { KlingV3ProInputSchema, KlingV3ProOutputSchema } from "./nodes/kling-v3-pro";
import {
  OpenRouterLlmInputSchema,
  OpenRouterLlmOutputSchema,
} from "./nodes/openrouter-llm";
import { RequestInputSchema, RequestOutputSchema } from "./nodes/request";
import { ResponseInputSchema, ResponseOutputSchema } from "./nodes/response";

/** All catalog node type ids — single source for Zod enums and registry keys. */
export const CATALOG_NODE_TYPES = [
  "extract-audio",
  "merge-video",
  "merge-av",
  "gpt-image-2",
  "kling-v3-pro",
  "llm",
  "request",
  "response",
] as const;

export type CatalogNodeType = (typeof CATALOG_NODE_TYPES)[number];

/** Shared node-type → input schema map (frontend + backend). */
export const NODE_INPUT_SCHEMAS = {
  "extract-audio": ExtractAudioInputSchema,
  "merge-video": MergeVideoInputSchema,
  "merge-av": MergeAvInputSchema,
  "gpt-image-2": GptImage2InputSchema,
  "kling-v3-pro": KlingV3ProInputSchema,
  llm: OpenRouterLlmInputSchema,
  request: RequestInputSchema,
  response: ResponseInputSchema,
} as const satisfies Record<CatalogNodeType, z.ZodType>;

/** Shared node-type → output schema map (frontend + backend). */
export const NODE_OUTPUT_SCHEMAS = {
  "extract-audio": ExtractAudioOutputSchema,
  "merge-video": MergeVideoOutputSchema,
  "merge-av": MergeAvOutputSchema,
  "gpt-image-2": GptImage2OutputSchema,
  "kling-v3-pro": KlingV3ProOutputSchema,
  llm: OpenRouterLlmOutputSchema,
  request: RequestOutputSchema,
  response: ResponseOutputSchema,
} as const satisfies Record<CatalogNodeType, z.ZodType>;

export type NodeInputFor<T extends CatalogNodeType> = z.infer<(typeof NODE_INPUT_SCHEMAS)[T]>;
export type NodeOutputFor<T extends CatalogNodeType> = z.infer<(typeof NODE_OUTPUT_SCHEMAS)[T]>;

export function getNodeInputSchema<T extends CatalogNodeType>(
  nodeType: T,
): (typeof NODE_INPUT_SCHEMAS)[T];
export function getNodeInputSchema(nodeType: string): z.ZodType | undefined;
export function getNodeInputSchema(nodeType: string): z.ZodType | undefined {
  return NODE_INPUT_SCHEMAS[nodeType as CatalogNodeType];
}

export function getNodeOutputSchema<T extends CatalogNodeType>(
  nodeType: T,
): (typeof NODE_OUTPUT_SCHEMAS)[T];
export function getNodeOutputSchema(nodeType: string): z.ZodType | undefined;
export function getNodeOutputSchema(nodeType: string): z.ZodType | undefined {
  return NODE_OUTPUT_SCHEMAS[nodeType as CatalogNodeType];
}

export { parseNodeInputs } from "../lib/parseNodeInputs";
