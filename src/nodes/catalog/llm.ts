import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateOpenRouterLlmCredits,
  OpenRouterLlmInputSchema,
  OpenRouterLlmOutputSchema,
  openrouterLlmNodeUi,
} from "../../schemas/nodes/openrouter-llm";

export * from "../../schemas/nodes/openrouter-llm";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const llmNode = defineNode({
  type: "llm",
  ui: openrouterLlmNodeUi,
  input: OpenRouterLlmInputSchema,
  output: OpenRouterLlmOutputSchema,
  estimateCredits: estimateOpenRouterLlmCredits,
  execute: async (llmInput, ctx) => {
    const { validateOpenRouterLlmLimits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateOpenRouterLlmLimits(llmInput));

    const { executeOpenRouterLlmProviders } = await import("@/providers/openrouter-llm");
    const providerResult = await executeOpenRouterLlmProviders(
      llmInput,
      ctx.providerCtx,
      ctx.nodeData,
    );

    return {
      output: providerResult.output,
      sleptMs: providerResult.sleptMs,
      provider: providerResult.provider,
    };
  },
});
