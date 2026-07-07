import type { ProviderAttemptStatus } from "@prisma/client";
import type { NodeRunLogBuffer } from "@/lib/nodeRunLog";

/** Frontend-safe provider execution context (no server runtime imports). */
export type ProviderAttemptRecord = {
  provider: string;
  status: ProviderAttemptStatus;
  durationMs: number;
  error?: string;
  errorCode?: string;
};

export type RunProviderChainHooks = {
  onAttempt?: (attempt: ProviderAttemptRecord) => Promise<void>;
};

export type ProviderContext = {
  workflowRunId: string;
  nodeId: string;
  nodeRunId?: string;
  /** OpenRouter model id from node `config.model` (e.g. `google/gemini-2.0-flash-exp:free`). */
  model?: string;
  hooks?: RunProviderChainHooks;
  log?: NodeRunLogBuffer;
};
