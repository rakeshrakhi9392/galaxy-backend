import { describe, expect, it } from "vitest";
import {
  hasCycle,
  validateWorkflowGraph,
  validateWorkflowGraphNoCycles,
  type HandleRegistryEntry,
} from "@galaxy/schemas";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@galaxy/schemas";

const registry: HandleRegistryEntry[] = [
  {
    type: "llm",
    handles: [
      { id: "in:prompt", kind: "input" },
      { id: "out:output", kind: "output" },
    ],
  },
  {
    type: "response",
    handles: [{ id: "result", kind: "input" }],
  },
];

function node(id: string, type: string, data?: Record<string, unknown>): WorkflowNode {
  return { id, type, position: { x: 0, y: 0 }, ...(data ? { data } : {}) };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): WorkflowEdge {
  return { id, source, target, sourceHandle, targetHandle };
}

describe("hasCycle", () => {
  it("detects a cycle when candidate completes a loop", () => {
    const nodes = [node("a", "llm"), node("b", "llm")];
    const edges = [edge("e1", "a", "b", "out:output", "in:prompt")];
    const candidate = edge("cand", "b", "a", "out:output", "in:prompt");
    expect(hasCycle(nodes, edges, candidate)).toBe(true);
  });

  it("returns false for acyclic DAG", () => {
    const nodes = [node("a", "llm"), node("b", "response")];
    const edges = [edge("e1", "a", "b", "out:output", "result")];
    expect(hasCycle(nodes, edges)).toBe(false);
  });
});

describe("validateWorkflowGraphNoCycles", () => {
  it("reports cycle in stored graph", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "llm"), node("b", "llm")],
      edges: [
        edge("e1", "a", "b", "out:output", "in:prompt"),
        edge("e2", "b", "a", "out:output", "in:prompt"),
      ],
    };
    const issues = validateWorkflowGraphNoCycles(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("CYCLE_DETECTED");
  });
});

describe("validateWorkflowGraph", () => {
  it("accepts valid llm to response connection", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "llm"), node("b", "response")],
      edges: [edge("e1", "a", "b", "out:result", "result")],
    };
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });

  it("rejects connection into request node", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "llm"), node("b", "request")],
      edges: [edge("e1", "a", "b", "out:result", "in:prompt")],
    };
    const issues = validateWorkflowGraph(graph, registry);
    expect(issues.some((i) => i.message.includes("request"))).toBe(true);
  });

  it("rejects connection out of response node", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "response"), node("b", "llm")],
      edges: [edge("e1", "a", "b", "out:result", "in:prompt")],
    };
    const issues = validateWorkflowGraph(graph, registry);
    expect(issues.some((i) => i.message.includes("response"))).toBe(true);
  });

  it("rejects duplicate input handle connections", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "llm"), node("b", "llm"), node("c", "llm")],
      edges: [
        edge("e1", "a", "c", "out:result", "in:prompt"),
        edge("e2", "b", "c", "out:result", "in:prompt"),
      ],
    };
    const issues = validateWorkflowGraph(graph, registry);
    expect(issues.some((i) => i.code === "DUPLICATE_INPUT")).toBe(true);
  });

  it("allows request dynamic field as source handle", () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("req", "request", { dynamicFields: [{ id: "field_1", name: "x", type: "text" }] }),
        node("llm", "llm"),
      ],
      edges: [edge("e1", "req", "llm", "field_1", "in:prompt")],
    };
    expect(validateWorkflowGraph(graph, registry)).toHaveLength(0);
  });
});
