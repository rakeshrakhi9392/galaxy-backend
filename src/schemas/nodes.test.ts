import { describe, expect, it } from "vitest";
import { GptImage2InputSchema, estimateGptImage2Credits } from "./nodes/gpt-image-2";
import { OpenRouterLlmInputSchema } from "./nodes/openrouter-llm";
import { KlingV3ProInputSchema, isKlingV3ProElementHandle } from "./nodes/kling-v3-pro";
import { MergeVideoInputSchema } from "./nodes/merge-video";
import { MergeAvInputSchema } from "./nodes/merge-av";
import { ExtractAudioInputSchema } from "./nodes/extract-audio";
import {
  DynamicFieldSchema,
  RequestDynamicFieldsSchema,
  RequestInputSchema,
  RequestOutputSchema,
  validateRequestNodeData,
} from "./nodes/request";
import { ResponseInputSchema, ResponseOutputSchema } from "./nodes/response";

describe("node schemas", () => {
  it("parses gpt-image-2 defaults", () => {
    const parsed = GptImage2InputSchema.parse({});
    expect(parsed.mode).toBe("text_to_image");
    expect(estimateGptImage2Credits(parsed)).toBeGreaterThan(0);
  });

  it("parses openrouter llm defaults", () => {
    const parsed = OpenRouterLlmInputSchema.parse({});
    expect(parsed.max_tokens).toBe(1024);
  });

  it("parses kling v3 pro defaults", () => {
    const parsed = KlingV3ProInputSchema.parse({});
    expect(parsed.duration).toBe(5);
    expect(isKlingV3ProElementHandle("in:elements.0.frontal_image_url")).toBe(true);
    expect(isKlingV3ProElementHandle("in:elements.0.reference_image_urls")).toBe(true);
    expect(isKlingV3ProElementHandle("in:elements.0.video_url")).toBe(true);
  });

  it("parses merge video input", () => {
    const parsed = MergeVideoInputSchema.parse({ video_urls: [] });
    expect(parsed.transition).toBe("none");
  });

  it("parses merge av input", () => {
    const parsed = MergeAvInputSchema.parse({
      video_url: "https://example.com/v.mp4",
      audio_url: "https://example.com/a.mp3",
    });
    expect(parsed.audio_volume).toBe(1);
  });

  it("parses extract audio input", () => {
    const parsed = ExtractAudioInputSchema.parse({
      video_url: "https://example.com/v.mp4",
    });
    expect(parsed.format).toBe("mp3");
  });

  it("parses request input/output and dynamic fields", () => {
    expect(RequestInputSchema.parse({})).toEqual({});
    expect(RequestOutputSchema.parse({ field_1: "hello" })).toEqual({ field_1: "hello" });
    const field = DynamicFieldSchema.parse({
      id: "field_1",
      name: "Input",
      type: "text",
      value: "",
    });
    expect(field.id).toBe("field_1");
    expect(
      RequestDynamicFieldsSchema.parse([
        { id: "field_1", name: "Input", type: "text", value: "" },
      ]),
    ).toHaveLength(1);
    expect(
      validateRequestNodeData({
        dynamicFields: [{ id: "field_1", name: "Input", type: "text", value: "hi" }],
      }),
    ).toHaveLength(1);
  });

  it("parses response input/output", () => {
    expect(ResponseInputSchema.parse({})).toEqual({});
    expect(ResponseOutputSchema.parse({ results: { out: "ok" } })).toEqual({
      results: { out: "ok" },
    });
  });
});
