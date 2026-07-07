import { describe, expect, it } from "vitest";
import { getNodeDefinition } from "@/nodes/registry";
import { parseNodeInputs } from "./parseNodeInputs";

describe("parseNodeInputs", () => {
  it("validates llm inputs centrally with wired coercions", () => {
    const def = getNodeDefinition("llm");
    const parsed = parseNodeInputs(def, {
      temperature: "0.5",
      max_tokens: "2048",
      reasoning: "true",
    }) as { temperature: number; max_tokens: number; reasoning: boolean };

    expect(parsed.temperature).toBe(0.5);
    expect(parsed.max_tokens).toBe(2048);
    expect(parsed.reasoning).toBe(true);
  });

  it("applies kling prepareInputs before schema validation", () => {
    const def = getNodeDefinition("kling-v3-pro");
    const parsed = parseNodeInputs(def, {
      image: "https://example.com/start.png",
      prompt: "test",
    }) as { start_image_url?: string };

    expect(parsed.start_image_url).toBe("https://example.com/start.png");
  });

  it("rejects invalid merge-av inputs", () => {
    const def = getNodeDefinition("merge-av");
    expect(() =>
      parseNodeInputs(def, {
        video_url: "not-a-url",
        audio_url: "https://example.com/a.mp3",
      }),
    ).toThrow();
  });
});
