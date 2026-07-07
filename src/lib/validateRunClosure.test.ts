import { describe, expect, it } from "vitest";
import { validateRunClosureInputs } from "./validateRunClosure";

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(source: string, target: string, targetHandle?: string) {
  return {
    id: `${source}-${target}-${targetHandle ?? "default"}`,
    source,
    target,
    targetHandle,
  };
}

describe("validateRunClosureInputs", () => {
  it("rejects full runs with no Request Inputs", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [node("a", "llm")],
        edges: [],
      },
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Request Inputs/i);
    }
  });

  it("allows text-to-image without an image input", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("img", "gpt-image-2", { mode: "text_to_image", prompt: "hi" }),
        ],
        edges: [edge("req", "img", "in:prompt")],
      },
      [],
    );
    expect(result.ok).toBe(true);
  });

  it("requires image input for image modes when not wired in the closure", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("img", "gpt-image-2", { mode: "image_to_image", prompt: "hi" }),
        ],
        edges: [edge("req", "img", "in:prompt")],
      },
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Input Images is required/i);
    }
  });

  it("ignores image nodes outside the single-node upstream closure", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("llm", "llm", { prompt: "hi" }),
          node("img", "gpt-image-2", { mode: "image_to_image", prompt: "hi" }),
        ],
        edges: [edge("req", "llm", "in:prompt")],
      },
      ["llm"],
    );
    expect(result.ok).toBe(true);
  });

  it("requires Description for kling image-to-video when prompt is empty", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("img", "gpt-image-2", {
            inputs: { mode: "text_to_image", prompt: "a painting" },
          }),
          node("kling", "kling-v3-pro", {
            inputs: {
              mode: "image_to_video",
              prompt: "",
              start_image_url: "",
            },
          }),
        ],
        edges: [
          edge("req", "img", "in:prompt"),
          edge("img", "kling", "in:start_image_url"),
        ],
      },
      ["kling"],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Description is required/i);
    }
  });

  it("reads required fields from data.inputs (canonical node shape)", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("kling", "kling-v3-pro", {
            inputs: {
              mode: "image_to_video",
              prompt: "camera slowly pans",
              start_image_url: "https://example.com/start.png",
            },
          }),
        ],
        edges: [edge("req", "kling", "in:prompt")],
      },
      ["kling"],
    );
    expect(result.ok).toBe(true);
  });

  it("rejects empty prompt for kling text-to-video", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request"),
          node("kling", "kling-v3-pro", {
            inputs: { mode: "text_to_video", prompt: "   " },
          }),
        ],
        edges: [edge("req", "kling", "in:mode")],
      },
      ["kling"],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Description is required|Prompt is required/i);
    }
  });

  it("accepts prompt wired from request for gpt-image-2", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request", {
            dynamicFields: [{ id: "field_prompt", name: "prompt", type: "text", value: "a red car" }],
          }),
          node("img", "gpt-image-2", {
            inputs: { mode: "text_to_image", prompt: "" },
          }),
        ],
        edges: [
          {
            id: "e1",
            source: "req",
            target: "img",
            sourceHandle: "field_prompt",
            targetHandle: "in:prompt",
          },
        ],
      },
      ["img"],
    );
    expect(result.ok).toBe(true);
  });

  it("accepts prompt wired from request when target handle is stored on edge data", () => {
    const result = validateRunClosureInputs(
      {
        nodes: [
          node("req", "request", {
            dynamicFields: [{ id: "field_prompt", name: "prompt", type: "text", value: "sunset" }],
          }),
          node("img", "gpt-image-2", {
            inputs: { mode: "text_to_image", prompt: "" },
          }),
        ],
        edges: [
          {
            id: "e1",
            source: "req",
            target: "img",
            sourceHandle: "field_prompt",
            data: { targetHandle: "in:prompt" },
          },
        ],
      },
      [],
    );
    expect(result.ok).toBe(true);
  });
});
