import {
  ExtractAudioInputSchema,
  estimateExtractAudioCredits,
  type ExtractAudioInput,
  type ExtractAudioOutput,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { resolveProviderChain } from "../resolveProviderChain";
import { extractAudioFfmpegProvider } from "./ffmpeg";

const DEFAULT_CHAIN = {
  providers: [extractAudioFfmpegProvider],
  timeoutMs: 300_000,
  retryPerProvider: 2,
};

export function estimateExtractAudioNodeCredits(raw: unknown): number {
  const parsed = ExtractAudioInputSchema.partial().safeParse(raw);
  return estimateExtractAudioCredits(parsed.success ? parsed.data : {});
}

export async function executeExtractAudioProviders(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<ExtractAudioOutput>> {
  const input = ExtractAudioInputSchema.parse(rawInput);
  const chain = resolveProviderChain<ExtractAudioInput, ExtractAudioOutput>(nodeData, DEFAULT_CHAIN);
  return runProviderChain(chain, input, ctx, ctx.hooks);
}

export { extractAudioFfmpegProvider };
