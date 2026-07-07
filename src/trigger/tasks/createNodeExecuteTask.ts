import { metadata, task } from "@trigger.dev/sdk/v3";
import { ExecuteNodeInputSchema, executeNode } from "@/lib/executeNode";

/**
 * One Trigger.dev task per node type — isolated execution with a strict Zod contract.
 * Task id: `execute-node-<nodeType>` (e.g. `execute-node-gpt-image-2`).
 */
export function createNodeExecuteTask(nodeType: string) {
  const taskId = `execute-node-${nodeType}`;

  return task({
    id: taskId,
    run: async (payload: unknown) => {
      const input = ExecuteNodeInputSchema.parse(payload);
      if (input.nodeType !== nodeType) {
        throw new Error(
          `Task ${taskId} expects nodeType "${nodeType}", got "${input.nodeType}"`,
        );
      }

      const result = await executeNode(input);
      metadata.parent.set("lastCompletedNode", input.nodeId);
      return result;
    },
  });
}
