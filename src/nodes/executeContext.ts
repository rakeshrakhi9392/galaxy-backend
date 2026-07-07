/**
 * Backend-only provider context (Prisma attempt logging).
 * Do not import this module from @galaxy/schemas / catalog paths used by the frontend.
 */
import type { ProviderContext } from "../providers/contextTypes";
import type { RunProviderChainHooks } from "../providers/contextTypes";
import type { NodeRunLogBuffer } from "@/lib/nodeRunLog";

export type {
  NodeExecuteContext,
  NodeExecuteResult,
} from "./executeShared";

export {
  assertNoLimitViolations,
  executeLocalNode,
} from "./executeShared";

function providerAttemptHooks(
  nodeRunId: string | undefined,
  log?: NodeRunLogBuffer,
): RunProviderChainHooks | undefined {
  if (!nodeRunId) return log ? { onAttempt: async (attempt) => logAttempt(log, attempt) } : undefined;
  return {
    onAttempt: async (attempt) => {
      logAttempt(log, attempt);
      const { prisma } = await import("../lib/prisma");
      await prisma.providerAttempt.create({
        data: {
          nodeRunId,
          provider: attempt.provider,
          status: attempt.status,
          durationMs: attempt.durationMs,
          error: attempt.error,
          errorCode: attempt.errorCode,
        },
      });
    },
  };
}

function logAttempt(
  log: NodeRunLogBuffer | undefined,
  attempt: {
    provider: string;
    status: string;
    error?: string;
    errorCode?: string;
    durationMs: number;
  },
) {
  if (!log) return;
  const suffix = attempt.error ? `: ${attempt.error}` : "";
  const code = attempt.errorCode ? ` (${attempt.errorCode})` : "";
  const line = `Provider ${attempt.provider} ${attempt.status}${code}${suffix} in ${attempt.durationMs}ms`;
  if (attempt.status === "SUCCESS") {
    log.info(line);
  } else if (attempt.status === "TIMEOUT") {
    log.warn(line);
  } else {
    log.error(line);
  }
}

export function buildProviderContext(input: {
  workflowRunId: string;
  nodeId: string;
  nodeRunId?: string;
  log?: NodeRunLogBuffer;
}): ProviderContext {
  return {
    workflowRunId: input.workflowRunId,
    nodeId: input.nodeId,
    nodeRunId: input.nodeRunId,
    log: input.log,
    hooks: providerAttemptHooks(input.nodeRunId, input.log),
  };
}
