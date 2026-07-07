import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { toWorkflowRunApi } from "@/lib/mappers";

/** Cancel a queued or running workflow run for the authenticated owner. */
export async function cancelWorkflowRunForUser(ownerId: string, runId: string) {
  const run = await prisma.workflowRun.findFirst({ where: { id: runId, ownerId } });
  if (!run) {
    throw new ApiError(404, "NOT_FOUND", "Run not found");
  }
  if (!["QUEUED", "RUNNING"].includes(run.status)) {
    throw new ApiError(400, "BAD_REQUEST", `Run is not cancellable (status: ${run.status})`);
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });

  const updated = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
  return { run: toWorkflowRunApi(updated) };
}
