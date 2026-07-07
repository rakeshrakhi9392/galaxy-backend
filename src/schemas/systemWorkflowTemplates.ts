import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./graph";
import { buildOrchestratorStressGraph } from "./systemWorkflows/orchestratorStressGraph";

export const DEFAULT_SYSTEM_WORKFLOW_THUMBNAIL =
  "https://galaxy-prod.tlcdn.com/preview-assets/image/system-workflow-thumbnail/uuid-v4-folder/fb5a9379-250e-4237-8cfd-09a9fbcc2eac.jpg?hsh=optimize";

export type SystemWorkflowTemplateSeed = {
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string;
  graph: WorkflowGraph;
};

const aiRacingCarNodes: WorkflowNode[] = [
  {
    id: "node_request",
    type: "request",
    position: { x: 96, y: 120 },
    data: {
      label: "Request-Inputs",
      config: {},
      inputs: {},
      dynamicFields: [
        {
          id: "field_car_prompt",
          name: "Car prompt",
          type: "text",
          value: "",
        },
      ],
    },
  },
  {
    id: "node_llm",
    type: "llm",
    position: { x: 640, y: 120 },
    data: {
      label: "Generate car concept",
      config: {},
      inputs: {
        prompt: "",
        system_prompt: "Write Prompt for Car Racing",
        temperature: 0.7,
        max_tokens: 1024,
      },
    },
  },
  {
    id: "node_response",
    type: "response",
    position: { x: 1184, y: 120 },
    data: {
      label: "Response",
      config: {},
      inputs: {},
    },
  },
];

const aiRacingCarEdges: WorkflowEdge[] = [
  {
    id: "edge_request_llm",
    source: "node_request",
    target: "node_llm",
    sourceHandle: "field_car_prompt",
    targetHandle: "in:prompt",
    type: "default",
  },
  {
    id: "edge_llm_response",
    source: "node_llm",
    target: "node_response",
    sourceHandle: "out:output",
    targetHandle: "result",
    type: "default",
  },
];

export const SYSTEM_WORKFLOW_TEMPLATES: SystemWorkflowTemplateSeed[] = [
  {
    slug: "ai-racing-car",
    name: "AI Racing Car Generator",
    description: null,
    thumbnailUrl: DEFAULT_SYSTEM_WORKFLOW_THUMBNAIL,
    graph: {
      nodes: aiRacingCarNodes,
      edges: aiRacingCarEdges,
    },
  },
  {
    slug: "orchestrator-stress-20p-20s",
    name: "Orchestrator stress test (20 parallel + 20 sequential)",
    description:
      "40 gpt-image-2 stub nodes: 20 parallel branches, then a 20-step sequential chain. For orchestrator load testing.",
    thumbnailUrl: DEFAULT_SYSTEM_WORKFLOW_THUMBNAIL,
    graph: buildOrchestratorStressGraph(),
  },
];

export function getSystemWorkflowTemplate(slug: string) {
  return SYSTEM_WORKFLOW_TEMPLATES.find((template) => template.slug === slug);
}
