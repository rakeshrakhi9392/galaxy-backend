import {
  MergeAvInputSchema,
  estimateMergeAvCredits,
  type MergeAvInput,
  type MergeAvOutput,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { resolveProviderChain } from "../resolveProviderChain";
import { mergeAvFfmpegProvider } from "./ffmpeg";

const DEFAULT_CHAIN = {
  providers: [mergeAvFfmpegProvider],
  timeoutMs: 300_000,
  retryPerProvider: 2,
};

export function estimateMergeAvNodeCredits(raw: unknown): number {
  const parsed = MergeAvInputSchema.partial().safeParse(raw);
  return estimateMergeAvCredits(parsed.success ? parsed.data : {});
}

export async function executeMergeAvProviders(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<MergeAvOutput>> {
  const input = MergeAvInputSchema.parse(rawInput);
  const chain = resolveProviderChain<MergeAvInput, MergeAvOutput>(nodeData, DEFAULT_CHAIN);
  return runProviderChain(chain, input, ctx, ctx.hooks);
}

export { mergeAvFfmpegProvider };
