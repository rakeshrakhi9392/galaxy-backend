import { tasks } from "@trigger.dev/sdk/v3";
import type { orchestrateWorkflowRun } from "@/trigger/tasks/orchestrateWorkflowRun";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const TRIGGER_NOT_CONFIGURED_MESSAGE =
  "TRIGGER_SECRET_KEY is not configured. Workflow execution requires Trigger.dev.";

async function markRunFailed(runId: string, message: string): Promise<void> {
  await prisma.workflowRun.updateMany({
    where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorSummary: message,
    },
  });
}

async function assertTriggerConfigured(runId: string): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY?.trim()) {
    await markRunFailed(runId, TRIGGER_NOT_CONFIGURED_MESSAGE);
    throw new ApiError(503, "INTERNAL_ERROR", TRIGGER_NOT_CONFIGURED_MESSAGE);
  }
}

export async function enqueueWorkflowRun(args: {
  workflowId: string;
  runId: string;
}) {
  await assertTriggerConfigured(args.runId);

  try {
    const handle = await tasks.trigger<typeof orchestrateWorkflowRun>(
      "orchestrate-workflow-run",
      args,
    );
    await prisma.workflowRun.update({
      where: { id: args.runId },
      data: { triggerRunId: handle.id },
    });
    return { triggerRunId: handle.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[orchestrator] Trigger enqueue failed", err);
    await markRunFailed(args.runId, message);
    throw err instanceof ApiError
      ? err
      : new ApiError(503, "INTERNAL_ERROR", "Failed to enqueue workflow run on Trigger.dev", {
          cause: message,
        });
  }
}
