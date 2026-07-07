import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuth } from "@/lib/auth/types";
import { toolErrorMessage } from "@/mcp/errors";
import {
  addNodeToGraph,
  connectNodesInGraph,
  deleteNodeFromGraph,
  disconnectNodesInGraph,
  updateNodeInGraph,
} from "@/mcp/graph/mutate";
import {
  createUserWorkflow,
  deleteUserWorkflow,
  getWorkflowDocument,
  listSystemWorkflows,
  listUserWorkflows,
  loadEditableGraph,
  saveWorkflowGraph,
  updateWorkflowMetadata,
} from "@/mcp/services/workflows";
import {
  cancelWorkflowRun,
  getRunStatus,
  listRuns,
  listWorkflowRuns,
  startWorkflowRun,
} from "@/mcp/services/runs";
import {
  estimateCreditsForNodes,
  estimateCreditsForWorkflow,
  getBalanceForUser,
  listNodeCatalog,
} from "@/mcp/services/catalog";
import { validateProviderLimitsForNode } from "@/schemas/providerInputLimitsServer";
import { isProviderLimitNodeType } from "@/schemas/providerInputLimits";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function toolHandler<T>(
  handler: (args: T) => Promise<unknown>,
): (args: T) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return async (args) => {
    try {
      return jsonResult(await handler(args));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: toolErrorMessage(error) }],
      };
    }
  };
}

const requestFieldSchema = z.object({
  name: z.string().min(1),
  type: z
    .enum(["text", "number", "boolean", "image", "audio", "video", "media", "file"])
    .default("text"),
  value: z.string().optional(),
});

export function createGalaxyMcpServer(auth: RequestAuth): McpServer {
  const ownerId = auth.userId;
  const server = new McpServer(
    {
      name: "galaxy-workflow-builder",
      version: "1.0.0",
      websiteUrl: "https://galaxy.ai/docs/mcp-server",
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    "validate_provider_limits",
    {
      title: "Validate provider input limits",
      description:
        "Check provider input limits for node configurations before running. Supports gpt-image-2, kling-v3-pro, llm, merge-video, merge-av, and extract-audio. Pass wiredInputCounts when list inputs come from upstream connections.",
      inputSchema: {
        nodes: z
          .array(
            z.object({
              nodeId: z.string().min(1),
              nodeType: z.string().min(1),
              label: z.string().optional(),
              inputs: z.record(z.string(), z.unknown()),
              wiredInputCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
            }),
          )
          .min(1),
      },
    },
    toolHandler(async (args) => {
      const issues = [];
      for (const node of args.nodes) {
        if (!isProviderLimitNodeType(node.nodeType)) continue;
        const violations = await validateProviderLimitsForNode(node.nodeType, node.inputs, {
          wiredInputCounts: node.wiredInputCounts,
        });
        if (violations.length === 0) continue;
        const label = node.label ?? node.nodeType;
        issues.push(
          ...violations.map((violation) => ({
            nodeId: node.nodeId,
            nodeType: node.nodeType,
            label,
            message: violation.message,
          })),
        );
      }
      return { issues };
    }),
  );

  server.registerTool(
    "get_balance",
    {
      title: "Get credit balance",
      description: "Return the authenticated user's current Galaxy credit balance.",
      inputSchema: {},
    },
    toolHandler(async () => getBalanceForUser(ownerId)),
  );

  server.registerTool(
    "estimate_credits",
    {
      title: "Estimate credits",
      description:
        "Estimate microcredits for a workflow graph or a list of node configurations before running.",
      inputSchema: {
        graph: z
          .object({
            nodes: z.array(z.record(z.string(), z.unknown())),
            edges: z.array(z.record(z.string(), z.unknown())),
          })
          .optional(),
        targetNodeIds: z.array(z.string()).optional(),
        nodes: z
          .array(
            z.object({
              type: z.string(),
              data: z.record(z.string(), z.unknown()).optional(),
              subModelId: z.string().optional(),
            }),
          )
          .optional(),
      },
    },
    toolHandler(async (args) => {
      if (args.graph) {
        return estimateCreditsForWorkflow(
          args.graph as Parameters<typeof estimateCreditsForWorkflow>[0],
          args.targetNodeIds ?? [],
        );
      }
      if (args.nodes?.length) {
        return estimateCreditsForNodes(args.nodes);
      }
      throw new Error("Provide graph or nodes.");
    }),
  );

  server.registerTool(
    "list_system_workflows",
    {
      title: "List system workflows",
      description: "Browse pre-built Galaxy workflow templates.",
      inputSchema: {},
    },
    toolHandler(async () => listSystemWorkflows()),
  );

  server.registerTool(
    "list_workflows",
    {
      title: "List workflows",
      description: "List saved user workflows with pagination.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
      },
    },
    toolHandler(async (args) =>
      listUserWorkflows(ownerId, args.page ?? 1, args.pageSize ?? 20),
    ),
  );

  server.registerTool(
    "get_workflow",
    {
      title: "Get workflow",
      description: "Fetch a workflow definition including nodes, edges, and metadata.",
      inputSchema: {
        workflowId: z.string().min(1),
      },
    },
    toolHandler(async (args) => getWorkflowDocument(args.workflowId, ownerId)),
  );

  server.registerTool(
    "create_workflow",
    {
      title: "Create workflow",
      description:
        "Create a workflow scaffolded with Request and Response nodes. Optionally define request input fields.",
      inputSchema: {
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        requestFields: z.array(requestFieldSchema).optional(),
      },
    },
    toolHandler(async (args) =>
      createUserWorkflow(ownerId, args.name, {
        description: args.description ?? null,
        requestFields: args.requestFields,
      }),
    ),
  );

  server.registerTool(
    "update_workflow",
    {
      title: "Update workflow metadata",
      description: "Rename or update description for a workflow. Does not modify nodes or edges.",
      inputSchema: {
        workflowId: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
      },
    },
    toolHandler(async (args) =>
      updateWorkflowMetadata(ownerId, args.workflowId, {
        name: args.name,
        description: args.description,
      }),
    ),
  );

  server.registerTool(
    "delete_workflow",
    {
      title: "Delete workflow",
      description: "Permanently delete a user workflow.",
      inputSchema: {
        workflowId: z.string().min(1),
      },
    },
    toolHandler(async (args) => deleteUserWorkflow(ownerId, args.workflowId)),
  );

  server.registerTool(
    "list_node_types",
    {
      title: "List node types",
      description: "List available workflow node types with input/output ports and categories.",
      inputSchema: {
        category: z.string().optional(),
      },
    },
    toolHandler(async (args) => ({ nodes: listNodeCatalog(args.category) })),
  );

  server.registerTool(
    "add_node",
    {
      title: "Add node",
      description: "Add a processing node to a workflow graph.",
      inputSchema: {
        workflowId: z.string().min(1),
        nodeType: z.string().min(1),
        column: z.number().int().nonnegative().optional(),
        row: z.number().int().nonnegative().optional(),
        inputs: z.record(z.string(), z.unknown()).optional(),
        label: z.string().optional(),
      },
    },
    toolHandler(async (args) => {
      const { graph } = await loadEditableGraph(ownerId, args.workflowId);
      const result = addNodeToGraph(graph, args.nodeType, {
        column: args.column,
        row: args.row,
        inputs: args.inputs,
        label: args.label,
      });
      const document = await saveWorkflowGraph(ownerId, args.workflowId, result.graph);
      return {
        workflow: document,
        nodeId: result.node.id,
        ports: result.ports,
      };
    }),
  );

  server.registerTool(
    "update_node",
    {
      title: "Update node inputs",
      description: "Update input values on an existing workflow node.",
      inputSchema: {
        workflowId: z.string().min(1),
        nodeId: z.string().min(1),
        inputs: z.record(z.string(), z.unknown()),
      },
    },
    toolHandler(async (args) => {
      const { graph } = await loadEditableGraph(ownerId, args.workflowId);
      const result = updateNodeInGraph(graph, args.nodeId, args.inputs);
      const document = await saveWorkflowGraph(ownerId, args.workflowId, result.graph);
      return { workflow: document, nodeId: args.nodeId };
    }),
  );

  server.registerTool(
    "connect_nodes",
    {
      title: "Connect nodes",
      description:
        "Create a validated edge between two nodes. Use handle IDs like in:prompt and out:output.",
      inputSchema: {
        workflowId: z.string().min(1),
        sourceNodeId: z.string().min(1),
        sourceHandle: z.string().min(1),
        targetNodeId: z.string().min(1),
        targetHandle: z.string().min(1),
      },
    },
    toolHandler(async (args) => {
      const { graph } = await loadEditableGraph(ownerId, args.workflowId);
      const result = connectNodesInGraph(
        graph,
        args.sourceNodeId,
        args.sourceHandle,
        args.targetNodeId,
        args.targetHandle,
      );
      const document = await saveWorkflowGraph(ownerId, args.workflowId, result.graph);
      return { workflow: document, edge: result.edge };
    }),
  );

  server.registerTool(
    "disconnect_nodes",
    {
      title: "Disconnect nodes",
      description: "Remove an edge by edgeId or source/target pair.",
      inputSchema: {
        workflowId: z.string().min(1),
        edgeId: z.string().optional(),
        sourceNodeId: z.string().optional(),
        targetNodeId: z.string().optional(),
      },
    },
    toolHandler(async (args) => {
      const { graph } = await loadEditableGraph(ownerId, args.workflowId);
      const nextGraph = disconnectNodesInGraph(graph, {
        edgeId: args.edgeId,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
      });
      const document = await saveWorkflowGraph(ownerId, args.workflowId, nextGraph);
      return { workflow: document };
    }),
  );

  server.registerTool(
    "delete_node",
    {
      title: "Delete node",
      description: "Remove a processing node and its connected edges from a workflow.",
      inputSchema: {
        workflowId: z.string().min(1),
        nodeId: z.string().min(1),
      },
    },
    toolHandler(async (args) => {
      const { graph } = await loadEditableGraph(ownerId, args.workflowId);
      const nextGraph = deleteNodeFromGraph(graph, args.nodeId);
      const document = await saveWorkflowGraph(ownerId, args.workflowId, nextGraph);
      return { workflow: document, deletedNodeId: args.nodeId };
    }),
  );

  server.registerTool(
    "start_run",
    {
      title: "Start workflow run",
      description:
        "Start a workflow by ID or name. Validates request node fields; returns field schema when values are missing.",
      inputSchema: {
        workflowIdOrName: z.string().min(1),
        values: z.record(z.string(), z.unknown()).optional(),
        targetNodeIds: z.array(z.string()).optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    toolHandler(async (args) =>
      startWorkflowRun({
        ownerId,
        workflowRef: args.workflowIdOrName,
        values: args.values,
        targetNodeIds: args.targetNodeIds,
        idempotencyKey: args.idempotencyKey,
        apiKeyId: auth.apiKeyId,
      }),
    ),
  );

  server.registerTool(
    "list_runs",
    {
      title: "List workflow runs",
      description: "List workflow runs with optional workflow and status filters.",
      inputSchema: {
        workflowId: z.string().optional(),
        status: z
          .enum(["QUEUED", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "SKIPPED"])
          .optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    toolHandler(async (args) =>
      args.workflowId
        ? listWorkflowRuns(ownerId, args.workflowId, args.limit ?? 50)
        : listRuns(ownerId, {
            workflowId: args.workflowId,
            status: args.status,
            limit: args.limit,
          }),
    ),
  );

  server.registerTool(
    "get_run_status",
    {
      title: "Get run status",
      description:
        "Fetch workflow run status, per-node progress, and final response outputs. Poll while stillRunning is true.",
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    toolHandler(async (args) => getRunStatus(ownerId, args.runId)),
  );

  server.registerTool(
    "cancel_run",
    {
      title: "Cancel workflow run",
      description: "Cancel a queued or running workflow run.",
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    toolHandler(async (args) => cancelWorkflowRun(ownerId, args.runId)),
  );

  return server;
}
