import { describe, expect, it } from "vitest";
import { validateWorkflowGraph, type HandleRegistryEntry } from "@galaxy/schemas";
import { graphFromUnknown } from "./graphNormalize";

const registry: HandleRegistryEntry[] = [
  {
    type: "llm",
    handles: [
      { id: "in:prompt", kind: "input" },
      { id: "out:output", kind: "output" },
    ],
  },
  {
    type: "merge-video",
    handles: [
      { id: "in:video_urls", kind: "input" },
      { id: "out:video_url", kind: "output" },
    ],
  },
  {
    type: "response",
    handles: [{ id: "result", kind: "input" }],
  },
];

describe("graphFromUnknown edge migration", () => {
  it("migrates legacy llm out:result to out:output before validation", () => {
    const graph = graphFromUnknown({
      nodes: [
        { id: "a", type: "llm", position: { x: 0, y: 0 } },
        { id: "b", type: "response", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "a", target: "b", sourceHandle: "out:result", targetHandle: "result" }],
    });

    expect(graph.edges[0]?.sourceHandle).toBe("out:output");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("defaults missing llm source handle to out:output", () => {
    const graph = graphFromUnknown({
      nodes: [
        { id: "a", type: "llm", position: { x: 0, y: 0 } },
        { id: "b", type: "response", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "a", target: "b", targetHandle: "result" }],
    });

    expect(graph.edges[0]?.sourceHandle).toBe("out:output");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("defaults merge-video source handle to out:video_url", () => {
    const graph = graphFromUnknown({
      nodes: [
        { id: "a", type: "merge-video", position: { x: 0, y: 0 } },
        { id: "b", type: "response", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "a", target: "b", targetHandle: "result" }],
    });

    expect(graph.edges[0]?.sourceHandle).toBe("out:video_url");
  });

  it("defaults missing response target handle to result", () => {
    const graph = graphFromUnknown({
      nodes: [
        { id: "a", type: "llm", position: { x: 0, y: 0 } },
        { id: "b", type: "response", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "a", target: "b", sourceHandle: "out:output" }],
    });

    expect(graph.edges[0]?.targetHandle).toBe("result");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("migrates target handle stored on edge data", () => {
    const graph = graphFromUnknown({
      nodes: [
        {
          id: "req",
          type: "request",
          position: { x: 0, y: 0 },
          data: {
            dynamicFields: [{ id: "field_prompt", name: "prompt", type: "text", value: "" }],
          },
        },
        { id: "llm", type: "llm", position: { x: 0, y: 0 } },
      ],
      edges: [
        {
          id: "e1",
          source: "req",
          target: "llm",
          sourceHandle: "field_prompt",
          data: { targetHandle: "in:prompt" },
        },
      ],
    });

    expect(graph.edges[0]?.targetHandle).toBe("in:prompt");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("migrates legacy trigger out handle for request nodes with empty dynamicFields", () => {
    const graph = graphFromUnknown({
      nodes: [
        {
          id: "req",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: { dynamicFields: [] },
        },
        { id: "llm", type: "llm", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "req", target: "llm", sourceHandle: "out", targetHandle: "in:prompt" }],
    });

    expect(graph.nodes[0]?.type).toBe("request");
    expect(graph.nodes[0]?.data).toMatchObject({
      dynamicFields: [{ id: "field_req_default", name: "Input", type: "text", value: "" }],
    });
    expect(graph.edges[0]?.sourceHandle).toBe("field_req_default");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("remaps stale request field handles to the first dynamic field", () => {
    const graph = graphFromUnknown({
      nodes: [
        {
          id: "req",
          type: "request",
          position: { x: 0, y: 0 },
          data: {
            dynamicFields: [{ id: "field_live", name: "Prompt", type: "text", value: "" }],
          },
        },
        { id: "llm", type: "llm", position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", source: "req", target: "llm", sourceHandle: "field_deleted", targetHandle: "in:prompt" }],
    });

    expect(graph.edges[0]?.sourceHandle).toBe("field_live");
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });
});
