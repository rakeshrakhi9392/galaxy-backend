import type { WorkflowGraph, WorkflowNode } from "./graph";

const COLUMN_WIDTH = 420;
const SCAFFOLD_HORIZONTAL_GAP = COLUMN_WIDTH * 2;

function randomSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export type RequestFieldInput = {
  name: string;
  type: "text" | "number" | "boolean" | "image" | "audio" | "video" | "media" | "file";
  value?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createRequestField(name: string, type: RequestFieldInput["type"], value = "") {
  return { id: `field_${randomSuffix()}`, name, type, value };
}

export function isScaffoldNode(node: Pick<WorkflowNode, "data">): boolean {
  return asRecord(node.data).scaffold === true;
}

function markScaffold(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    data: {
      ...asRecord(node.data),
      scaffold: true,
    },
  };
}

function createScaffoldRequestNode(position = { x: 0, y: 0 }): WorkflowNode {
  return {
    id: `node_${randomSuffix()}`,
    type: "request",
    position,
    data: {
      label: "Request-Inputs",
      config: {},
      inputs: {},
      scaffold: true,
      dynamicFields: [createRequestField("Input", "text", "")],
    },
  };
}

function createScaffoldResponseNode(position = { x: SCAFFOLD_HORIZONTAL_GAP, y: 0 }): WorkflowNode {
  return {
    id: `node_${randomSuffix()}`,
    type: "response",
    position,
    data: {
      label: "Response",
      config: {},
      inputs: {},
      scaffold: true,
    },
  };
}

/** Fresh workflow graph with protected Request-Inputs and Response nodes. */
export function createScaffoldGraph(requestFields?: RequestFieldInput[]): WorkflowGraph {
  const fields =
    requestFields && requestFields.length > 0
      ? requestFields.map((field) =>
          createRequestField(field.name, field.type, field.value ?? ""),
        )
      : [createRequestField("Input", "text", "")];

  return {
    nodes: [
      {
        ...createScaffoldRequestNode(),
        data: {
          label: "Request-Inputs",
          config: {},
          inputs: {},
          scaffold: true,
          dynamicFields: fields,
        },
      },
      createScaffoldResponseNode(),
    ],
    edges: [],
  };
}

function hasScaffoldOfType(nodes: WorkflowNode[], type: string): boolean {
  return nodes.some((node) => node.type === type && isScaffoldNode(node));
}

/** Keep scaffold request/response visually separate so they drag independently. */
function spreadOverlappingScaffoldNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  const scaffoldRequest = nodes.find((node) => node.type === "request" && isScaffoldNode(node));
  const scaffoldResponse = nodes.find((node) => node.type === "response" && isScaffoldNode(node));
  if (!scaffoldRequest || !scaffoldResponse) return nodes;

  const dx = Math.abs(scaffoldRequest.position.x - scaffoldResponse.position.x);
  const dy = Math.abs(scaffoldRequest.position.y - scaffoldResponse.position.y);

  // Already side-by-side with enough horizontal room to drag independently.
  if (dx >= 380) return nodes;
  // Deliberately stacked in a column — leave as-is.
  if (dx < 24 && dy >= 200) return nodes;

  return nodes.map((node) =>
    node.id === scaffoldResponse.id
      ? {
          ...node,
          position: {
            x: scaffoldRequest.position.x + SCAFFOLD_HORIZONTAL_GAP,
            y: scaffoldRequest.position.y,
          },
        }
      : node,
  );
}

/**
 * Ensures every workflow has one protected Request-Inputs and Response node.
 * Existing workflows without scaffold markers promote their first request/response.
 */
export function ensureWorkflowScaffold(graph: WorkflowGraph): WorkflowGraph {
  let nodes = [...graph.nodes];

  if (!hasScaffoldOfType(nodes, "request")) {
    const firstRequest = nodes.find((node) => node.type === "request");
    if (firstRequest) {
      nodes = nodes.map((node) => (node.id === firstRequest.id ? markScaffold(node) : node));
    } else {
      const responseNode = nodes.find((node) => node.type === "response");
      const position = responseNode
        ? { x: responseNode.position.x - SCAFFOLD_HORIZONTAL_GAP, y: responseNode.position.y }
        : { x: 0, y: 0 };
      nodes.push(createScaffoldRequestNode(position));
    }
  }

  if (!hasScaffoldOfType(nodes, "response")) {
    const firstResponse = nodes.find((node) => node.type === "response");
    if (firstResponse) {
      nodes = nodes.map((node) => (node.id === firstResponse.id ? markScaffold(node) : node));
    } else {
      const requestNode = nodes.find((node) => node.type === "request");
      const position = requestNode
        ? { x: requestNode.position.x + SCAFFOLD_HORIZONTAL_GAP, y: requestNode.position.y }
        : { x: SCAFFOLD_HORIZONTAL_GAP, y: 0 };
      nodes.push(createScaffoldResponseNode(position));
    }
  }

  nodes = spreadOverlappingScaffoldNodes(nodes);

  return { ...graph, nodes };
}
