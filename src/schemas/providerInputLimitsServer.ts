/**
 * Server-only provider limit validation (HEAD + ffprobe).
 * Do not export from @galaxy/schemas — keeps Node APIs out of the frontend bundle.
 */
import type { GptImage2Input } from "./nodes/gpt-image-2";
import type { KlingV3ProInput } from "./nodes/kling-v3-pro";
import type { OpenRouterLlmInput } from "./nodes/openrouter-llm";
import type { MergeVideoInput } from "./nodes/merge-video";
import type { MergeAvInput } from "./nodes/merge-av";
import type { ExtractAudioInput } from "./nodes/extract-audio";
import {
  maxDimension,
  parseMediaUrlHints,
  parseSizeEnumDimensions,
  type MediaMetadataCache,
} from "../lib/mediaUrlHints";
import {
  PROVIDER_INPUT_LIMITS,
  blobUrlViolation,
  checkResolvedBytes,
  checkResolvedDuration,
  checkResolvedResolution,
  effectiveMergeVideoInputCount,
  type ProviderLimitValidationOptions,
  type ProviderLimitViolation,
} from "./providerInputLimits";

function textLength(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function urlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type MediaCheckRequirements = {
  bytes: boolean;
  duration: boolean;
  resolution: boolean;
};

async function loadMediaMetadataCache(): Promise<MediaMetadataCache> {
  const { createMediaMetadataCache } = await import("../lib/mediaUrlMetadata");
  return createMediaMetadataCache();
}

async function checkMediaUrl(
  getMetadata: MediaMetadataCache | null,
  url: string,
  field: string,
  label: string,
  limits: {
    maxBytes?: number;
    maxDurationSec?: number;
    maxResolutionPx?: number;
  },
  requirements: MediaCheckRequirements,
  /** When false, skip "unable to verify" errors but still enforce limits when metadata is known. */
  failClosed = true,
): Promise<ProviderLimitViolation[]> {
  if (!url || url.trim().length === 0) return [];
  if (url.startsWith("blob:")) return [blobUrlViolation(field, label)];

  const metadata = getMetadata ? await getMetadata(url) : parseMediaUrlHints(url);
  const issues: ProviderLimitViolation[] = [];

  if (requirements.bytes && limits.maxBytes !== undefined) {
    issues.push(...checkResolvedBytes(metadata, field, label, limits.maxBytes, failClosed));
  }
  if (requirements.duration && limits.maxDurationSec !== undefined) {
    issues.push(
      ...checkResolvedDuration(metadata, field, label, limits.maxDurationSec, failClosed),
    );
  }
  if (requirements.resolution && limits.maxResolutionPx !== undefined) {
    issues.push(
      ...checkResolvedResolution(metadata, field, label, limits.maxResolutionPx, failClosed),
    );
  }

  return issues;
}

export async function validateGptImage2Limits(
  input: GptImage2Input,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS["gpt-image-2"];
  const issues: ProviderLimitViolation[] = [];
  const getMetadata = await loadMediaMetadataCache();

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({
      field: "prompt",
      message: `Prompt exceeds ${limits.promptMaxLength} character limit.`,
    });
  }

  const imageCount = numberValue(input.n);
  if (imageCount !== undefined && imageCount > limits.maxImages) {
    issues.push({
      field: "n",
      message: `Number of images cannot exceed ${limits.maxImages}.`,
    });
  }

  const outputDimensions = parseSizeEnumDimensions(input.size);
  if (outputDimensions) {
    const largestSide = maxDimension(outputDimensions.width, outputDimensions.height);
    if (largestSide !== null && largestSide > limits.maxResolutionPx) {
      issues.push({
        field: "size",
        message: `Output size ${input.size} exceeds ${limits.maxResolutionPx}px resolution limit.`,
      });
    }
  }

  if (input.image) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        input.image,
        "image",
        "Image",
        { maxBytes: limits.imageMaxBytes, maxResolutionPx: limits.maxResolutionPx },
        { bytes: true, duration: false, resolution: true },
      )),
    );
  }

  return issues;
}

export async function validateKlingV3ProLimits(
  input: KlingV3ProInput,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS["kling-v3-pro"];
  const issues: ProviderLimitViolation[] = [];
  const getMetadata = await loadMediaMetadataCache();

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({
      field: "prompt",
      message: `Prompt exceeds ${limits.promptMaxLength} character limit.`,
    });
  }

  if (textLength(input.negative_prompt) > limits.negativePromptMaxLength) {
    issues.push({
      field: "negative_prompt",
      message: `Negative prompt exceeds ${limits.negativePromptMaxLength} character limit.`,
    });
  }

  const duration = numberValue(input.duration);
  if (duration !== undefined && duration > limits.maxDurationSec) {
    issues.push({
      field: "duration",
      message: `Duration cannot exceed ${limits.maxDurationSec} seconds.`,
    });
  }

  for (const [url, field, label] of [
    [input.start_image_url, "start_image_url", "Start frame"],
    [input.end_image_url, "end_image_url", "End frame"],
  ] as const) {
    if (!url) continue;
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        url,
        field,
        label,
        { maxBytes: limits.imageMaxBytes, maxResolutionPx: limits.maxResolutionPx },
        { bytes: true, duration: false, resolution: true },
      )),
    );
  }

  return issues;
}

export async function validateOpenRouterLlmLimits(
  input: OpenRouterLlmInput,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS.llm;
  const issues: ProviderLimitViolation[] = [];
  const getMetadata = await loadMediaMetadataCache();

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({
      field: "prompt",
      message: `Prompt exceeds ${limits.promptMaxLength} character limit.`,
    });
  }

  if (textLength(input.system_prompt) > limits.systemPromptMaxLength) {
    issues.push({
      field: "system_prompt",
      message: `System prompt exceeds ${limits.systemPromptMaxLength} character limit.`,
    });
  }

  const maxTokens = numberValue(input.max_tokens);
  if (maxTokens !== undefined && maxTokens > limits.maxTokens) {
    issues.push({
      field: "max_tokens",
      message: `Max tokens cannot exceed ${limits.maxTokens}.`,
    });
  }

  const imageUrls = urlList(input.image_urls);
  const videoUrls = urlList(input.video_urls);
  const audioUrls = urlList(input.audio_urls);
  const mediaCount = imageUrls.length + videoUrls.length + audioUrls.length;
  if (mediaCount > limits.maxMediaUrls) {
    issues.push({
      field: "media",
      message: `Total media URLs cannot exceed ${limits.maxMediaUrls}.`,
    });
  }

  for (const url of imageUrls) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        url,
        "image_urls",
        "An image input",
        { maxBytes: limits.imageMaxBytes, maxResolutionPx: limits.imageMaxResolutionPx },
        { bytes: true, duration: false, resolution: true },
      )),
    );
  }

  for (const url of videoUrls) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        url,
        "video_urls",
        "A video input",
        {
          maxBytes: limits.videoMaxBytes,
          maxDurationSec: limits.videoMaxDurationSec,
          maxResolutionPx: limits.videoMaxResolutionPx,
        },
        { bytes: true, duration: true, resolution: true },
      )),
    );
  }

  for (const url of audioUrls) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        url,
        "audio_urls",
        "An audio input",
        { maxBytes: limits.audioMaxBytes, maxDurationSec: limits.audioMaxDurationSec },
        { bytes: true, duration: true, resolution: false },
      )),
    );
  }

  return issues;
}

export async function validateMergeVideoLimits(
  input: MergeVideoInput,
  options?: ProviderLimitValidationOptions,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS["merge-video"];
  const issues: ProviderLimitViolation[] = [];
  const count = effectiveMergeVideoInputCount(input, options);
  const getMetadata = await loadMediaMetadataCache();

  if (count < limits.minVideos) {
    issues.push({
      field: "video_urls",
      message: `At least ${limits.minVideos} video inputs are required.`,
    });
  }

  const videoUrls = urlList(input.video_urls);
  if (videoUrls.length > limits.maxVideos) {
    issues.push({
      field: "video_urls",
      message: `Cannot merge more than ${limits.maxVideos} videos.`,
    });
  }

  for (const url of videoUrls) {
    const urlIssues = await checkMediaUrl(
      getMetadata,
      url,
      "video_urls",
      "A video input",
      {
        maxBytes: limits.maxVideoBytes,
        maxDurationSec: limits.maxDurationSec,
        maxResolutionPx: limits.maxResolutionPx,
      },
      { bytes: true, duration: true, resolution: true },
    );
    if (urlIssues.length > 0) {
      issues.push(...urlIssues);
      break;
    }
  }

  return issues;
}

export async function validateMergeAvLimits(
  input: MergeAvInput,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS["merge-av"];
  const issues: ProviderLimitViolation[] = [];
  const getMetadata = await loadMediaMetadataCache();

  if (input.video_url) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        input.video_url,
        "video_url",
        "Video",
        {
          maxBytes: limits.maxVideoBytes,
          maxDurationSec: limits.maxDurationSec,
          maxResolutionPx: limits.maxVideoResolutionPx,
        },
        { bytes: true, duration: true, resolution: true },
        false,
      )),
    );
  }

  if (input.audio_url) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        input.audio_url,
        "audio_url",
        "Audio",
        { maxBytes: limits.maxAudioBytes, maxDurationSec: limits.audioMaxDurationSec },
        { bytes: true, duration: true, resolution: false },
        false,
      )),
    );
  }

  return issues;
}

export async function validateExtractAudioLimits(
  input: ExtractAudioInput,
): Promise<ProviderLimitViolation[]> {
  const limits = PROVIDER_INPUT_LIMITS["extract-audio"];
  const issues: ProviderLimitViolation[] = [];
  const getMetadata = await loadMediaMetadataCache();

  if (input.video_url) {
    issues.push(
      ...(await checkMediaUrl(
        getMetadata,
        input.video_url,
        "video_url",
        "Video",
        {
          maxBytes: limits.maxVideoBytes,
          maxDurationSec: limits.maxDurationSec,
          maxResolutionPx: limits.maxResolutionPx,
        },
        { bytes: true, duration: true, resolution: true },
      )),
    );
  }

  return issues;
}

export async function validateProviderLimitsForNode(
  nodeType: string,
  input: unknown,
  options?: ProviderLimitValidationOptions,
): Promise<ProviderLimitViolation[]> {
  switch (nodeType) {
    case "gpt-image-2":
      return validateGptImage2Limits(input as GptImage2Input);
    case "kling-v3-pro":
      return validateKlingV3ProLimits(input as KlingV3ProInput);
    case "llm":
      return validateOpenRouterLlmLimits(input as OpenRouterLlmInput);
    case "merge-video":
      return validateMergeVideoLimits(input as MergeVideoInput, options);
    case "merge-av":
      return validateMergeAvLimits(input as MergeAvInput);
    case "extract-audio":
      return validateExtractAudioLimits(input as ExtractAudioInput);
    default:
      return [];
  }
}
