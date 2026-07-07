import { describe, expect, it } from "vitest";
import {
  CATALOG_NODE_TYPES,
  NODE_INPUT_SCHEMAS,
  NODE_OUTPUT_SCHEMAS,
  getNodeInputSchema,
  getNodeOutputSchema,
} from "./nodeSchemas";

describe("nodeSchemas registry", () => {
  it("exposes input and output schemas for every provider node", () => {
    for (const type of CATALOG_NODE_TYPES) {
      expect(getNodeInputSchema(type)).toBe(NODE_INPUT_SCHEMAS[type]);
      expect(getNodeOutputSchema(type)).toBe(NODE_OUTPUT_SCHEMAS[type]);
    }
  });

  it("rejects invalid merge-av inputs", () => {
    const schema = getNodeInputSchema("merge-av");
    expect(schema).toBeDefined();
    const result = schema!.safeParse({
      video_url: "",
      audio_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts default llm inputs", () => {
    const schema = getNodeInputSchema("llm");
    expect(schema!.safeParse({}).success).toBe(true);
  });
});
