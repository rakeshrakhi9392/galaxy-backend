import { describe, expect, it } from "vitest";
import {
  estimateNodeCreditsFromResolved,
  estimateExecutionSubgraphCredits,
} from "@/lib/estimateNodeCredits";

describe("estimateNodeCreditsFromResolved", () => {
  it("estimates gpt-image-2 from resolved inputs", () => {
    expect(
      estimateNodeCreditsFromResolved("gpt-image-2", {
        quality: "high",
        n: 1,
      }),
    ).toBe(210_000);
  });

  it("returns zero for request nodes", () => {
    expect(estimateNodeCreditsFromResolved("request", {})).toBe(0);
  });
});

describe("estimateExecutionSubgraphCredits", () => {
  it("sums chargeable nodes in the execution subgraph", () => {
    const graph = {
      nodes: [
        {
          id: "req",
          type: "request",
          position: { x: 0, y: 0 },
          data: {
            dynamicFields: [{ id: "field_req_prompt", name: "Prompt", type: "text", value: "hi" }],
          },
        },
        {
          id: "img",
          type: "gpt-image-2",
          position: { x: 0, y: 0 },
          data: {
            inputs: { prompt: "fox", quality: "high", n: 1 },
          },
        },
      ],
      edges: [{ id: "e1", source: "req", target: "img" }],
    };

    const total = estimateExecutionSubgraphCredits(graph, []);
    expect(total).toBe(210_000);
  });
});
