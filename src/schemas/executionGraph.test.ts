import { describe, expect, it } from "vitest";
import { resolveExecutionNodeIds } from "./executionGraph";

function graph(nodes: Array<{ id: string; type: string }>, edges: Array<{ source: string; target: string }>) {
  return {
    nodes: nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })),
    edges: edges.map((edge, index) => ({
      id: `e${index}`,
      source: edge.source,
      target: edge.target,
    })),
  };
}

describe("resolveExecutionNodeIds", () => {
  it("full run follows request downstream only", () => {
    const allowed = resolveExecutionNodeIds(
      graph(
        [
          { id: "req", type: "request" },
          { id: "img", type: "gpt-image-2" },
          { id: "orphan", type: "gpt-image-2" },
        ],
        [{ source: "req", target: "img" }],
      ),
      [],
    );

    expect([...allowed].sort()).toEqual(["img", "req"]);
  });

  it("single run includes upstream request ancestors", () => {
    const allowed = resolveExecutionNodeIds(
      graph(
        [
          { id: "req", type: "request" },
          { id: "img", type: "gpt-image-2" },
        ],
        [{ source: "req", target: "img" }],
      ),
      ["img"],
    );

    expect([...allowed].sort()).toEqual(["img", "req"]);
  });
});
