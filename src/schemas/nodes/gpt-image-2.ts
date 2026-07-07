import type { NodeUiConfig } from "../../nodes/types";
import { z } from "zod";
import { parseWiredNumber } from "../connectionPolicy";



export const GptImage2ModeSchema = z.enum(["text_to_image", "image_to_image"]);
export type GptImage2Mode = z.infer<typeof GptImage2ModeSchema>;

export const GptImage2SizeSchema = z.enum([
  "custom",
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);
export type GptImage2Size = z.infer<typeof GptImage2SizeSchema>;

export const GptImage2QualitySchema = z.enum(["low", "medium", "high"]);
export type GptImage2Quality = z.infer<typeof GptImage2QualitySchema>;

export const GptImage2OutputFormatSchema = z.enum(["png", "jpeg", "webp"]);
export type GptImage2OutputFormat = z.infer<typeof GptImage2OutputFormatSchema>;

export const GptImage2BackgroundSchema = z.enum(["auto", "opaque"]);
export type GptImage2Background = z.infer<typeof GptImage2BackgroundSchema>;

export const GptImage2CountSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Accepts a URL or empty form value (treated as absent). */
export const GptImage2ImageSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional(),
);

export const GptImage2InputSchemaObject = z.object({
  mode: GptImage2ModeSchema.default("text_to_image"),
  prompt: z.string().max(4000).default(""),
  image: GptImage2ImageSchema,
  size: GptImage2SizeSchema.default("auto"),
  quality: GptImage2QualitySchema.default("high"),
  n: GptImage2CountSchema.default(1),
  output_format: GptImage2OutputFormatSchema.default("png"),
  background: GptImage2BackgroundSchema.default("auto"),
});

function coerceGptImage2RawInputs(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const input = { ...(raw as Record<string, unknown>) };
  if ("n" in input) {
    const parsed = parseWiredNumber(input.n);
    if (parsed !== null) input.n = parsed;
  }
  if (input.quality === "auto") input.quality = "high";
  return input;
}

export const GptImage2InputSchema = z.preprocess(
  coerceGptImage2RawInputs,
  GptImage2InputSchemaObject,
);

export type GptImage2Input = z.infer<typeof GptImage2InputSchemaObject>;

export const GptImage2GeneratedImageSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const GptImage2OutputSchema = z.object({
  result: z.array(GptImage2GeneratedImageSchema).min(1),
});

export type GptImage2Output = z.infer<typeof GptImage2OutputSchema>;

export const GPT_IMAGE_2_MODE_OPTIONS: { value: GptImage2Mode; label: string }[] = [
  { value: "text_to_image", label: "Text to Image" },
  { value: "image_to_image", label: "Image to Image" },
];

export const GPT_IMAGE_2_SIZE_OPTIONS: { value: GptImage2Size; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1024×1024" },
  { value: "1536x1024", label: "1536×1024" },
  { value: "1024x1536", label: "1024×1536" },
  { value: "2048x2048", label: "2048×2048" },
  { value: "2048x1152", label: "2048×1152" },
  { value: "3840x2160", label: "3840×2160" },
  { value: "2160x3840", label: "2160×3840" },
];

export const GPT_IMAGE_2_QUALITY_OPTIONS: { value: GptImage2Quality; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const GPT_IMAGE_2_COUNT_OPTIONS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
];

export const GPT_IMAGE_2_OUTPUT_FORMAT_OPTIONS: {
  value: GptImage2OutputFormat;
  label: string;
}[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
];

export const GPT_IMAGE_2_BACKGROUND_OPTIONS: { value: GptImage2Background; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "opaque", label: "Opaque" },
];

const QUALITY_MULTIPLIER: Record<GptImage2Quality, number> = {
  low: 0.5,
  medium: 0.75,
  high: 1,
};

/** Mirrors Galaxy default estimate (~0.21M for 1× high-quality image). */
export function estimateGptImage2Credits(input: Partial<GptImage2Input>): number {
  const parsed = GptImage2InputSchemaObject.partial().safeParse(input);
  const data = parsed.success ? parsed.data : {};
  const n = data.n ?? 1;
  const quality = data.quality ?? "high";
  const base = 210_000;
  return Math.round(base * n * QUALITY_MULTIPLIER[quality]);
}

export function formatCreditEstimate(credits: number): string {
  if (credits >= 100_000) {
    return `~${(credits / 1_000_000).toFixed(2)}M`;
  }
  if (credits >= 1_000) {
    return `~${(credits / 1_000).toFixed(0)}K`;
  }
  return `~${(credits / 1_000_000).toFixed(4)}M`;
}

export function resolveGptImage2Dimensions(size: GptImage2Size): { width: number; height: number } {
  if (size === "custom" || size === "auto") return { width: 1024, height: 1024 };
  const [width, height] = size.split("x").map((part) => Number.parseInt(part, 10));
  return { width: width || 1024, height: height || 1024 };
}

/** Single source of truth: schemas + UI + execution for gpt-image-2. */

export const gptImage2NodeUi: NodeUiConfig = {
    title: "GPT Image 2",
    description:
      "OpenAI's newest image model with any-resolution support and improved quality",
    category: "image",
    handles: [
      { id: "in:prompt", label: "Prompt", kind: "input", dataType: "text" },
      { id: "in:image", label: "Input Images", kind: "input", dataType: "image" },
      { id: "in:size", label: "Size", kind: "input", dataType: "enum" },
      { id: "in:quality", label: "Quality", kind: "input", dataType: "enum" },
      { id: "in:n", label: "Number of Images", kind: "input", dataType: "number" },
      { id: "in:background", label: "Background", kind: "input", dataType: "enum" },
      { id: "in:output_format", label: "Output Format", kind: "input", dataType: "enum" },
      { id: "out:result", label: "Generated Images", kind: "output", dataType: "image_list" },
    ],
    settingsLabel: "Settings",
    fields: [
      {
        key: "mode",
        label: "Mode",
        control: "mode_tabs",
        group: "primary",
        dataType: "enum",
        optionsKey: "GPT_IMAGE_2_MODE_OPTIONS",
      },
      {
        key: "image",
        label: "Input Images",
        handleId: "in:image",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "image",
        required: true,
        handleTop: 12,
        handleVariant: "number",
        helpText: "Upload requirements",
        helpTooltip: "PNG, JPEG, or WebP up to 20MB. Max resolution 3840px.",
        visibleWhen: { key: "mode", in: ["image_to_image"] },
      },
      {
        key: "prompt",
        label: "Prompt",
        handleId: "in:prompt",
        control: "textarea",
        group: "primary",
        dataType: "text",
        required: true,
        placeholder: "Describe the image you want to create...",
        maxLength: 4000,
      },
      {
        key: "size",
        label: "Size",
        handleId: "in:size",
        control: "select",
        group: "primary",
        dataType: "enum",
        optionsKey: "GPT_IMAGE_2_SIZE_OPTIONS",
        layout: "select_primary",
        handleVariant: "text",
      },
      {
        key: "quality",
        label: "Quality",
        handleId: "in:quality",
        control: "select",
        group: "primary",
        dataType: "enum",
        optionsKey: "GPT_IMAGE_2_QUALITY_OPTIONS",
        layout: "inline",
        handleTop: 20,
        handleVariant: "text",
      },
      {
        key: "n",
        label: "Number of Images",
        handleId: "in:n",
        control: "select",
        group: "primary",
        dataType: "number",
        optionsKey: "GPT_IMAGE_2_COUNT_OPTIONS",
        layout: "inline",
        handleTop: 20,
      },
      {
        key: "background",
        label: "Background",
        handleId: "in:background",
        control: "select",
        group: "advanced",
        dataType: "enum",
        optionsKey: "GPT_IMAGE_2_BACKGROUND_OPTIONS",
        layout: "inline",
        handleTop: 20,
        handleVariant: "text",
      },
      {
        key: "output_format",
        label: "Output Format",
        handleId: "in:output_format",
        control: "select",
        group: "advanced",
        dataType: "enum",
        optionsKey: "GPT_IMAGE_2_OUTPUT_FORMAT_OPTIONS",
        layout: "inline",
        handleTop: 20,
        handleVariant: "text",
      },
    ],
    defaults: {
      label: "GPT Image 2",
      config: {
        providers: ["openai-gpt-image-2-stub"],
        timeoutMs: 120_000,
        retryPerProvider: 2,
      },
      inputs: {
        mode: "text_to_image",
        prompt: "",
        image: "",
        size: "auto",
        quality: "high",
        n: 1,
        output_format: "png",
        background: "auto",
      },
      settingsOpen: false,
    },
    pricing: {
      estimateCredits: estimateGptImage2Credits({
        mode: "text_to_image",
        prompt: "",
        size: "auto",
        quality: "high",
        n: 1,
        output_format: "png",
        background: "auto",
      }),
      description: "Estimated credits based on quality and number of images",
    },
  };
