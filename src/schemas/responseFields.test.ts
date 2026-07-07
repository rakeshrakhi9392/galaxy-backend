import { describe, expect, it } from "vitest";
import {
  buildResponseResults,
  defaultResponseFieldName,
  resolveResponseFieldBindings,
  toResponseFieldKey,
} from "./responseFields";

describe("responseFields", () => {
  it("slugifies labels into field keys", () => {
    expect(toResponseFieldKey("Kling V3 Pro")).toBe("kling_v3_pro");
    expect(toResponseFieldKey("text_input")).toBe("text_input");
  });

  it("uses request field names", () => {
    expect(
      defaultResponseFieldName(
        {
          type: "request",
          data: {
            dynamicFields: [{ id: "field_1", name: "text_input", type: "text" }],
          },
        },
        "field_1",
      ),
    ).toBe("text_input");
  });

  it("uses node type when no label", () => {
    expect(defaultResponseFieldName({ type: "kling-v3-pro", data: {} }, "out:result")).toBe(
      "kling_v3_pro",
    );
  });

  it("builds unique named bindings from edges", () => {
    const nodesById = new Map([
      [
        "req",
        {
          type: "request",
          data: { dynamicFields: [{ id: "field_1", name: "text_input", type: "text" }] },
        },
      ],
      ["k1", { type: "kling-v3-pro", data: {} }],
      ["k2", { type: "kling-v3-pro", data: {} }],
    ]);

    const bindings = resolveResponseFieldBindings(
      "resp",
      { config: { fieldNames: { e3: "custom_out" } } },
      [
        { id: "e1", source: "req", target: "resp", sourceHandle: "field_1", targetHandle: "result" },
        { id: "e2", source: "k1", target: "resp", sourceHandle: "out:result", targetHandle: "result" },
        { id: "e3", source: "k2", target: "resp", sourceHandle: "out:result", targetHandle: "result" },
      ],
      nodesById,
    );

    expect(bindings.map((b) => b.name)).toEqual(["text_input", "kling_v3_pro", "custom_out"]);
  });

  it("maps values onto named results", () => {
    const results = buildResponseResults(
      [
        { edgeId: "e1", sourceNodeId: "a", sourceHandle: null, name: "text_input" },
        { edgeId: "e2", sourceNodeId: "b", sourceHandle: null, name: "kling_v3_pro" },
      ],
      ["hello", { url: "https://example.com/v.mp4" }],
    );
    expect(results).toEqual({
      text_input: "hello",
      kling_v3_pro: { url: "https://example.com/v.mp4" },
    });
  });
});
