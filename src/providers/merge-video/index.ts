import {
  MergeVideoInputSchema,
  estimateMergeVideoCredits,
  type MergeVideoInput,
  type MergeVideoOutput,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { resolveProviderChain } from "../resolveProviderChain";
import { mergeVideoFfmpegProvider } from "./ffmpeg";

const DEFAULT_CHAIN = {
  providers: [mergeVideoFfmpegProvider],
  timeoutMs: 300_000,
  retryPerProvider: 2,
};

export function estimateMergeVideoNodeCredits(raw: unknown): number {
  const parsed = MergeVideoInputSchema.partial().safeParse(raw);
  return estimateMergeVideoCredits(parsed.success ? parsed.data : {});
}

export async function executeMergeVideoProviders(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<MergeVideoOutput>> {
  const input = MergeVideoInputSchema.parse(rawInput);
  const chain = resolveProviderChain<MergeVideoInput, MergeVideoOutput>(nodeData, DEFAULT_CHAIN);
  return runProviderChain(chain, input, ctx, ctx.hooks);
}

export { mergeVideoFfmpegProvider };
