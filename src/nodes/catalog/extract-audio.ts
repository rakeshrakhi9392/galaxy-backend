import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateExtractAudioCredits,
  ExtractAudioInputSchema,
  ExtractAudioOutputSchema,
  extractAudioNodeUi,
} from "../../schemas/nodes/extract-audio";

export * from "../../schemas/nodes/extract-audio";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const extractAudioNode = defineNode({
  type: "extract-audio",
  ui: extractAudioNodeUi,
  input: ExtractAudioInputSchema,
  output: ExtractAudioOutputSchema,
  estimateCredits: estimateExtractAudioCredits,
  execute: async (extractInput, ctx) => {
    const { validateExtractAudioLimits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateExtractAudioLimits(extractInput));

    const { executeExtractAudioProviders } = await import("@/providers/extract-audio");
    const providerResult = await executeExtractAudioProviders(
      extractInput,
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
