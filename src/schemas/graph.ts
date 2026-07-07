import { z } from "zod";

export const WorkflowTypeSchema = z.enum(["USER", "SYSTEM"]);

export const WorkflowNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const WorkflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const WorkflowViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  viewport: WorkflowViewportSchema.optional(),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;

export function parseWorkflowGraph(data: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(data);
}

export function emptyWorkflowGraph(): WorkflowGraph {
  return { nodes: [], edges: [] };
}
