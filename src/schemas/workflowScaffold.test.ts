import { describe, expect, it } from "vitest";
import {
  createScaffoldGraph,
  ensureWorkflowScaffold,
  isScaffoldNode,
} from "./workflowScaffold";
import { graphFromUnknown } from "./graphNormalize";

describe("workflowScaffold", () => {
  it("creates protected request and response nodes", () => {
    const graph = createScaffoldGraph();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.every((node) => isScaffoldNode(node))).toBe(true);
  });

  it("promotes the first request/response when scaffold markers are missing", () => {
    const graph = ensureWorkflowScaffold({
      nodes: [
        { id: "a", type: "request", position: { x: 0, y: 0 }, data: { dynamicFields: [] } },
        { id: "b", type: "llm", position: { x: 100, y: 0 }, data: {} },
        { id: "c", type: "response", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [],
    });

    const request = graph.nodes.find((node) => node.id === "a");
    const response = graph.nodes.find((node) => node.id === "c");
    expect(request && isScaffoldNode(request)).toBe(true);
    expect(response && isScaffoldNode(response)).toBe(true);
  });

  it("adds scaffold nodes to empty graphs during normalization", () => {
    const graph = graphFromUnknown({ nodes: [], edges: [] });
    expect(graph.nodes.some((node) => node.type === "request" && isScaffoldNode(node))).toBe(
      true,
    );
    expect(graph.nodes.some((node) => node.type === "response" && isScaffoldNode(node))).toBe(
      true,
    );
  });

  it("separates overlapping scaffold request/response nodes", () => {
    const graph = ensureWorkflowScaffold({
      nodes: [
        {
          id: "req",
          type: "request",
          position: { x: 100, y: 200 },
          data: { scaffold: true, dynamicFields: [{ id: "f1", name: "Input", type: "text", value: "" }] },
        },
        {
          id: "res",
          type: "response",
          position: { x: 100, y: 200 },
          data: { scaffold: true },
        },
      ],
      edges: [],
    });

    const response = graph.nodes.find((node) => node.id === "res");
    expect(response?.position.x).toBe(100 + 420 * 2);
    expect(response?.position.y).toBe(200);
  });
});
