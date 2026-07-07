import { describe, expect, it } from "vitest";
import { emptyWorkflowGraph, parseWorkflowGraph } from "./graph";
import { parseWorkflowDocument } from "./workflows";

describe("graph", () => {
  it("parses empty graph", () => {
    expect(parseWorkflowGraph(emptyWorkflowGraph())).toEqual({ nodes: [], edges: [] });
  });
});

describe("workflows", () => {
  it("parses workflow document", () => {
    const doc = parseWorkflowDocument({
      id: "wf_1",
      name: "Test",
      description: null,
      thumbnailUrl: null,
      type: "USER",
      nodes: [],
      edges: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(doc.name).toBe("Test");
  });
});
