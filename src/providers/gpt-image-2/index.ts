import {
  GptImage2InputSchema,
  GptImage2InputSchemaObject,
  estimateGptImage2Credits,
  type GptImage2Input,
  type GptImage2Output,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { resolveProviderChain } from "../resolveProviderChain";
import { gptImage2StubProvider } from "./stub";

const DEFAULT_CHAIN = {
  providers: [gptImage2StubProvider],
  timeoutMs: 120_000,
  retryPerProvider: 2,
};

export function estimateGptImage2NodeCredits(raw: unknown): number {
  const parsed = GptImage2InputSchemaObject.partial().safeParse(raw);
  return estimateGptImage2Credits(parsed.success ? parsed.data : {});
}

export async function executeGptImage2Providers(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<GptImage2Output>> {
  const input = GptImage2InputSchema.parse(rawInput);
  const chain = resolveProviderChain<GptImage2Input, GptImage2Output>(nodeData, DEFAULT_CHAIN);
  return runProviderChain(chain, input, ctx, ctx.hooks);
}

export { gptImage2StubProvider };

