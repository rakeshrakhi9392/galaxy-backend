import { describe, expect, it } from "vitest";
import {
  assertNoCycles,
  buildSchedulerGraph,
  canReachDownstream,
  computeExecutionLayers,
  deriveRunScope,
  filterNodesForRunScope,
  planScopedExecution,
  resolveExecutionNodeIds,
  resolveNodesForScope,
  topoSortReactFlowGraph,
} from "./graph";

function node(id: string, type = "llm") {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function edge(source: string, target: string) {
  return { id: `${source}-${target}`, source, target };
}

describe("computeExecutionLayers", () => {
  it("groups a diamond DAG into three layers", () => {
    const graph = {
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
    };

    const layers = computeExecutionLayers(graph);
    expect(layers).toHaveLength(3);
    expect(layers[0]!.map((n) => n.id)).toEqual(["a"]);
    expect(layers[1]!.map((n) => n.id).sort()).toEqual(["b", "c"]);
    expect(layers[2]!.map((n) => n.id)).toEqual(["d"]);
  });

  it("puts 20 parallel roots in one layer", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`));
    const layers = computeExecutionLayers({ nodes, edges: [] });
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(20);
  });

  it("creates 20 single-node layers for a sequential chain", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`));
    const edges = Array.from({ length: 19 }, (_, i) => edge(`n${i}`, `n${i + 1}`));
    const layers = computeExecutionLayers({ nodes, edges });
    expect(layers).toHaveLength(20);
    for (let i = 0; i < 20; i += 1) {
      expect(layers[i]!.map((n) => n.id)).toEqual([`n${i}`]);
    }
  });

  it("throws on cycles", () => {
    const graph = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b"), edge("b", "a")],
    };
    expect(() => computeExecutionLayers(graph)).toThrow(/cycle/i);
  });
});

describe("assertNoCycles", () => {
  it("accepts a DAG", () => {
    const graph = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("a", "c")],
    };
    expect(() => assertNoCycles(graph)).not.toThrow();
  });

  it("throws on a back-edge cycle", () => {
    const graph = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
    };
    expect(() => assertNoCycles(graph)).toThrow(/cycle/i);
  });

  it("throws on a self-loop", () => {
    const graph = {
      nodes: [node("a")],
      edges: [edge("a", "a")],
    };
    expect(() => assertNoCycles(graph)).toThrow(/cycle/i);
  });
});

describe("canReachDownstream", () => {
  it("detects path from target back to source (canvas cycle probe)", () => {
    const graph = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c")],
    };
    // Candidate c → a would cycle because a reaches c, so from c we must not already reach a.
    expect(canReachDownstream(graph, "c", "a")).toBe(false);
    expect(canReachDownstream(graph, "a", "c")).toBe(true);
  });
});

describe("buildSchedulerGraph", () => {
  it("counts incoming edges and seeds ready nodes", () => {
    const graph = {
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
    };
    const sched = buildSchedulerGraph(graph);
    expect(sched.initialReady).toEqual(["a"]);
    expect(sched.pendingDeps.get("a")).toBe(0);
    expect(sched.pendingDeps.get("b")).toBe(1);
    expect(sched.pendingDeps.get("d")).toBe(2);
    expect(sched.children.get("a")!.sort()).toEqual(["b", "c"]);
  });
});

describe("deriveRunScope", () => {
  it("labels by how many IDs arrived", () => {
    expect(deriveRunScope([])).toBe("FULL");
    expect(deriveRunScope(["a"])).toBe("SINGLE");
    expect(deriveRunScope(["a", "b"])).toBe("SELECTION");
  });
});

describe("resolveExecutionNodeIds", () => {
  const graph = {
    nodes: [
      node("req", "request"),
      node("b"),
      node("c"),
      node("d"),
      node("orphan"),
    ],
    edges: [edge("req", "b"), edge("b", "c"), edge("req", "d")],
  };

  it("FULL follows Request Inputs downstream and excludes orphans", () => {
    const allowed = resolveExecutionNodeIds(graph, []);
    expect([...allowed].sort()).toEqual(["b", "c", "d", "req"]);
  });

  it("FULL with no Request Inputs yields an empty set", () => {
    const noRequest = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b")],
    };
    expect(resolveExecutionNodeIds(noRequest, []).size).toBe(0);
  });

  it("SINGLE includes upstream dependencies only", () => {
    const allowed = resolveExecutionNodeIds(graph, ["c"]);
    expect([...allowed].sort()).toEqual(["b", "c", "req"]);
  });

  it("multi-select is the union of upstream closures", () => {
    const allowed = resolveExecutionNodeIds(graph, ["c", "d"]);
    expect([...allowed].sort()).toEqual(["b", "c", "d", "req"]);
  });

  it("multi-select does not include downstream-only neighbors", () => {
    const allowed = resolveExecutionNodeIds(graph, ["b"]);
    expect([...allowed].sort()).toEqual(["b", "req"]);
    expect(allowed.has("c")).toBe(false);
  });
});

describe("resolveNodesForScope", () => {
  const graph = {
    nodes: [node("req", "request"), node("b"), node("c"), node("d")],
    edges: [edge("req", "b"), edge("b", "c"), edge("req", "d")],
  };

  it("ignores scope label and uses target IDs", () => {
    const allowed = resolveNodesForScope(graph, "FULL", ["c"]);
    expect([...allowed].sort()).toEqual(["b", "c", "req"]);
  });
});

describe("planScopedExecution", () => {
  const graph = {
    nodes: [node("req", "request"), node("b"), node("c"), node("d"), node("orphan")],
    edges: [
      edge("req", "b"),
      edge("req", "c"),
      edge("b", "d"),
      edge("c", "d"),
      edge("orphan", "d"),
    ],
  };

  it("orders only the induced subgraph for FULL", () => {
    const layers = planScopedExecution(graph, "FULL", []);
    expect(layers.map((l) => l.map((n) => n.id).sort())).toEqual([
      ["req"],
      ["b", "c"],
      ["d"],
    ]);
  });

  it("preserves layer structure for partial upstream closure", () => {
    const layers = planScopedExecution(graph, "SELECTION", ["d"]);
    // orphan is upstream of d, so it is included
    expect(layers.map((l) => l.map((n) => n.id).sort())).toEqual([
      ["orphan", "req"],
      ["b", "c"],
      ["d"],
    ]);
  });

  it("filterNodesForRunScope delegates to resolveNodesForScope", () => {
    const sorted = topoSortReactFlowGraph(graph);
    const filtered = filterNodesForRunScope(sorted, graph, "SINGLE", ["d"]);
    expect(filtered.map((n) => n.id).sort()).toEqual(["b", "c", "d", "orphan", "req"]);
  });
});
