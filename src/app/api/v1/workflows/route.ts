import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  handleApiError,
  jsonCreated,
  parseWithSchema,
  readJson,
} from "@/lib/api";
import {
  WorkflowsCreateRequestSchema,
  WorkflowsCreateResponseSchema,
  WorkflowsListResponseSchema,
  createPayloadToGraph,
} from "@/lib/schemas";
import { WorkflowsListQuerySchema, pageToSkip } from "@galaxy/schemas";
import { toWorkflowDocument, toWorkflowListItemApi } from "@/lib/mappers";
import { getAuth } from "@/lib/auth";
import { graphFromUnknown } from "@/lib/graphNormalize";
import { buildEtag, respondWithEtag } from "@/lib/httpCache";

export async function GET(req: Request) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const url = new URL(req.url);
    const query = parseWithSchema(WorkflowsListQuerySchema, {
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    const where = { ownerId, type: "USER" as const };
    const skip = pageToSkip(query.page, query.pageSize);

    const [total, workflows] = await prisma.$transaction([
      prisma.workflow.count({ where }),
      prisma.workflow.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          thumbnailUrl: true,
          updatedAt: true,
        },
      }),
    ]);

    const payload = parseWithSchema(WorkflowsListResponseSchema, {
      items: workflows.map(toWorkflowListItemApi),
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: skip + workflows.length < total,
    });

    const etag = buildEtag([
      "workflows",
      ownerId,
      query.page,
      query.pageSize,
      total,
      ...workflows.map((workflow) => `${workflow.id}:${workflow.updatedAt.getTime()}`),
    ]);

    return respondWithEtag(req, etag, payload);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const body = await readJson(req);
    const input = parseWithSchema(WorkflowsCreateRequestSchema, body);

    const graph = graphFromUnknown(createPayloadToGraph(input));

    const workflow = await prisma.workflow.create({
      data: {
        ownerId,
        name: input.name,
        description: input.description ?? null,
        type: "USER",
        graph: graph as Prisma.InputJsonValue,
        thumbnailUrl: input.thumbnailUrl ?? null,
      },
    });

    return jsonCreated(parseWithSchema(WorkflowsCreateResponseSchema, toWorkflowDocument(workflow)));
  } catch (err) {
    return handleApiError(err);
  }
}
