import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "../graph";

const PARALLEL = 20;
const SEQUENTIAL = 20;

function stubImageNode(
  id: string,
  label: string,
  x: number,
  y: number,
  mode: "text_to_image" | "image_to_image",
  prompt: string,
): WorkflowNode {
  return {
    id,
    type: "gpt-image-2",
    position: { x, y },
    data: {
      label,
      config: {
        providers: ["openai-gpt-image-2-stub"],
        timeoutMs: 120_000,
        retryPerProvider: 2,
      },
      inputs: {
        mode,
        prompt,
        image: "",
        size: "auto",
        quality: "low",
        n: 1,
        output_format: "png",
        background: "auto",
      },
    },
  };
}

/** 20 parallel + 20 sequential gpt-image-2 stub nodes for orchestrator stress testing. */
export function buildOrchestratorStressGraph(): WorkflowGraph {
  const nodes: WorkflowNode[] = [
    {
      id: "node_request",
      type: "request",
      position: { x: 80, y: 520 },
      data: {
        label: "Request-Inputs",
        config: {},
        inputs: {},
        dynamicFields: [
          {
            id: "field_prompt",
            name: "Seed prompt",
            type: "text",
            value: "orchestrator stress test",
          },
        ],
      },
    },
  ];

  const edges: WorkflowEdge[] = [];

  for (let i = 1; i <= PARALLEL; i++) {
    const id = `par_${String(i).padStart(2, "0")}`;
    nodes.push(
      stubImageNode(id, `Parallel ${i} (stub)`, 320, 40 + (i - 1) * 52, "text_to_image", `Parallel stub branch ${i}`),
    );
    edges.push({
      id: `edge_req_${id}`,
      source: "node_request",
      target: id,
      sourceHandle: "field_prompt",
      targetHandle: "in:prompt",
      type: "default",
    });
  }

  for (let i = 1; i <= SEQUENTIAL; i++) {
    const id = `seq_${String(i).padStart(2, "0")}`;
    nodes.push(
      stubImageNode(
        id,
        `Sequential ${i} (stub)`,
        900 + (i - 1) * 220,
        520,
        "image_to_image",
        `Sequential stub step ${i}`,
      ),
    );
  }

  edges.push({
    id: "edge_par01_seq01",
    source: "par_01",
    target: "seq_01",
    sourceHandle: "out:result",
    targetHandle: "in:image",
    type: "default",
  });

  for (let i = 2; i <= PARALLEL; i++) {
    const id = `par_${String(i).padStart(2, "0")}`;
    edges.push({
      id: `edge_barrier_${id}_seq01`,
      source: id,
      target: "seq_01",
      sourceHandle: "out:result",
      targetHandle: "in:image",
      type: "default",
    });
  }

  for (let i = 1; i < SEQUENTIAL; i++) {
    const from = `seq_${String(i).padStart(2, "0")}`;
    const to = `seq_${String(i + 1).padStart(2, "0")}`;
    edges.push({
      id: `edge_${from}_${to}`,
      source: from,
      target: to,
      sourceHandle: "out:result",
      targetHandle: "in:image",
      type: "default",
    });
  }

  nodes.push({
    id: "node_response",
    type: "response",
    position: { x: 900 + SEQUENTIAL * 220, y: 520 },
    data: { label: "Response", config: {}, inputs: {} },
  });

  edges.push({
    id: "edge_seq20_response",
    source: `seq_${String(SEQUENTIAL).padStart(2, "0")}`,
    target: "node_response",
    sourceHandle: "out:result",
    targetHandle: "result",
    type: "default",
  });

  for (let i = 1; i <= PARALLEL; i++) {
    const id = `par_${String(i).padStart(2, "0")}`;
    edges.push({
      id: `edge_${id}_response`,
      source: id,
      target: "node_response",
      sourceHandle: "out:result",
      targetHandle: "result",
      type: "default",
    });
  }

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.45 },
  };
}
