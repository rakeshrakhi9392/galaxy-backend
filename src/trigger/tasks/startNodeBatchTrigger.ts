import { batch } from "@trigger.dev/sdk/v3";
import { ExecuteNodeOutputSchema } from "@/lib/executeNode";
import type { LayerExecutionItem, LayerExecutionResult } from "@/lib/runOrchestration";
import { getNodeExecuteTask } from "./nodeExecuteTasks";

function toLayerResult(
  item: LayerExecutionItem,
  run: { ok: true; output: unknown } | { ok: false; error: unknown },
  startedAt: number,
): LayerExecutionResult {
  if (run.ok) {
    const output = ExecuteNodeOutputSchema.parse(run.output);
    return {
      nodeId: item.nodeId,
      ok: true,
      output,
      durationMs: output.sleptMs ?? Date.now() - startedAt,
    };
  }  return {
    nodeId: item.nodeId,
    ok: false,
    error: run.error,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Dispatch a ready wave via per-node Trigger tasks.
 * - One node: `task.triggerAndWait`
 * - Multiple nodes (any mix of types): `batch.triggerByTaskAndWait` (single suspend)
 *
 * Never race multiple `triggerAndWait` promises — Trigger rejects parallel waits.
 */
export async function startNodeBatchTrigger(
  items: LayerExecutionItem[],
): Promise<LayerExecutionResult[]> {
  if (items.length === 0) return [];

  const startedAt = Date.now();

  try {
    if (items.length === 1) {
      const item = items[0]!;
      const nodeTask = getNodeExecuteTask(item.input.nodeType);
      const run = await nodeTask.triggerAndWait(item.input);
      return [toLayerResult(item, run, startedAt)];
    }

    const batchItems = items.map((item) => ({
      task: getNodeExecuteTask(item.input.nodeType),
      payload: item.input,
    }));

    const batchResult = await batch.triggerByTaskAndWait(batchItems);
    const runs = batchResult.runs;

    return items.map((item, index) => {
      const run = runs[index];
      if (!run) {
        return {
          nodeId: item.nodeId,
          ok: false as const,
          error: new Error("Missing batch result for node"),
          durationMs: Date.now() - startedAt,
        };
      }
      return toLayerResult(item, run, startedAt);
    });
  } catch (error) {
    return items.map((item) => ({
      nodeId: item.nodeId,
      ok: false as const,
      error,
      durationMs: Date.now() - startedAt,
    }));
  }
}
