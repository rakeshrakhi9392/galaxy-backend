import { catalogNodes } from "@/nodes/catalog";
import { createNodeExecuteTask } from "./createNodeExecuteTask";

export type NodeExecuteTask = ReturnType<typeof createNodeExecuteTask>;

const tasksByType: Record<string, NodeExecuteTask> = Object.fromEntries(
  catalogNodes.map((node) => [node.type, createNodeExecuteTask(node.type)]),
);

/** Lookup the Trigger task for a catalog node type. */
export function getNodeExecuteTask(nodeType: string): NodeExecuteTask {
  const nodeTask = tasksByType[nodeType];
  if (!nodeTask) {
    throw new Error(`No Trigger task registered for node type: ${nodeType}`);
  }
  return nodeTask;
}

/** All per-node execute tasks (one per catalog entry). */
export const nodeExecuteTasksByType: Readonly<Record<string, NodeExecuteTask>> = tasksByType;

/** Flat list for re-exports / tooling. */
export const allNodeExecuteTasks: NodeExecuteTask[] = catalogNodes.map(
  (node) => tasksByType[node.type]!,
);
