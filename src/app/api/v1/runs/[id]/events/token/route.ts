import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, jsonOk } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { createSseToken } from "@/lib/sseToken";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id: runId } = await params;

    const run = await prisma.workflowRun.findFirst({
      where: { id: runId, ownerId },
      select: { id: true },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Run not found");
    }

    return jsonOk({ sseToken: createSseToken(runId, ownerId) });
  } catch (err) {
    return handleApiError(err);
  }
}
