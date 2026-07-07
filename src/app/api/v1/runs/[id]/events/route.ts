import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/api";
import { toNodeRunApi, toWorkflowRunApi } from "@/lib/mappers";
import { verifySseToken } from "@/lib/sseToken";

function jsonString(data: unknown) {
  return JSON.stringify(data);
}

/** Dev fallback: one-shot SSE snapshot (no polling). Production UI uses Trigger.dev Realtime. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const sseToken = new URL(req.url).searchParams.get("sseToken")?.trim();
    if (!sseToken) {
      throw new ApiError(401, "UNAUTHORIZED", "SSE token required");
    }

    const ownerId = verifySseToken(id, sseToken);

    const run = await prisma.workflowRun.findFirst({
      where: { id, ownerId },
      include: { nodeRuns: { orderBy: { createdAt: "asc" } } },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Run not found");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const payload = {
          run: toWorkflowRunApi(run),
          nodeRuns: run.nodeRuns.map((nr) => toNodeRunApi(nr)),
        };
        controller.enqueue(encoder.encode(`data: ${jsonString(payload)}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
