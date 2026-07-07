import { appendMediaUrlHints } from "@/lib/mediaUrlHints";
import {
  KlingV3ProInputSchema,
  KlingV3ProOutputSchema,
  type KlingV3ProInput,
  type KlingV3ProOutput,
} from "@galaxy/schemas";
import type { NodeProvider, ProviderContext, ProviderResult } from "../types";
import { resolveWebhookStubDelayMs, simulateWebhookWait } from "../webhookWait";

const DEFAULT_STUB_DELAY_MS = 3_000;
/** Direct MP4 — must allow anonymous GET (GCS gtv-videos-bucket samples are no longer public). */
const STUB_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
};

function buildStubVideoUrl(input: KlingV3ProInput, seed: string): string {
  const dimensions =
    ASPECT_RATIO_DIMENSIONS[input.aspect_ratio] ?? ASPECT_RATIO_DIMENSIONS["16:9"]!;
  const withHints = appendMediaUrlHints(STUB_VIDEO_URL, {
    durationSec: input.duration,
    width: dimensions.width,
    height: dimensions.height,
    bytes: 2_500_000,
  });
  return `${withHints}#${encodeURIComponent(seed)}`;
}

export async function executeKlingV3ProStub(
  input: KlingV3ProInput,
  ctx: ProviderContext,
): Promise<ProviderResult<KlingV3ProOutput>> {
  if (input.mode === "text_to_video" && !input.prompt.trim()) {
    throw new Error("Prompt is required for text-to-video generation.");
  }

  if (input.mode === "image_to_video") {
    if (!input.start_image_url) {
      throw new Error("Start frame image is required for image-to-video generation.");
    }
    if (!input.prompt.trim()) {
      throw new Error("Description is required for image-to-video generation.");
    }
  }

  const sleptMs = await simulateWebhookWait({
    tokenKey: `${ctx.workflowRunId}:${ctx.nodeId}:kling-v3-pro`,
    timeoutMs: 300_000,
    simulatedDelayMs: resolveWebhookStubDelayMs(DEFAULT_STUB_DELAY_MS),
  });

  const seed = `${ctx.workflowRunId}-${ctx.nodeId}-${input.prompt.slice(0, 32)}`;

  return {
    provider: "kling-v3-pro-stub",
    sleptMs,
    output: KlingV3ProOutputSchema.parse({
      result: {
        url: buildStubVideoUrl(input, seed),
        duration: input.duration,
        aspect_ratio: input.aspect_ratio,
      },
    }),
  };
}

export const klingV3ProStubProvider: NodeProvider<KlingV3ProInput, KlingV3ProOutput> = {
  id: "kling-v3-pro-stub",
  input: KlingV3ProInputSchema,
  output: KlingV3ProOutputSchema,
  execute: executeKlingV3ProStub,
};
