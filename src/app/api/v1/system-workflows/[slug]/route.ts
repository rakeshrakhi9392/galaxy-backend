import { prisma } from "@/lib/prisma";
import {
  ApiError,
  handleApiError,
  parseWithSchema,
} from "@/lib/api";
import { WorkflowFetchResponseSchema } from "@/lib/schemas";
import { toWorkflowDocument } from "@/lib/mappers";
import { getAuth } from "@/lib/auth";
import { buildEtag, respondWithEtag } from "@/lib/httpCache";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await getAuth(req);
    const { slug } = await params;

    const workflow = await prisma.workflow.findFirst({
      where: { type: "SYSTEM", slug },
    });

    if (!workflow) {
      throw new ApiError(404, "NOT_FOUND", "System workflow not found");
    }

    const document = parseWithSchema(
      WorkflowFetchResponseSchema,
      toWorkflowDocument(workflow),
    );
    const etag = buildEtag([
      "workflow",
      workflow.id,
      workflow.version,
      workflow.updatedAt.getTime(),
    ]);

    return respondWithEtag(req, etag, document);
  } catch (err) {
    return handleApiError(err);
  }
}
