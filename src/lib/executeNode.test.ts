import { describe, expect, it } from "vitest";
import { executeNode } from "./executeNode";

describe("executeNode", () => {
  it("executes request nodes without temporal dead zone on nodeData", async () => {
    const result = await executeNode({
      workflowRunId: "run_1",
      nodeRunId: "nr_1",
      nodeId: "req_1",
      nodeType: "request",
      node: {
        id: "req_1",
        type: "request",
        position: { x: 0, y: 0 },
        data: {
          dynamicFields: [{ id: "field_prompt", name: "prompt", type: "text", value: "hello" }],
        },
      },
      graph: { nodes: [], edges: [] },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ field_prompt: "hello" });
    expect(result.provider).toBeNull();
  });
});
