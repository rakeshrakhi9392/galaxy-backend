import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateKlingV3ProCredits,
  KlingV3ProInputSchema,
  KlingV3ProOutputSchema,
  klingV3ProNodeUi,
  normalizeKlingV3ProInputs,
} from "../../schemas/nodes/kling-v3-pro";

export * from "../../schemas/nodes/kling-v3-pro";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const klingV3ProNode = defineNode({
  type: "kling-v3-pro",
  ui: klingV3ProNodeUi,
  input: KlingV3ProInputSchema,
  output: KlingV3ProOutputSchema,
  prepareInputs: normalizeKlingV3ProInputs,
  estimateCredits: estimateKlingV3ProCredits,
  execute: async (klingInput, ctx) => {
    const { validateKlingV3ProLimits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateKlingV3ProLimits(klingInput));

    const { executeKlingV3ProProviders } = await import("@/providers/kling-v3-pro");
    const providerResult = await executeKlingV3ProProviders(
      klingInput,
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
