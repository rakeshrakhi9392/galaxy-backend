import { assertNoLimitViolations } from "../executeShared";
import { defineNode } from "../types";
import {
  estimateGptImage2Credits,
  GptImage2InputSchema,
  GptImage2OutputSchema,
  gptImage2NodeUi,
} from "../../schemas/nodes/gpt-image-2";

export * from "../../schemas/nodes/gpt-image-2";

/** Server-only catalog entry: schemas/UI live in @galaxy/schemas; execute stays here. */
export const gptImage2Node = defineNode({
  type: "gpt-image-2",
  ui: gptImage2NodeUi,
  input: GptImage2InputSchema,
  output: GptImage2OutputSchema,
  estimateCredits: estimateGptImage2Credits,
  execute: async (gptInput, ctx) => {
    const { validateGptImage2Limits } = await import("@/schemas/providerInputLimitsServer");
    await assertNoLimitViolations(ctx.nodeType, validateGptImage2Limits(gptInput));

    const { executeGptImage2Providers } = await import("@/providers/gpt-image-2");
    const providerResult = await executeGptImage2Providers(
      gptInput,
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
