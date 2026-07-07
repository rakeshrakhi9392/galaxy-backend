import {
  KlingV3ProInputSchema,
  estimateKlingV3ProCredits,
  type KlingV3ProInput,
  type KlingV3ProOutput,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { resolveProviderChain } from "../resolveProviderChain";
import { klingV3ProStubProvider } from "./stub";

const DEFAULT_CHAIN = {
  providers: [klingV3ProStubProvider],
  timeoutMs: 300_000,
  retryPerProvider: 2,
};

export function estimateKlingV3ProNodeCredits(raw: unknown): number {
  const parsed = KlingV3ProInputSchema.partial().safeParse(raw);
  return estimateKlingV3ProCredits(parsed.success ? parsed.data : {});
}

export async function executeKlingV3ProProviders(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<KlingV3ProOutput>> {
  const input = KlingV3ProInputSchema.parse(rawInput);
  const chain = resolveProviderChain<KlingV3ProInput, KlingV3ProOutput>(nodeData, DEFAULT_CHAIN);
  return runProviderChain(chain, input, ctx, ctx.hooks);
}

export { klingV3ProStubProvider };
