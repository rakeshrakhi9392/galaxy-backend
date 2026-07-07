import { z } from "zod";
import {
  CATALOG_NODE_TYPES,
  type CatalogNodeType,
  type NodeOutputFor,
} from "@galaxy/schemas";
import type { WorkflowGraph, WorkflowNode } from "@galaxy/schemas";
import { getNodeDefinition } from "@/nodes/registry";
import { buildProviderContext } from "@/nodes/executeContext";
import { parseNodeInputs } from "@/lib/parseNodeInputs";
import { resolveNodeInputs } from "@/lib/resolveNodeInputs";
import { validateRequestNodeData } from "@galaxy/schemas";
import {
  createNodeRunLogBuffer,
  errorWithLogPreview,
} from "@/lib/nodeRunLog";

function nodeDataFromInput(parsed: ExecuteNodeInput): unknown {
  return parsed.node?.data ?? parsed.nodeData;
}

export const ExecuteNodeInputSchema = z.object({
  workflowRunId: z.string().min(1),
  nodeRunId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  nodeType: z.enum(CATALOG_NODE_TYPES),
  node: z.custom<WorkflowNode>().optional(),
  graph: z.custom<WorkflowGraph>().optional(),
  nodeData: z.unknown().optional(),
  resolvedInputs: z.record(z.string(), z.unknown()).optional(),
  upstream: z.record(z.string(), z.unknown()).optional(),
});

export type ExecuteNodeInput = z.infer<typeof ExecuteNodeInputSchema>;

/** Wire format returned from per-node Trigger tasks — validated at the batch boundary. */
export const ExecuteNodeOutputSchema = z.object({
  ok: z.literal(true),
  nodeId: z.string(),
  nodeType: z.enum(CATALOG_NODE_TYPES),
  sleptMs: z.number(),
  output: z.unknown(),
  provider: z.string().nullable(),
  logPreview: z.string().optional(),
});

export type ExecuteNodeOutput = z.infer<typeof ExecuteNodeOutputSchema>;

/** Narrow `output` after matching `nodeType`. */
export type ExecuteNodeOutputFor<T extends CatalogNodeType> = ExecuteNodeOutput & {
  nodeType: T;
  output: NodeOutputFor<T>;
};

/**
 * Execute a node via its registry definition (`def.execute`).
 * Adding a node type only requires wiring `execute` on that definition — no switch here.
 */
export async function executeNode(input: ExecuteNodeInput): Promise<ExecuteNodeOutput> {
  const parsed = ExecuteNodeInputSchema.parse(input);
  const def = getNodeDefinition(parsed.nodeType);
  const nodeData = nodeDataFromInput(parsed);
  const log = createNodeRunLogBuffer();
  log.info(`Starting ${parsed.nodeType} (${parsed.nodeId})`);

  const resolvedInputs =
    parsed.resolvedInputs ??
    (parsed.node && parsed.graph
      ? resolveNodeInputs({
          node: parsed.node,
          graph: parsed.graph,
          outputsByNodeId: parsed.upstream ?? {},
        })
      : {});

  try {
    if (parsed.nodeType === "request") {
      validateRequestNodeData(nodeData);
    }

    const validatedInputs = parseNodeInputs(def, resolvedInputs);
    const result = await def.execute(validatedInputs, {
      workflowRunId: parsed.workflowRunId,
      nodeId: parsed.nodeId,
      nodeRunId: parsed.nodeRunId,
      nodeType: parsed.nodeType,
      nodeData,
      node: parsed.node,
      graph: parsed.graph,
      upstreamOutputs: parsed.upstream,
      providerCtx: buildProviderContext({
        workflowRunId: parsed.workflowRunId,
        nodeId: parsed.nodeId,
        nodeRunId: parsed.nodeRunId,
        log,
      }),
    });

    log.info(`Finished via ${result.provider ?? "local"} in ${result.sleptMs}ms`);

    const output = {
      ok: true as const,
      nodeId: parsed.nodeId,
      nodeType: parsed.nodeType,
      sleptMs: result.sleptMs,
      output: def.output.parse(result.output),
      provider: result.provider,
      logPreview: log.toPreview(),
    };

    return ExecuteNodeOutputSchema.parse(output);
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    throw errorWithLogPreview(error, log.toPreview());
  }
}
