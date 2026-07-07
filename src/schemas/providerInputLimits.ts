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
  type MediaUrlMetadata,
} from "../lib/mediaUrlHints";

export type ProviderLimitViolation = {
  field: string;
  message: string;
};

/** Optional context for pre-run validation when list inputs are wired but not resolved yet. */
export type ProviderLimitValidationOptions = {
  wiredInputCounts?: Partial<Record<string, number>>;
};

const MB = 1024 * 1024;

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

/** Node types that enforce provider input limits. */
export const PROVIDER_LIMIT_NODE_TYPES = [
  "gpt-image-2",
  "kling-v3-pro",
  "llm",
  "merge-video",
  "merge-av",
  "extract-audio",
] as const;

export type ProviderLimitNodeType = (typeof PROVIDER_LIMIT_NODE_TYPES)[number];

/** Conservative provider limits mirrored from typical Galaxy provider caps. */
export const PROVIDER_INPUT_LIMITS = {
  "gpt-image-2": {
    promptMaxLength: 4000,
    imageMaxBytes: 20 * MB,
    maxImages: 4,
    maxResolutionPx: 3840,
  },
  "kling-v3-pro": {
    promptMaxLength: 2500,
    negativePromptMaxLength: 2500,
    imageMaxBytes: 10 * MB,
    maxDurationSec: 15,
    maxResolutionPx: 1920,
  },
  llm: {
    promptMaxLength: 100_000,
    systemPromptMaxLength: 100_000,
    maxTokens: 8192,
    maxMediaUrls: 10,
    imageMaxBytes: 20 * MB,
    imageMaxResolutionPx: 1536,
    videoMaxBytes: 500 * MB,
    videoMaxDurationSec: 600,
    videoMaxResolutionPx: 1920,
    audioMaxBytes: 50 * MB,
    audioMaxDurationSec: 600,
  },
  "merge-video": {
    minVideos: 2,
    maxVideos: 20,
    maxVideoBytes: 500 * MB,
    maxDurationSec: 600,
    maxResolutionPx: 1920,
  },
  "merge-av": {
    maxVideoBytes: 500 * MB,
    maxAudioBytes: 50 * MB,
    maxDurationSec: 600,
    maxVideoResolutionPx: 1920,
    audioMaxDurationSec: 600,
  },
  "extract-audio": {
    maxVideoBytes: 500 * MB,
    maxDurationSec: 600,
    maxResolutionPx: 1920,
  },
} as const;

export function blobUrlViolation(field: string, label: string): ProviderLimitViolation {
  return {
    field,
    message: `${label}: local blob URLs cannot be verified. Upload media to get a public URL.`,
  };
}

function unverifiedViolation(
  field: string,
  label: string,
  aspect: "file size" | "duration" | "resolution",
): ProviderLimitViolation {
  return {
    field,
    message: `${label}: unable to verify ${aspect}. Re-upload media or use a durable public URL with metadata.`,
  };
}

export function checkResolvedBytes(
  metadata: MediaUrlMetadata,
  field: string,
  label: string,
  maxBytes: number,
  required: boolean,
): ProviderLimitViolation[] {
  if (metadata.bytes === null) {
    return required ? [unverifiedViolation(field, label, "file size")] : [];
  }
  if (metadata.bytes > maxBytes) {
    return [{ field, message: `${label} exceeds ${maxBytes / MB}MB size limit.` }];
  }
  return [];
}

export function checkResolvedDuration(
  metadata: MediaUrlMetadata,
  field: string,
  label: string,
  maxDurationSec: number,
  required: boolean,
): ProviderLimitViolation[] {
  if (metadata.durationSec === null) {
    return required ? [unverifiedViolation(field, label, "duration")] : [];
  }
  if (metadata.durationSec > maxDurationSec) {
    return [{ field, message: `${label} duration exceeds ${maxDurationSec} second limit.` }];
  }
  return [];
}

export function checkResolvedResolution(
  metadata: MediaUrlMetadata,
  field: string,
  label: string,
  maxResolutionPx: number,
  required: boolean,
): ProviderLimitViolation[] {
  const largestSide = maxDimension(metadata.width, metadata.height);
  if (largestSide === null) {
    return required ? [unverifiedViolation(field, label, "resolution")] : [];
  }
  if (largestSide > maxResolutionPx) {
    return [
      {
        field,
        message: `${label} resolution (${metadata.width}×${metadata.height}) exceeds ${maxResolutionPx}px limit.`,
      },
    ];
  }
  return [];
}

/** Fast hint-only validation for editor pre-checks (no network / ffprobe). */
export function validateProviderLimitsFromHints(
  nodeType: string,
  input: unknown,
  options?: ProviderLimitValidationOptions,
): ProviderLimitViolation[] {
  switch (nodeType) {
    case "gpt-image-2":
      return validateGptImage2LimitsFromHints(input as GptImage2Input);
    case "kling-v3-pro":
      return validateKlingV3ProLimitsFromHints(input as KlingV3ProInput);
    case "llm":
      return validateOpenRouterLlmLimitsFromHints(input as OpenRouterLlmInput);
    case "merge-video":
      return validateMergeVideoLimitsFromHints(input as MergeVideoInput, options);
    case "merge-av":
      return validateMergeAvLimitsFromHints(input as MergeAvInput);
    case "extract-audio":
      return validateExtractAudioLimitsFromHints(input as ExtractAudioInput);
    default:
      return [];
  }
}

function validateGptImage2LimitsFromHints(input: GptImage2Input): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS["gpt-image-2"];
  const issues: ProviderLimitViolation[] = [];

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({ field: "prompt", message: `Prompt exceeds ${limits.promptMaxLength} character limit.` });
  }
  const imageCount = numberValue(input.n);
  if (imageCount !== undefined && imageCount > limits.maxImages) {
    issues.push({ field: "n", message: `Number of images cannot exceed ${limits.maxImages}.` });
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
    const metadata = parseMediaUrlHints(input.image);
    if (input.image.startsWith("blob:")) {
      issues.push(blobUrlViolation("image", "Image"));
    } else {
      issues.push(
        ...checkResolvedBytes(metadata, "image", "Image", limits.imageMaxBytes, false),
        ...checkResolvedResolution(metadata, "image", "Image", limits.maxResolutionPx, false),
      );
    }
  }

  return issues;
}

function validateKlingV3ProLimitsFromHints(input: KlingV3ProInput): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS["kling-v3-pro"];
  const issues: ProviderLimitViolation[] = [];

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({ field: "prompt", message: `Prompt exceeds ${limits.promptMaxLength} character limit.` });
  }
  if (textLength(input.negative_prompt) > limits.negativePromptMaxLength) {
    issues.push({
      field: "negative_prompt",
      message: `Negative prompt exceeds ${limits.negativePromptMaxLength} character limit.`,
    });
  }
  const duration = numberValue(input.duration);
  if (duration !== undefined && duration > limits.maxDurationSec) {
    issues.push({ field: "duration", message: `Duration cannot exceed ${limits.maxDurationSec} seconds.` });
  }

  for (const [url, field, label] of [
    [input.start_image_url, "start_image_url", "Start frame"],
    [input.end_image_url, "end_image_url", "End frame"],
  ] as const) {
    if (!url) continue;
    if (url.startsWith("blob:")) {
      issues.push(blobUrlViolation(field, label));
      continue;
    }
    const metadata = parseMediaUrlHints(url);
    issues.push(
      ...checkResolvedBytes(metadata, field, label, limits.imageMaxBytes, false),
      ...checkResolvedResolution(metadata, field, label, limits.maxResolutionPx, false),
    );
  }

  return issues;
}

function validateOpenRouterLlmLimitsFromHints(input: OpenRouterLlmInput): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS.llm;
  const issues: ProviderLimitViolation[] = [];

  if (textLength(input.prompt) > limits.promptMaxLength) {
    issues.push({ field: "prompt", message: `Prompt exceeds ${limits.promptMaxLength} character limit.` });
  }
  if (textLength(input.system_prompt) > limits.systemPromptMaxLength) {
    issues.push({
      field: "system_prompt",
      message: `System prompt exceeds ${limits.systemPromptMaxLength} character limit.`,
    });
  }
  const maxTokens = numberValue(input.max_tokens);
  if (maxTokens !== undefined && maxTokens > limits.maxTokens) {
    issues.push({ field: "max_tokens", message: `Max tokens cannot exceed ${limits.maxTokens}.` });
  }

  const imageUrls = urlList(input.image_urls);
  const videoUrls = urlList(input.video_urls);
  const audioUrls = urlList(input.audio_urls);
  const mediaCount = imageUrls.length + videoUrls.length + audioUrls.length;
  if (mediaCount > limits.maxMediaUrls) {
    issues.push({ field: "media", message: `Total media URLs cannot exceed ${limits.maxMediaUrls}.` });
  }

  for (const url of imageUrls) {
    if (url.startsWith("blob:")) {
      issues.push(blobUrlViolation("image_urls", "An image input"));
      continue;
    }
    const metadata = parseMediaUrlHints(url);
    issues.push(
      ...checkResolvedBytes(metadata, "image_urls", "An image input", limits.imageMaxBytes, false),
      ...checkResolvedResolution(
        metadata,
        "image_urls",
        "An image input",
        limits.imageMaxResolutionPx,
        false,
      ),
    );
  }

  for (const url of videoUrls) {
    if (url.startsWith("blob:")) {
      issues.push(blobUrlViolation("video_urls", "A video input"));
      continue;
    }
    const metadata = parseMediaUrlHints(url);
    issues.push(
      ...checkResolvedBytes(metadata, "video_urls", "A video input", limits.videoMaxBytes, false),
      ...checkResolvedDuration(
        metadata,
        "video_urls",
        "A video input",
        limits.videoMaxDurationSec,
        false,
      ),
      ...checkResolvedResolution(
        metadata,
        "video_urls",
        "A video input",
        limits.videoMaxResolutionPx,
        false,
      ),
    );
  }

  for (const url of audioUrls) {
    if (url.startsWith("blob:")) {
      issues.push(blobUrlViolation("audio_urls", "An audio input"));
      continue;
    }
    const metadata = parseMediaUrlHints(url);
    issues.push(
      ...checkResolvedBytes(metadata, "audio_urls", "An audio input", limits.audioMaxBytes, false),
      ...checkResolvedDuration(
        metadata,
        "audio_urls",
        "An audio input",
        limits.audioMaxDurationSec,
        false,
      ),
    );
  }

  return issues;
}

function effectiveMergeVideoInputCount(
  input: MergeVideoInput,
  options?: ProviderLimitValidationOptions,
): number {
  const resolved = urlList(input.video_urls).filter((url) => url.trim().length > 0).length;
  const wired = options?.wiredInputCounts?.video_urls ?? 0;
  return Math.max(resolved, wired);
}

export { effectiveMergeVideoInputCount };

function validateMergeVideoLimitsFromHints(
  input: MergeVideoInput,
  options?: ProviderLimitValidationOptions,
): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS["merge-video"];
  const issues: ProviderLimitViolation[] = [];
  const count = effectiveMergeVideoInputCount(input, options);

  if (count < limits.minVideos) {
    issues.push({ field: "video_urls", message: `At least ${limits.minVideos} video inputs are required.` });
  }
  const videoUrls = urlList(input.video_urls);
  if (videoUrls.length > limits.maxVideos) {
    issues.push({ field: "video_urls", message: `Cannot merge more than ${limits.maxVideos} videos.` });
  }

  for (const url of videoUrls) {
    if (url.startsWith("blob:")) {
      issues.push(blobUrlViolation("video_urls", "A video input"));
      break;
    }
    const metadata = parseMediaUrlHints(url);
    const urlIssues = [
      ...checkResolvedBytes(metadata, "video_urls", "A video input", limits.maxVideoBytes, false),
      ...checkResolvedDuration(metadata, "video_urls", "A video input", limits.maxDurationSec, false),
      ...checkResolvedResolution(metadata, "video_urls", "A video input", limits.maxResolutionPx, false),
    ];
    if (urlIssues.length > 0) {
      issues.push(...urlIssues);
      break;
    }
  }

  return issues;
}

function validateMergeAvLimitsFromHints(input: MergeAvInput): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS["merge-av"];
  const issues: ProviderLimitViolation[] = [];

  if (input.video_url) {
    if (input.video_url.startsWith("blob:")) {
      issues.push(blobUrlViolation("video_url", "Video"));
    } else {
      const metadata = parseMediaUrlHints(input.video_url);
      issues.push(
        ...checkResolvedBytes(metadata, "video_url", "Video", limits.maxVideoBytes, false),
        ...checkResolvedDuration(metadata, "video_url", "Video", limits.maxDurationSec, false),
        ...checkResolvedResolution(
          metadata,
          "video_url",
          "Video",
          limits.maxVideoResolutionPx,
          false,
        ),
      );
    }
  }

  if (input.audio_url) {
    if (input.audio_url.startsWith("blob:")) {
      issues.push(blobUrlViolation("audio_url", "Audio"));
    } else {
      const metadata = parseMediaUrlHints(input.audio_url);
      issues.push(
        ...checkResolvedBytes(metadata, "audio_url", "Audio", limits.maxAudioBytes, false),
        ...checkResolvedDuration(
          metadata,
          "audio_url",
          "Audio",
          limits.audioMaxDurationSec,
          false,
        ),
      );
    }
  }

  return issues;
}

function validateExtractAudioLimitsFromHints(input: ExtractAudioInput): ProviderLimitViolation[] {
  const limits = PROVIDER_INPUT_LIMITS["extract-audio"];
  const issues: ProviderLimitViolation[] = [];

  if (!input.video_url) return issues;

  if (input.video_url.startsWith("blob:")) {
    issues.push(blobUrlViolation("video_url", "Video"));
    return issues;
  }

  const metadata = parseMediaUrlHints(input.video_url);
  issues.push(
    ...checkResolvedBytes(metadata, "video_url", "Video", limits.maxVideoBytes, false),
    ...checkResolvedDuration(metadata, "video_url", "Video", limits.maxDurationSec, false),
    ...checkResolvedResolution(metadata, "video_url", "Video", limits.maxResolutionPx, false),
  );

  return issues;
}

export function formatProviderLimitError(violations: ProviderLimitViolation[]): string {
  if (violations.length === 0) return "Input exceeds provider limits.";
  return violations.map((v) => v.message).join(" ");
}

export function isProviderLimitNodeType(nodeType: string): nodeType is ProviderLimitNodeType {
  return (PROVIDER_LIMIT_NODE_TYPES as readonly string[]).includes(nodeType);
}
