import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  parseWithSchema,
} from "@/lib/api";
import { SystemWorkflowsListResponseSchema } from "@/lib/schemas";
import { toSystemWorkflowListItemApi } from "@/lib/mappers";
import { getAuth } from "@/lib/auth";
import { buildEtag, respondWithEtag } from "@/lib/httpCache";

export async function GET(req: Request) {
  try {
    await getAuth(req);

    const workflows = await prisma.workflow.findMany({
      where: { type: "SYSTEM" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        thumbnailUrl: true,
        updatedAt: true,
      },
    });

    const items = workflows.flatMap((workflow) => {
      if (!workflow.slug) return [];
      return [toSystemWorkflowListItemApi({ ...workflow, slug: workflow.slug })];
    });

    const payload = parseWithSchema(SystemWorkflowsListResponseSchema, { items });
    const etag = buildEtag([
      "system-workflows",
      ...workflows.map((workflow) => `${workflow.id}:${workflow.updatedAt.getTime()}`),
    ]);

    return respondWithEtag(req, etag, payload);
  } catch (err) {
    return handleApiError(err);
  }
}
