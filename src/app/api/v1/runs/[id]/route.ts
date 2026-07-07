import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import { RunFetchWithNodesResponseSchema } from "@/lib/schemas";
import { toNodeRunApi, toWorkflowRunApi } from "@/lib/mappers";
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
      include: {
        nodeRuns: {
          orderBy: { createdAt: "asc" },
          include: { providerAttempts: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Run not found");
    }

    const payload = {
      run: toWorkflowRunApi(run),
      nodeRuns: run.nodeRuns.map((nr) => toNodeRunApi(nr, nr.providerAttempts)),
    };
    return jsonOk(parseWithSchema(RunFetchWithNodesResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
