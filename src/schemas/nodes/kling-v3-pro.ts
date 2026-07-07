import type { NodeUiConfig } from "../../nodes/types";
import { z } from "zod";
import { parseWiredBoolean, parseWiredNumber } from "../connectionPolicy";





export const KlingV3ProModeSchema = z.enum(["text_to_video", "image_to_video"]);

export type KlingV3ProMode = z.infer<typeof KlingV3ProModeSchema>;



export const KlingV3ProAspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);

export type KlingV3ProAspectRatio = z.infer<typeof KlingV3ProAspectRatioSchema>;



export const KLING_V3_PRO_DURATION_MIN = 3;

export const KLING_V3_PRO_DURATION_MAX = 15;



export const KLING_V3_PRO_CFG_SCALE_MIN = 0;

export const KLING_V3_PRO_CFG_SCALE_MAX = 1;

export const KLING_V3_PRO_CFG_SCALE_DEFAULT = 0.5;

export const KLING_V3_PRO_CFG_SCALE_STEP = 0.1;



export const KlingV3ProCfgScaleSchema = z
  .number()
  .min(KLING_V3_PRO_CFG_SCALE_MIN)
  .max(KLING_V3_PRO_CFG_SCALE_MAX)
  .default(KLING_V3_PRO_CFG_SCALE_DEFAULT);

export type KlingV3ProCfgScale = z.infer<typeof KlingV3ProCfgScaleSchema>;



export const KlingV3ProDurationSchema = z

  .number()

  .int()

  .min(KLING_V3_PRO_DURATION_MIN)

  .max(KLING_V3_PRO_DURATION_MAX);

export type KlingV3ProDuration = z.infer<typeof KlingV3ProDurationSchema>;



function emptyStringToUndefined(value: unknown): unknown {

  if (typeof value !== "string") return value;

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;

}



/** Accepts a URL or empty form value (treated as absent). */

export const KlingV3ProImageSchema = z.preprocess(

  emptyStringToUndefined,

  z.string().url().optional(),

);



export const KlingV3ProElementSchema = z.object({
  frontal_image_url: KlingV3ProImageSchema,
  reference_image_urls: z.array(z.string().url()).optional().default([]),
  video_url: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
});

export type KlingV3ProElement = z.infer<typeof KlingV3ProElementSchema>;

const KLING_V3_PRO_ELEMENT_HANDLE_RE =
  /^in:elements\.(\d+)\.(frontal_image_url|reference_image_urls|video_url)$/;

export type KlingV3ProElementHandleField =
  | "frontal_image_url"
  | "reference_image_urls"
  | "video_url";

export function parseKlingV3ProElementHandle(
  handleId: string,
): { index: number; field: KlingV3ProElementHandleField } | null {
  const match = handleId.match(KLING_V3_PRO_ELEMENT_HANDLE_RE);
  if (!match) return null;
  return {
    index: Number.parseInt(match[1] ?? "0", 10),
    field: match[2] as KlingV3ProElementHandleField,
  };
}

export function isKlingV3ProElementHandle(handleId: string | null | undefined): boolean {
  return typeof handleId === "string" && KLING_V3_PRO_ELEMENT_HANDLE_RE.test(handleId);
}

export function klingV3ProElementHandleDataType(
  handleId: string,
): "image" | "video" | undefined {
  const parsed = parseKlingV3ProElementHandle(handleId);
  if (!parsed) return undefined;
  if (parsed.field === "video_url") return "video";
  return "image";
}



export const KlingV3ProInputSchema = z.object({

  mode: KlingV3ProModeSchema.default("text_to_video"),

  prompt: z.string().max(2500).default(""),

  start_image_url: KlingV3ProImageSchema,

  end_image_url: KlingV3ProImageSchema,

  aspect_ratio: KlingV3ProAspectRatioSchema.default("16:9"),

  duration: KlingV3ProDurationSchema.default(5),

  negative_prompt: z.string().max(2500).default(""),

  generate_audio: z.boolean().default(true),

  cfg_scale: KlingV3ProCfgScaleSchema,

  elements: z.array(KlingV3ProElementSchema).default([]),

});



export type KlingV3ProInput = z.infer<typeof KlingV3ProInputSchema>;



/** Maps legacy persisted `image` field to `start_image_url`. */

export function normalizeKlingV3ProInputs(

  raw: Record<string, unknown>,

): Record<string, unknown> {

  const next = { ...raw };

  if (

    typeof next.start_image_url !== "string" &&

    typeof next.image === "string" &&

    next.image.length > 0

  ) {

    next.start_image_url = next.image;

  }

  delete next.image;

  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map((item) => {
      if (!item || typeof item !== "object") return item;
      const element = { ...(item as Record<string, unknown>) };
      if (
        typeof element.image_url === "string" &&
        typeof element.frontal_image_url !== "string"
      ) {
        element.frontal_image_url = element.image_url;
      }
      delete element.image_url;
      delete element.description;
      if (!Array.isArray(element.reference_image_urls)) {
        element.reference_image_urls = [];
      }
      return element;
    });
  }

  const durationParsed = parseWiredNumber(next.duration);
  if (durationParsed !== null) next.duration = durationParsed;
  const cfgParsed = parseWiredNumber(next.cfg_scale);
  if (cfgParsed !== null) next.cfg_scale = cfgParsed;
  const audioParsed = parseWiredBoolean(next.generate_audio);
  if (audioParsed !== null) next.generate_audio = audioParsed;

  return next;

}



export const KlingV3ProGeneratedVideoSchema = z.object({

  url: z.string().url(),

  duration: z.number().positive().optional(),

  aspect_ratio: z.string().optional(),

});



export const KlingV3ProOutputSchema = z.object({

  result: KlingV3ProGeneratedVideoSchema,

});



export type KlingV3ProOutput = z.infer<typeof KlingV3ProOutputSchema>;

export const KLING_V3_PRO_MODE_OPTIONS: { value: KlingV3ProMode; label: string }[] = [
  { value: "text_to_video", label: "Text to Video" },
  { value: "image_to_video", label: "Image to Video" },
];

export const KLING_V3_PRO_ASPECT_RATIO_OPTIONS: {

  value: KlingV3ProAspectRatio;

  label: string;

}[] = [

  { value: "16:9", label: "16:9" },

  { value: "9:16", label: "9:16" },

  { value: "1:1", label: "1:1" },

];



export const KLING_V3_PRO_DURATION_OPTIONS: { value: KlingV3ProDuration; label: string }[] =

  Array.from(

    { length: KLING_V3_PRO_DURATION_MAX - KLING_V3_PRO_DURATION_MIN + 1 },

    (_, index) => {

      const value = (KLING_V3_PRO_DURATION_MIN + index) as KlingV3ProDuration;

      return { value, label: String(value) };

    },

  );



/** Mirrors Galaxy default estimate (~0.84M for 5s with audio). */

export function estimateKlingV3ProCredits(input: Partial<KlingV3ProInput>): number {

  const parsed = KlingV3ProInputSchema.partial().safeParse(input);

  const data = parsed.success ? parsed.data : {};

  const duration = data.duration ?? 5;

  const generateAudio = data.generate_audio ?? true;

  const basePerSecond = 168_000;

  let credits = basePerSecond * duration;

  if (!generateAudio) credits *= 0.85;

  return Math.round(credits);

}

/** Single source of truth: schemas + UI + execution for kling-v3-pro. */

export const klingV3ProNodeUi: NodeUiConfig = {
    title: "Kling v3 Pro",
    description:
      "Premium Kling v3 Pro model with top-tier video quality and advanced prompt adherence.",
    category: "video",
    settingsLabel: "Settings",
    handles: [
      { id: "in:mode", label: "Mode", kind: "input", dataType: "enum" },
      { id: "in:start_image_url", label: "Start Frame", kind: "input", dataType: "image" },
      { id: "in:end_image_url", label: "End Frame", kind: "input", dataType: "image" },
      { id: "in:prompt", label: "Prompt", kind: "input", dataType: "text" },
      { id: "in:aspect_ratio", label: "Aspect Ratio", kind: "input", dataType: "enum" },
      { id: "in:duration", label: "Duration", kind: "input", dataType: "number" },
      { id: "in:negative_prompt", label: "Negative Prompt", kind: "input", dataType: "text" },
      { id: "in:cfg_scale", label: "CFG Scale", kind: "input", dataType: "number" },
      { id: "in:generate_audio", label: "Generate Audio", kind: "input", dataType: "boolean" },
      { id: "out:result", label: "Generated Video", kind: "output", dataType: "video" },
    ],
    fields: [
      {
        key: "mode",
        label: "Mode",
        handleId: "in:mode",
        control: "mode_tabs",
        group: "primary",
        dataType: "enum",
        optionsKey: "KLING_V3_PRO_MODE_OPTIONS",
      },
      {
        key: "start_image_url",
        label: "Start Frame",
        handleId: "in:start_image_url",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "image",
        required: true,
        handleTop: 12,
        handleVariant: "number",
        visibleWhen: { key: "mode", in: ["image_to_video"] },
      },
      {
        key: "prompt",
        label: "Prompt",
        labelWhen: [
          { when: { key: "mode", in: ["image_to_video"] }, label: "Description" },
        ],
        handleId: "in:prompt",
        control: "textarea",
        group: "primary",
        dataType: "text",
        required: true,
        placeholder: "Describe the video you want to generate...",
        placeholderWhen: [
          {
            when: { key: "mode", in: ["image_to_video"] },
            placeholder: "Describe the video scene you want to create...",
          },
        ],
        maxLength: 2500,
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        handleId: "in:aspect_ratio",
        control: "select",
        group: "primary",
        dataType: "enum",
        optionsKey: "KLING_V3_PRO_ASPECT_RATIO_OPTIONS",
        layout: "inline",
        handleTop: 20,
        handleVariant: "text",
        visibleWhen: { key: "mode", in: ["text_to_video"] },
      },
      {
        key: "duration",
        label: "Duration",
        handleId: "in:duration",
        control: "select",
        group: "primary",
        dataType: "number",
        optionsKey: "KLING_V3_PRO_DURATION_OPTIONS",
        layout: "inline",
        handleTop: 20,
      },
      {
        key: "end_image_url",
        label: "End Frame",
        handleId: "in:end_image_url",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "image",
        handleTop: 14,
        handleVariant: "number",
        visibleWhen: { key: "mode", in: ["image_to_video"] },
      },
      {
        key: "negative_prompt",
        label: "Negative Prompt",
        handleId: "in:negative_prompt",
        control: "textarea",
        group: "primary",
        dataType: "text",
        placeholder: "Describe what you don't want in the video...",
        maxLength: 2500,
      },
      {
        key: "cfg_scale",
        label: "CFG Scale",
        handleId: "in:cfg_scale",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        visibleWhen: { key: "mode", in: ["image_to_video"] },
        helpTooltip:
          "Classifier-free guidance strength. Higher values follow the prompt more closely (0–1).",
        numberMin: KLING_V3_PRO_CFG_SCALE_MIN,
        numberMax: KLING_V3_PRO_CFG_SCALE_MAX,
        numberStep: KLING_V3_PRO_CFG_SCALE_STEP,
        resetValue: KLING_V3_PRO_CFG_SCALE_DEFAULT,
      },
      {
        key: "generate_audio",
        label: "Generate Audio",
        handleId: "in:generate_audio",
        control: "boolean",
        group: "primary",
        groupWhen: [
          { when: { key: "mode", in: ["text_to_video"] }, group: "primary" },
          { when: { key: "mode", in: ["image_to_video"] }, group: "advanced" },
        ],
        dataType: "boolean",
        layout: "inline",
        handleTop: 14,
        handleVariant: "enum",
      },
      {
        key: "elements",
        label: "Elements",
        control: "kling_elements",
        group: "primary",
        dataType: "image",
        visibleWhen: { key: "mode", in: ["image_to_video"] },
        helpTooltip:
          "Optional reference subjects (images or videos) to include in the generated video.",
      },
    ],
    defaults: {
      label: "Kling v3 Pro",
      config: {
        providers: ["kling-v3-pro-stub"],
        timeoutMs: 300_000,
        retryPerProvider: 2,
      },
      inputs: {
        mode: "text_to_video",
        prompt: "",
        start_image_url: "",
        end_image_url: "",
        aspect_ratio: "16:9",
        duration: 5,
        negative_prompt: "",
        generate_audio: true,
        cfg_scale: KLING_V3_PRO_CFG_SCALE_DEFAULT,
        elements: [],
      },
      settingsOpen: false,
    },
    pricing: {
      estimateCredits: estimateKlingV3ProCredits({
        mode: "text_to_video",
        prompt: "",
        aspect_ratio: "16:9",
        duration: 5,
        negative_prompt: "",
        generate_audio: true,
      }),
    },
  };
