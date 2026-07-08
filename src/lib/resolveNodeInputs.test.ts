import { describe, expect, it } from "vitest";
import {
  buildPreRunOutputsByNodeId,
  buildValidationOutputsByNodeId,
  resolveNodeInputs,
  buildRequestOutput,
  topologicalNodeOrder,
} from "@/lib/resolveNodeInputs";
import {
  buildResponseResults,
  resolveResponseFieldBindings,
  type WorkflowGraph,
  type WorkflowNode,
} from "@galaxy/schemas";

describe("resolveNodeInputs", () => {
  it("buildPreRunOutputsByNodeId includes request fields and lastOutput", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [{ id: "field_1", name: "Prompt", type: "text", value: "hello" }],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: { lastOutput: { output: "prior run text" } },
    };

    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [],
    };

    expect(buildPreRunOutputsByNodeId(graph)).toEqual({
      req: { field_1: "hello" },
      llm: { output: "prior run text" },
    });
  });

  it("buildValidationOutputsByNodeId excludes cached lastOutput", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [{ id: "field_1", name: "Prompt", type: "text", value: "hello" }],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: { lastOutput: { output: "prior run text" } },
    };

    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [],
    };

    expect(buildValidationOutputsByNodeId(graph)).toEqual({
      req: { field_1: "hello" },
    });
  });

  it("topologicalNodeOrder returns sources before dependents", () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "req", type: "request", position: { x: 0, y: 0 }, data: {} },
        { id: "llm", type: "llm", position: { x: 0, y: 0 }, data: {} },
        { id: "resp", type: "response", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "req", target: "llm", sourceHandle: "field_1", targetHandle: "in:prompt" },
        { id: "e2", source: "llm", target: "resp", sourceHandle: "out:output", targetHandle: "result" },
      ],
    };

    expect(topologicalNodeOrder(graph).map((node) => node.id)).toEqual(["req", "llm", "resp"]);
  });

  it("wires request dynamic field into llm prompt", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [{ id: "field_1", name: "Car prompt", type: "text", value: "fast red car" }],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: { inputs: { prompt: "" } },
    };
    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "llm",
          sourceHandle: "field_1",
          targetHandle: "in:prompt",
        },
      ],
    };

    const requestOutput = buildRequestOutput(requestNode);
    const resolved = resolveNodeInputs({
      node: llmNode,
      graph,
      outputsByNodeId: { req: requestOutput },
    });

    expect(resolved.prompt).toBe("fast red car");
  });

  it("wires nested kling element frontal image handle", () => {
    const imageNode: WorkflowNode = {
      id: "img",
      type: "gpt-image-2",
      position: { x: 0, y: 0 },
      data: {},
    };
    const klingNode: WorkflowNode = {
      id: "kling",
      type: "kling-v3-pro",
      position: { x: 0, y: 0 },
      data: { inputs: { mode: "image_to_video", elements: [{ reference_image_urls: [] }] } },
    };
    const graph: WorkflowGraph = {
      nodes: [imageNode, klingNode],
      edges: [
        {
          id: "e1",
          source: "img",
          target: "kling",
          sourceHandle: "out:result",
          targetHandle: "in:elements.0.frontal_image_url",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: klingNode,
      graph,
      outputsByNodeId: {
        img: "https://example.com/front.png",
      },
    });

    expect(resolved.elements).toEqual([
      {
        reference_image_urls: [],
        frontal_image_url: "https://example.com/front.png",
      },
    ]);
  });

  it("wires nested kling element reference image handle", () => {
    const imageNode: WorkflowNode = {
      id: "img",
      type: "gpt-image-2",
      position: { x: 0, y: 0 },
      data: {},
    };
    const klingNode: WorkflowNode = {
      id: "kling",
      type: "kling-v3-pro",
      position: { x: 0, y: 0 },
      data: { inputs: { mode: "image_to_video", elements: [{ reference_image_urls: [] }] } },
    };
    const graph: WorkflowGraph = {
      nodes: [imageNode, klingNode],
      edges: [
        {
          id: "e1",
          source: "img",
          target: "kling",
          sourceHandle: "out:result",
          targetHandle: "in:elements.0.reference_image_urls",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: klingNode,
      graph,
      outputsByNodeId: {
        img: {
          result: [
            { url: "https://example.com/ref-a.png" },
            { url: "https://example.com/ref-b.png" },
          ],
        },
      },
    });

    expect(resolved.elements).toEqual([
      {
        reference_image_urls: [
          "https://example.com/ref-a.png",
          "https://example.com/ref-b.png",
        ],
      },
    ]);
  });

  it("takes first url from image_list into kling start_image_url", () => {
    const imageNode: WorkflowNode = {
      id: "img",
      type: "gpt-image-2",
      position: { x: 0, y: 0 },
      data: {},
    };
    const klingNode: WorkflowNode = {
      id: "kling",
      type: "kling-v3-pro",
      position: { x: 0, y: 0 },
      data: { inputs: { mode: "image_to_video", start_image_url: "" } },
    };
    const graph: WorkflowGraph = {
      nodes: [imageNode, klingNode],
      edges: [
        {
          id: "e1",
          source: "img",
          target: "kling",
          sourceHandle: "out:result",
          targetHandle: "in:start_image_url",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: klingNode,
      graph,
      outputsByNodeId: {
        img: {
          result: [
            { url: "https://example.com/a.png" },
            { url: "https://example.com/b.png" },
          ],
        },
      },
    });

    expect(resolved.start_image_url).toBe("https://example.com/a.png");
  });

  it("uses first non-empty wired line for numeric settings", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [
          { id: "field_1", name: "a", type: "text", value: "0.2" },
          { id: "field_2", name: "b", type: "text", value: "1.5" },
        ],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: { inputs: { temperature: 0.7 } },
    };
    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "llm",
          sourceHandle: "field_1",
          targetHandle: "in:temperature",
        },
        {
          id: "e2",
          source: "req",
          target: "llm",
          sourceHandle: "field_2",
          targetHandle: "in:temperature",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: llmNode,
      graph,
      outputsByNodeId: { req: buildRequestOutput(requestNode) },
    });

    // Merged text is "0.2\n1.5"; first non-empty line wins.
    expect(resolved.temperature).toBe(0.2);
  });

  it("overrides local text with wired text", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [
          { id: "field_1", name: "a", type: "text", value: "from request" },
        ],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: { inputs: { prompt: "local prompt" } },
    };
    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "llm",
          sourceHandle: "field_1",
          targetHandle: "in:prompt",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: llmNode,
      graph,
      outputsByNodeId: { req: buildRequestOutput(requestNode) },
    });

    expect(resolved.prompt).toBe("from request");
  });

  it("merges media urls and keeps local extras", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [
          { id: "field_1", name: "img", type: "image", value: "https://example.com/a.png" },
        ],
      },
    };
    const llmNode: WorkflowNode = {
      id: "llm",
      type: "llm",
      position: { x: 0, y: 0 },
      data: {
        inputs: {
          image_urls: ["https://example.com/local.png", "https://example.com/a.png"],
        },
      },
    };
    const graph: WorkflowGraph = {
      nodes: [requestNode, llmNode],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "llm",
          sourceHandle: "field_1",
          targetHandle: "in:image_urls",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: llmNode,
      graph,
      outputsByNodeId: { req: buildRequestOutput(requestNode) },
    });

    expect(resolved.image_urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/local.png",
    ]);
  });

  it("collects multiple response edges into named results", () => {
    const requestNode: WorkflowNode = {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [{ id: "field_1", name: "text_input", type: "text", value: "hello" }],
      },
    };
    const klingNode: WorkflowNode = {
      id: "kling",
      type: "kling-v3-pro",
      position: { x: 0, y: 0 },
      data: {},
    };
    const responseNode: WorkflowNode = {
      id: "resp",
      type: "response",
      position: { x: 0, y: 0 },
      data: { config: {}, inputs: {} },
    };
    const graph: WorkflowGraph = {
      nodes: [requestNode, klingNode, responseNode],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "resp",
          sourceHandle: "field_1",
          targetHandle: "result",
        },
        {
          id: "e2",
          source: "kling",
          target: "resp",
          sourceHandle: "out:result",
          targetHandle: "result",
        },
      ],
    };

    const resolved = resolveNodeInputs({
      node: responseNode,
      graph,
      outputsByNodeId: {
        req: buildRequestOutput(requestNode),
        kling: { result: { url: "https://example.com/v.mp4" } },
      },
    });

    const values = Array.isArray(resolved.result) ? resolved.result : [];
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const bindings = resolveResponseFieldBindings(
      responseNode.id,
      responseNode.data,
      graph.edges,
      nodesById,
    );
    const results = buildResponseResults(bindings, values);

    expect(results).toEqual({
      text_input: "hello",
      kling_v3_pro: { url: "https://example.com/v.mp4" },
    });
  });
});
