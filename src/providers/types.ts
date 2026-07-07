import type { z } from "zod";

export type {
  ProviderAttemptRecord,
  ProviderContext,
  RunProviderChainHooks,
} from "./contextTypes";

export type ProviderResult<TOutput> = {
  provider: string;
  output: TOutput;
  sleptMs: number;
};

export type NodeProvider<TInput, TOutput> = {
  id: string;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  execute: (input: TInput, ctx: ProviderContext) => Promise<ProviderResult<TOutput>>;
};

export type ProviderChainConfig<TInput, TOutput> = {
  providers: NodeProvider<TInput, TOutput>[];
  timeoutMs?: number;
  retryPerProvider?: number;
};
