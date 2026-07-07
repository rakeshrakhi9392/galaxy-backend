import {
  OPENROUTER_LLM_MODEL,
  OpenRouterLlmInputSchema,
  OpenRouterLlmInputSchemaObject,
  estimateOpenRouterLlmCredits,
  type OpenRouterLlmInput,
  type OpenRouterLlmOutput,
} from "@galaxy/schemas";
import type { ProviderContext, ProviderResult } from "../types";
import { runProviderChain } from "../runProviderChain";
import { parseNodeProviderConfig, resolveProviderChain } from "../resolveProviderChain";
import {
  OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
  openrouterGeminiFlashProvider,
} from "./openrouter";

const DEFAULT_CHAIN = {
  providers: [openrouterGeminiFlashProvider],
  timeoutMs: 120_000,
  retryPerProvider: 2,
};

/** Legacy node configs may still reference older provider ids. */
const LEGACY_PROVIDER_ALIASES: Record<string, string> = {
  "gemini-flash-latest": OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
  "openrouter-gemini-flash-latest-stub": OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
  "openrouter-gemini-3.1-pro-preview": OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
};

export function estimateOpenRouterLlmNodeCredits(raw: unknown): number {
  const parsed = OpenRouterLlmInputSchemaObject.partial().safeParse(raw);
  return estimateOpenRouterLlmCredits(parsed.success ? parsed.data : {});
}

export async function executeOpenRouterLlmProviders(
  rawInput: unknown,
  ctx: ProviderContext,
  nodeData?: unknown,
): Promise<ProviderResult<OpenRouterLlmOutput>> {
  const input = OpenRouterLlmInputSchema.parse(rawInput);
  const providerConfig = parseNodeProviderConfig(nodeData, {
    providers: DEFAULT_CHAIN.providers.map((provider) => provider.id),
    timeoutMs: DEFAULT_CHAIN.timeoutMs,
    retryPerProvider: DEFAULT_CHAIN.retryPerProvider,
    model: OPENROUTER_LLM_MODEL,
  });
  const chain = resolveProviderChain<OpenRouterLlmInput, OpenRouterLlmOutput>(
    nodeData,
    DEFAULT_CHAIN,
    {
      catalog: DEFAULT_CHAIN.providers,
      aliases: LEGACY_PROVIDER_ALIASES,
    },
  );
  const ctxWithModel: ProviderContext = {
    ...ctx,
    model: providerConfig.model?.trim() || OPENROUTER_LLM_MODEL,
  };
  return runProviderChain(chain, input, ctxWithModel, ctx.hooks);
}

export { openrouterGeminiFlashProvider };
export { OPENROUTER_GEMINI_FLASH_PROVIDER_ID } from "./openrouter";
