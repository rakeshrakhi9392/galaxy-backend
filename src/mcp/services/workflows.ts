import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toWorkflowDocument, toWorkflowListItemApi, toSystemWorkflowListItemApi } from "@/lib/mappers";
import { graphFromUnknown } from "@/lib/graphNormalize";
import { findEditableWorkflow, findReadableWorkflow } from "@/lib/workflowAccess";
import {
  applyRequestValuesToGraph,
  createScaffoldGraph,
  graphFromStored,
  type RequestFieldInput,
} from "@/mcp/graph/mutate";
import { McpToolError } from "@/mcp/errors";
import type { WorkflowGraph } from "@galaxy/schemas";

export async function listUserWorkflows(ownerId: string, page = 1, pageSize = 20) {
  const where = { ownerId, type: "USER" as const };
  const skip = (page - 1) * pageSize;
  const [total, workflows] = await prisma.$transaction([
    prisma.workflow.count({ where }),
    prisma.workflow.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      select: { id: true, name: true, thumbnailUrl: true, updatedAt: true },
    }),
  ]);

  return {
    items: workflows.map(toWorkflowListItemApi),
    page,
    pageSize,
    total,
    hasMore: skip + workflows.length < total,
  };
}

export async function listSystemWorkflows() {
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

  return {
    items: workflows.flatMap((workflow) =>
      workflow.slug ? [toSystemWorkflowListItemApi({ ...workflow, slug: workflow.slug })] : [],
    ),
  };
}

export async function getWorkflowDocument(workflowId: string, ownerId: string) {
  const workflow = await findReadableWorkflow(workflowId, ownerId);
  if (!workflow) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }
  return toWorkflowDocument(workflow);
}

async function findWorkflowByNameOrId(
  identifier: string,
  ownerId: string,
): Promise<{ id: string; graph: WorkflowGraph; type: "USER" | "SYSTEM"; name: string } | null> {
  const byId = await findReadableWorkflow(identifier, ownerId);
  if (byId) {
    return {
      id: byId.id,
      graph: graphFromStored(byId.graph),
      type: byId.type,
      name: byId.name,
    };
  }

  const userMatch = await prisma.workflow.findFirst({
    where: { ownerId, type: "USER", name: { equals: identifier, mode: "insensitive" } },
  });
  if (userMatch) {
    return {
      id: userMatch.id,
      graph: graphFromStored(userMatch.graph),
      type: userMatch.type,
      name: userMatch.name,
    };
  }

  const systemMatch = await prisma.workflow.findFirst({
    where: {
      type: "SYSTEM",
      OR: [
        { slug: { equals: identifier, mode: "insensitive" } },
        { name: { equals: identifier, mode: "insensitive" } },
      ],
    },
  });
  if (systemMatch) {
    return {
      id: systemMatch.id,
      graph: graphFromStored(systemMatch.graph),
      type: systemMatch.type,
      name: systemMatch.name,
    };
  }

  return null;
}

export async function resolveWorkflowRef(identifier: string, ownerId: string) {
  const match = await findWorkflowByNameOrId(identifier, ownerId);
  if (!match) {
    throw new McpToolError("NOT_FOUND", `Workflow not found: ${identifier}`);
  }
  return match;
}

export async function createUserWorkflow(
  ownerId: string,
  name: string,
  options?: { description?: string | null; requestFields?: RequestFieldInput[] },
) {
  const graph = createScaffoldGraph(options?.requestFields);
  const workflow = await prisma.workflow.create({
    data: {
      ownerId,
      name,
      description: options?.description ?? null,
      type: "USER",
      graph: graph as Prisma.InputJsonValue,
    },
  });
  return toWorkflowDocument(workflow);
}

export async function updateWorkflowMetadata(
  ownerId: string,
  workflowId: string,
  patch: { name?: string; description?: string | null },
) {
  const updated = await prisma.workflow.updateMany({
    where: { id: workflowId, ownerId, type: "USER" },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    },
  });
  if (updated.count === 0) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }
  const workflow = await prisma.workflow.findFirstOrThrow({ where: { id: workflowId, ownerId } });
  return toWorkflowDocument(workflow);
}

export async function saveWorkflowGraph(ownerId: string, workflowId: string, graph: WorkflowGraph) {
  const existing = await findEditableWorkflow(workflowId, ownerId);
  if (!existing) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }

  const updated = await prisma.workflow.updateMany({
    where: { id: workflowId, ownerId, type: "USER", version: existing.version },
    data: {
      graph: graph as Prisma.InputJsonValue,
      version: existing.version + 1,
    },
  });
  if (updated.count === 0) {
    throw new McpToolError("VERSION_CONFLICT", "Workflow was modified concurrently. Reload and retry.");
  }

  const workflow = await prisma.workflow.findFirstOrThrow({ where: { id: workflowId, ownerId } });
  return toWorkflowDocument(workflow);
}

export async function deleteUserWorkflow(ownerId: string, workflowId: string) {
  const deleted = await prisma.workflow.deleteMany({
    where: { id: workflowId, ownerId, type: "USER" },
  });
  if (deleted.count === 0) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }
  return { deleted: true as const, workflowId };
}

export async function loadEditableGraph(ownerId: string, workflowId: string) {
  const workflow = await findEditableWorkflow(workflowId, ownerId);
  if (!workflow) {
    throw new McpToolError("NOT_FOUND", "Workflow not found");
  }
  return {
    workflow,
    graph: graphFromStored(workflow.graph),
  };
}

export function getRequestFieldSchema(graph: WorkflowGraph) {
  const requestNode = graph.nodes.find((node) => node.type === "request");
  if (!requestNode) return null;
  const fields =
    (requestNode.data as { dynamicFields?: Array<{ id: string; name: string; type: string; value: string }> })
      ?.dynamicFields ?? [];
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    currentValue: field.value,
  }));
}

export function mergeRequestValues(graph: WorkflowGraph, values?: Record<string, unknown>) {
  if (!values || Object.keys(values).length === 0) return graph;
  return applyRequestValuesToGraph(graph, values);
}

export async function findWorkflowForRun(identifier: string, ownerId: string) {
  return resolveWorkflowRef(identifier, ownerId);
}

export function graphSnapshotFromWorkflow(storedGraph: unknown, values?: Record<string, unknown>) {
  const graph = graphFromUnknown(storedGraph);
  return mergeRequestValues(graph, values);
}
