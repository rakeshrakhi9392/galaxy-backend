import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateMergeAvCredits,
  MergeAvInputSchema,
  MergeAvOutputSchema,
  mergeAvNodeUi,
} from "../../schemas/nodes/merge-av";

export * from "../../schemas/nodes/merge-av";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const mergeAvNode = defineNode({
  type: "merge-av",
  ui: mergeAvNodeUi,
  input: MergeAvInputSchema,
  output: MergeAvOutputSchema,
  estimateCredits: estimateMergeAvCredits,
  execute: async (mergeAvInput, ctx) => {
    const { validateMergeAvLimits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateMergeAvLimits(mergeAvInput));

    const { executeMergeAvProviders } = await import("@/providers/merge-av");
    const providerResult = await executeMergeAvProviders(
      mergeAvInput,
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
