import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  ApiError,
  handleApiError,
  jsonOk,
  parseWithSchema,
  readJson,
} from "@/lib/api";
import {
  WorkflowFetchResponseSchema,
  WorkflowSaveRequestSchema,
  WorkflowSaveResponseSchema,
  WorkflowUpdateRequestSchema,
  WorkflowUpdateResponseSchema,
  savePayloadToGraph,
} from "@/lib/schemas";
import { toWorkflowDocument } from "@/lib/mappers";
import { getAuth } from "@/lib/auth";
import { graphFromUnknown } from "@/lib/graphNormalize";
import { findEditableWorkflow, findReadableWorkflow } from "@/lib/workflowAccess";
import { validateWorkflowGraph } from "@galaxy/schemas";
import { listNodeDefinitions } from "@/nodes/registry";
import { buildEtag, respondWithEtag } from "@/lib/httpCache";

function nodeHandleRegistry() {
  return listNodeDefinitions().map((def) => ({
    type: def.type,
    handles: def.ui.handles.map((handle) => ({
      id: handle.id,
      kind: handle.kind,
      dataType: handle.dataType,
    })),
  }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;

    const workflow = await findReadableWorkflow(id, ownerId);

    if (!workflow) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;
    const body = await readJson(req);
    const input = parseWithSchema(WorkflowSaveRequestSchema, body);

    const existing = await findEditableWorkflow(id, ownerId);
    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
    }

    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new ApiError(409, "VERSION_CONFLICT", "Workflow was modified by another session", {
        metadata: {
          expectedVersion: input.expectedVersion,
          currentVersion: existing.version,
        },
      });
    }

    const graph = graphFromUnknown(savePayloadToGraph(input));

    const graphIssues = validateWorkflowGraph(graph, nodeHandleRegistry());
    if (graphIssues.length > 0) {
      throw new ApiError(400, "INVALID_GRAPH", graphIssues[0]!.message, {
        details: graphIssues,
      });
    }

    const updated = await prisma.workflow.updateMany({
      where: { id, ownerId, type: "USER", version: existing.version },
      data: {
        graph: graph as Prisma.InputJsonValue,
        version: existing.version + 1,
      },
    });
    if (updated.count === 0) {
      throw new ApiError(409, "VERSION_CONFLICT", "Workflow version conflict");
    }

    const workflow = await prisma.workflow.findFirstOrThrow({
      where: { id, ownerId },
    });

    return jsonOk(parseWithSchema(WorkflowSaveResponseSchema, toWorkflowDocument(workflow)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;
    const body = await readJson(req);
    const input = parseWithSchema(WorkflowUpdateRequestSchema, body);

    const updated = await prisma.workflow.updateMany({
      where: { id, ownerId, type: "USER" },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      },
    });
    if (updated.count === 0) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
    }

    const workflow = await prisma.workflow.findFirstOrThrow({
      where: { id, ownerId },
    });

    return jsonOk(parseWithSchema(WorkflowUpdateResponseSchema, toWorkflowDocument(workflow)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;

    const deleted = await prisma.workflow.deleteMany({
      where: { id, ownerId, type: "USER" },
    });
    if (deleted.count === 0) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
