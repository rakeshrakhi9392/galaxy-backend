import {

  GptImage2InputSchema,

  GptImage2OutputSchema,

  resolveGptImage2Dimensions,

  type GptImage2Input,

  type GptImage2Output,

} from "@galaxy/schemas";

import type { NodeProvider, ProviderContext, ProviderResult } from "../types";

import { resolveWebhookStubDelayMs, simulateWebhookWait } from "../webhookWait";

const DEFAULT_STUB_DELAY_MS = 3_000;



const STUB_IMAGE_BASE =

  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1024&q=80";



function buildStubUrl(seed: string, width: number, height: number): string {

  return `${STUB_IMAGE_BASE}&sig=${encodeURIComponent(seed)}&w=${width}&h=${height}`;

}



export async function executeGptImage2Stub(

  input: GptImage2Input,

  ctx: ProviderContext,

): Promise<ProviderResult<GptImage2Output>> {

  if (input.mode === "text_to_image" && !input.prompt.trim()) {

    throw new Error("Prompt is required for text-to-image generation.");

  }



  if (input.mode === "image_to_image" && !input.image) {

    throw new Error("Image input is required for image-to-image generation.");

  }



  const sleptMs = await simulateWebhookWait({

    tokenKey: `${ctx.workflowRunId}:${ctx.nodeId}:gpt-image-2`,

    timeoutMs: 120_000,

    simulatedDelayMs: resolveWebhookStubDelayMs(DEFAULT_STUB_DELAY_MS),

  });



  const { width, height } = resolveGptImage2Dimensions(input.size);

  const images = Array.from({ length: input.n }, (_, index) => {

    const seed = `${ctx.workflowRunId}-${ctx.nodeId}-${index}-${input.prompt.slice(0, 32)}`;

    return {

      url: buildStubUrl(seed, width, height),

      width,

      height,

    };

  });



  return {

    provider: "openai-gpt-image-2-stub",

    sleptMs,

    output: GptImage2OutputSchema.parse({ result: images }),

  };

}



export const gptImage2StubProvider: NodeProvider<GptImage2Input, GptImage2Output> = {

  id: "openai-gpt-image-2-stub",

  input: GptImage2InputSchema,

  output: GptImage2OutputSchema,

  execute: executeGptImage2Stub,

};


