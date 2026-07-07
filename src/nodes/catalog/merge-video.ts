import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateMergeVideoCredits,
  MergeVideoInputSchema,
  MergeVideoOutputSchema,
  mergeVideoNodeUi,
} from "../../schemas/nodes/merge-video";

export * from "../../schemas/nodes/merge-video";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const mergeVideoNode = defineNode({
  type: "merge-video",
  ui: mergeVideoNodeUi,
  input: MergeVideoInputSchema,
  output: MergeVideoOutputSchema,
  estimateCredits: estimateMergeVideoCredits,
  execute: async (mergeVideoInput, ctx) => {
    const { validateMergeVideoLimits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateMergeVideoLimits(mergeVideoInput));

    const { executeMergeVideoProviders } = await import("@/providers/merge-video");
    const providerResult = await executeMergeVideoProviders(
      mergeVideoInput,
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
