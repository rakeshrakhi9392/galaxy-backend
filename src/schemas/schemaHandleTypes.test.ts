import { describe, expect, it } from "vitest";
import { catalogNodes } from "../nodes/catalog";
import {
  inferHandleDataTypeFromSchemaField,
  validateNodeDefinitionHandleTypes,
} from "./schemaHandleTypes";
import { MergeAvInputSchema } from "./nodes/merge-av";
import { OpenRouterLlmInputSchemaObject } from "./nodes/openrouter-llm";
import { ResponseInputSchema } from "./nodes/response";

describe("schemaHandleTypes", () => {
  it("infers media url fields from schema keys", () => {
    const shape = (MergeAvInputSchema as { def: { shape: Record<string, unknown> } }).def.shape;
    expect(inferHandleDataTypeFromSchemaField("video_url", shape.video_url as never)).toBe("video");
    expect(inferHandleDataTypeFromSchemaField("audio_url", shape.audio_url as never)).toBe("audio");
  });

  it("infers list and scalar types from llm schema", () => {
    const shape = OpenRouterLlmInputSchemaObject.def.shape;
    expect(inferHandleDataTypeFromSchemaField("prompt", shape.prompt)).toBe("text");
    expect(inferHandleDataTypeFromSchemaField("image_urls", shape.image_urls)).toBe("image_list");
    expect(inferHandleDataTypeFromSchemaField("temperature", shape.temperature)).toBe("number");
  });

  it("infers response result as any", () => {
    const shape = (ResponseInputSchema as { def: { shape: Record<string, unknown> } }).def.shape;
    expect(inferHandleDataTypeFromSchemaField("result", shape.result as never)).toBe("any");
  });

  it("keeps catalog UI handle types aligned with zod schemas", () => {
    const errors = catalogNodes.flatMap((node) => validateNodeDefinitionHandleTypes(node));
    expect(errors).toEqual([]);
  });
});
