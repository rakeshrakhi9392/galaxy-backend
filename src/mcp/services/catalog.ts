import {
  buildCreditBalanceResponse,
  estimateNodesMicrocredits,
  estimateWorkflowGraphMicrocredits,
  formatMicrocreditBalance,
} from "@/lib/creditEstimateApi";
import { getCreditBalance } from "@/lib/creditsLedger";
import { listNodeTypesForMcp } from "@/mcp/graph/mutate";
import type { WorkflowGraph } from "@galaxy/schemas";

export async function getBalanceForUser(userId: string) {
  const availableBalance = await getCreditBalance(userId);
  return buildCreditBalanceResponse(availableBalance);
}

export function estimateCreditsForWorkflow(graph: WorkflowGraph, targetNodeIds: string[] = []) {
  return estimateWorkflowGraphMicrocredits(graph, targetNodeIds);
}

export function estimateCreditsForNodes(
  nodes: Array<{ type: string; data?: Record<string, unknown>; subModelId?: string }>,
) {
  return estimateNodesMicrocredits(nodes);
}

export function formatCredits(microcredits: number) {
  return formatMicrocreditBalance(microcredits);
}

export function listNodeCatalog(category?: string) {
  return listNodeTypesForMcp(category);
}
