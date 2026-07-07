import { prisma } from "@/lib/prisma";
import {
  ApiError,
  handleApiError,
  jsonCreated,
  jsonOk,
  parseWithSchema,
  readJson,
} from "@/lib/api";
import {
  WorkflowRunCreateRequestSchema,
  WorkflowRunCreateResponseSchema,
  WorkflowRunsListResponseSchema,
} from "@/lib/schemas";
import { toWorkflowRunApi } from "@/lib/mappers";
import { graphFromUnknown } from "@/lib/graphNormalize";
import { enqueueWorkflowRun } from "@/lib/orchestrator";
import { authMethodToInitiator, getAuth } from "@/lib/auth";
import { findReadableWorkflow } from "@/lib/workflowAccess";
import { validateRunClosureInputs } from "@/lib/validateRunClosure";
import { deriveRunScope, parseWorkflowGraphForExecution } from "@/trigger/graph";
import { estimateExecutionSubgraphCredits } from "@/lib/estimateNodeCredits";
import { assertSufficientCredits, InsufficientCreditsError } from "@/lib/creditsLedger";
import type { Prisma } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id: workflowId } = await params;

    const workflow = await findReadableWorkflow(workflowId, ownerId);
    if (!workflow) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
    }

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId, ownerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const payload = { runs: runs.map(toWorkflowRunApi) };
    return jsonOk(parseWithSchema(WorkflowRunsListResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuth(req);
    const ownerId = auth.userId;
    const { id: workflowId } = await params;
    const body = await readJson(req);
    const input = parseWithSchema(WorkflowRunCreateRequestSchema, body);

    const workflow = await findReadableWorkflow(workflowId, ownerId);
    if (!workflow) {
      throw new ApiError(404, "NOT_FOUND", "Workflow not found");
    }

    if (input.idempotencyKey) {
      const existing = await prisma.workflowRun.findFirst({
        where: { workflowId, ownerId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        const payload = { run: toWorkflowRunApi(existing) };
        return jsonCreated(parseWithSchema(WorkflowRunCreateResponseSchema, payload));
      }
    }

    const targetNodeIds = [...new Set(input.targetNodeIds)];
    // Scope is metadata only — derived from how many IDs arrived.
    const scope = deriveRunScope(targetNodeIds);
    const graphSnapshot = input.graph ?? graphFromUnknown(workflow.graph);
    const graph = parseWorkflowGraphForExecution(graphSnapshot);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    for (const nodeId of targetNodeIds) {
      if (!nodeIds.has(nodeId)) {
        throw new ApiError(400, "BAD_REQUEST", `Unknown node id: ${nodeId}`);
      }
    }

    const closure = validateRunClosureInputs(graphSnapshot, targetNodeIds);
    if (!closure.ok) {
      throw new ApiError(400, "BAD_REQUEST", closure.message);
    }

    const estimatedCredits = estimateExecutionSubgraphCredits(graphSnapshot, targetNodeIds);
    try {
      await assertSufficientCredits(ownerId, estimatedCredits);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new ApiError(402, "INSUFFICIENT_CREDITS", error.message, {
          metadata: { required: error.required, balance: error.balance },
        });
      }
      throw error;
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId,
        ownerId,
        scope,
        targetNodeIds,
        graphSnapshot: graphSnapshot as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        initiator: authMethodToInitiator(auth.method),
        apiKeyId: auth.apiKeyId,
        status: "QUEUED",
        estimatedCredits,
      },
    });

    await enqueueWorkflowRun({ workflowId, runId: run.id });

    const hydrated = await prisma.workflowRun.findUnique({ where: { id: run.id } });
    const payload = { run: toWorkflowRunApi(hydrated ?? run) };
    return jsonCreated(parseWithSchema(WorkflowRunCreateResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
