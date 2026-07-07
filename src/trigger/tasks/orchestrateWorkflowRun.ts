import { metadata, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  orchestrateWorkflowRunCore,
  sweepOrphanedRunningNodeRuns,
  ORCHESTRATOR_INTERRUPTED_MESSAGE,
} from "@/lib/runOrchestration";
import { prisma } from "@/lib/prisma";
import { startNodeBatchTrigger } from "./startNodeBatchTrigger";

const OrchestrateWorkflowRunPayloadSchema = z.object({
  workflowId: z.string().min(1),
  runId: z.string().min(1),
});

function publishRunMetadata(result: {
  ok: boolean;
  cancelled: boolean;
  errorSummary: string | null;
}) {
  const status = result.cancelled ? "CANCELLED" : result.ok ? "SUCCESS" : "FAILED";
  metadata.set("status", status);
  if (result.errorSummary) {
    metadata.set("errorSummary", result.errorSummary);
  }
}

export const orchestrateWorkflowRun = task({
  id: "orchestrate-workflow-run",
  run: async (payload: unknown) => {
    const input = OrchestrateWorkflowRunPayloadSchema.parse(payload);

    metadata
      .set("workflowRunId", input.runId)
      .set("workflowId", input.workflowId)
      .set("status", "RUNNING")
      .set("layersTotal", 0)
      .set("layersCompleted", 0)
      .set("nodeStatuses", {});

    try {
      const result = await orchestrateWorkflowRunCore({
        workflowId: input.workflowId,
        runId: input.runId,
        startNodeBatch: startNodeBatchTrigger,
        onProgress: async (progress) => {
          metadata
            .set("layersTotal", progress.layersTotal)
            .set("layersCompleted", progress.layersCompleted)
            .set("runningNodeIds", progress.runningNodeIds)
            .set("nodeStatuses", progress.nodeStatuses)
            .set("nodeTypes", progress.nodeTypes)
            .set("nodeExecutionOrder", progress.nodeExecutionOrder);
        },
      });

      publishRunMetadata(result);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await sweepOrphanedRunningNodeRuns({
        workflowRunId: input.runId,
        reason: ORCHESTRATOR_INTERRUPTED_MESSAGE,
      });

      await prisma.workflowRun.updateMany({
        where: { id: input.runId, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorSummary: message,
        },
      });

      metadata.set("status", "FAILED").set("errorSummary", message);
      throw err;
    }
  },
});
