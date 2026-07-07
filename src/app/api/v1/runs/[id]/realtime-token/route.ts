import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, jsonOk } from "@/lib/api";
import { createTriggerRunPublicToken } from "@/lib/triggerRealtime";
import { getAuth } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;

    const run = await prisma.workflowRun.findFirst({
      where: { id, ownerId },
      select: { triggerRunId: true },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Run not found");
    }

    if (!run.triggerRunId) {
      throw new ApiError(400, "BAD_REQUEST", "Run is not connected to Trigger.dev yet");
    }

    const publicAccessToken = await createTriggerRunPublicToken(run.triggerRunId);
    if (!publicAccessToken) {
      throw new ApiError(503, "INTERNAL_ERROR", "Trigger.dev realtime is not configured");
    }

    return jsonOk({
      triggerRunId: run.triggerRunId,
      publicAccessToken,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
