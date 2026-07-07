import { describe, expect, it } from "vitest";
import {
  addNodeToGraph,
  connectNodesInGraph,
  createScaffoldGraph,
  deleteNodeFromGraph,
  disconnectNodesInGraph,
  updateNodeInGraph,
} from "@/mcp/graph/mutate";
import { isScaffoldNode } from "@/schemas/workflowScaffold";

describe("mcp graph mutations", () => {
  it("creates request/response scaffold", () => {
    const graph = createScaffoldGraph([{ name: "Prompt", type: "text", value: "hello" }]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.some((node) => node.type === "request")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "response")).toBe(true);
    expect(graph.nodes.every((node) => isScaffoldNode(node))).toBe(true);
  });

  it("allows adding extra request/response nodes and deleting them", () => {
    let graph = createScaffoldGraph();
    const extraRequest = addNodeToGraph(graph, "request", { column: 3, row: 0 });
    graph = extraRequest.graph;
    const extraResponse = addNodeToGraph(graph, "response", { column: 4, row: 0 });
    graph = extraResponse.graph;

    expect(graph.nodes.filter((node) => node.type === "request")).toHaveLength(2);
    expect(graph.nodes.filter((node) => node.type === "response")).toHaveLength(2);

    graph = deleteNodeFromGraph(graph, extraRequest.node.id);
    graph = deleteNodeFromGraph(graph, extraResponse.node.id);
    expect(graph.nodes).toHaveLength(2);
  });

  it("blocks deleting scaffold request/response nodes", () => {
    const graph = createScaffoldGraph();
    const requestNode = graph.nodes.find((node) => node.type === "request")!;
    expect(() => deleteNodeFromGraph(graph, requestNode.id)).toThrow(
      /Cannot delete scaffold request\/response nodes/,
    );
  });

  it("adds, connects, updates, and deletes nodes", () => {
    let graph = createScaffoldGraph([{ name: "Prompt", type: "text", value: "car" }]);
    const requestNode = graph.nodes.find((node) => node.type === "request")!;
    const responseNode = graph.nodes.find((node) => node.type === "response")!;
    const requestFieldId = (requestNode.data as { dynamicFields: Array<{ id: string }> })
      .dynamicFields[0]!.id;

    const added = addNodeToGraph(graph, "llm", { column: 1, row: 0, inputs: { prompt: "test" } });
    graph = added.graph;
    const llmNode = added.node;

    graph = connectNodesInGraph(
      graph,
      requestNode.id,
      requestFieldId,
      llmNode.id,
      "in:prompt",
    ).graph;

    graph = connectNodesInGraph(
      graph,
      llmNode.id,
      "out:output",
      responseNode.id,
      "result",
    ).graph;

    const updated = updateNodeInGraph(graph, llmNode.id, { temperature: 0.2 });
    graph = updated.graph;
    expect((updated.node.data as { inputs: { temperature: number } }).inputs.temperature).toBe(0.2);

    const edgeId = graph.edges[0]!.id;
    graph = disconnectNodesInGraph(graph, { edgeId });
    expect(graph.edges.some((edge) => edge.id === edgeId)).toBe(false);

    graph = deleteNodeFromGraph(graph, llmNode.id);
    expect(graph.nodes.some((node) => node.id === llmNode.id)).toBe(false);
  });
});
