import type { NodeUiConfig } from "../../nodes/types";
import { z } from "zod";
import { parseWiredBoolean, parseWiredNumber } from "../connectionPolicy";



export const OPENROUTER_LLM_MODEL = "google/gemini-3.5-flash";
export const OPENROUTER_LLM_DISPLAY_NAME = "Gemini Flash Latest";
export const OPENROUTER_LLM_DESCRIPTION =
  "Generate text using Gemini 3.5 Flash via OpenRouter";

const urlArraySchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.length > 0) return [value];
    return [];
  },
  z.array(z.string()).default([]),
);

const LLM_NUMERIC_KEYS = [
  "temperature",
  "max_tokens",
  "top_p",
  "top_k",
  "frequency_penalty",
  "presence_penalty",
  "repetition_penalty",
  "min_p",
  "top_a",
  "seed",
] as const;

const LLM_BOOLEAN_KEYS = ["reasoning", "response_format"] as const;

function coerceLlmRawInputs(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const input = { ...(raw as Record<string, unknown>) };
  for (const key of LLM_NUMERIC_KEYS) {
    if (!(key in input)) continue;
    const parsed = parseWiredNumber(input[key]);
    if (parsed !== null) input[key] = parsed;
  }
  for (const key of LLM_BOOLEAN_KEYS) {
    if (!(key in input)) continue;
    const parsed = parseWiredBoolean(input[key]);
    if (parsed !== null) input[key] = parsed;
  }
  return input;
}

export const OpenRouterLlmInputSchemaObject = z.object({
  prompt: z.string().default(""),
  system_prompt: z.string().default(""),
  image_urls: urlArraySchema,
  video_urls: urlArraySchema,
  audio_urls: urlArraySchema,
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(8192).default(1024),
  reasoning: z.boolean().default(false),
  top_p: z.number().min(0).max(1).default(1),
  top_k: z.number().int().min(0).max(500).default(0),
  frequency_penalty: z.number().min(-2).max(2).default(0),
  presence_penalty: z.number().min(-2).max(2).default(0),
  repetition_penalty: z.number().min(0).max(2).default(1),
  min_p: z.number().min(0).max(1).default(0),
  top_a: z.number().min(0).max(1).default(0),
  seed: z.number().int().min(0).default(0),
  stop: z.string().default(""),
  response_format: z.boolean().default(false),
});

export const OpenRouterLlmInputSchema = z.preprocess(
  coerceLlmRawInputs,
  OpenRouterLlmInputSchemaObject,
);

export type OpenRouterLlmInput = z.infer<typeof OpenRouterLlmInputSchemaObject>;

export const OpenRouterLlmOutputSchema = z.object({
  output: z.string(),
});

export type OpenRouterLlmOutput = z.infer<typeof OpenRouterLlmOutputSchema>;

export function parseStopSequences(stop: string): string[] {
  return stop
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Mirrors Galaxy LLM credit estimate (~0.0001M at default max_tokens). */
export function estimateOpenRouterLlmCredits(input: Partial<OpenRouterLlmInput>): number {
  const parsed = OpenRouterLlmInputSchemaObject.partial().safeParse(input);
  const data = parsed.success ? parsed.data : {};
  const maxTokens = data.max_tokens ?? 1024;
  return Math.max(100, Math.round(maxTokens * 0.1));
}

const defaultInputs = OpenRouterLlmInputSchema.parse({});

/** Single source of truth: schemas + UI + execution for llm. */

export const openrouterLlmNodeUi: NodeUiConfig = {
    title: OPENROUTER_LLM_DISPLAY_NAME,
    description: OPENROUTER_LLM_DESCRIPTION,
    category: "text",
    settingsLabel: "Settings",
    handles: [
      { id: "in:prompt", label: "Prompt", kind: "input", dataType: "text" },
      { id: "in:system_prompt", label: "System Prompt", kind: "input", dataType: "text" },
      { id: "in:image_urls", label: "Image (Vision)", kind: "input", dataType: "image_list" },
      { id: "in:video_urls", label: "Video", kind: "input", dataType: "video_list" },
      { id: "in:audio_urls", label: "Audio", kind: "input", dataType: "audio_list" },
      { id: "in:temperature", label: "Temperature", kind: "input", dataType: "number" },
      { id: "in:max_tokens", label: "Max Tokens", kind: "input", dataType: "number" },
      { id: "in:reasoning", label: "Reasoning", kind: "input", dataType: "boolean" },
      { id: "in:top_p", label: "Top P", kind: "input", dataType: "number" },
      { id: "in:top_k", label: "Top K", kind: "input", dataType: "number" },
      { id: "in:frequency_penalty", label: "Frequency Penalty", kind: "input", dataType: "number" },
      { id: "in:presence_penalty", label: "Presence Penalty", kind: "input", dataType: "number" },
      { id: "in:repetition_penalty", label: "Repetition Penalty", kind: "input", dataType: "number" },
      { id: "in:min_p", label: "Min P", kind: "input", dataType: "number" },
      { id: "in:top_a", label: "Top A", kind: "input", dataType: "number" },
      { id: "in:seed", label: "Seed", kind: "input", dataType: "number" },
      { id: "in:stop", label: "Stop Sequences", kind: "input", dataType: "text" },
      { id: "in:response_format", label: "JSON Mode", kind: "input", dataType: "boolean" },
      { id: "out:output", label: "Response", kind: "output", dataType: "text" },
    ],
    fields: [
      {
        key: "prompt",
        label: "Prompt",
        handleId: "in:prompt",
        control: "textarea",
        group: "primary",
        dataType: "text",
        required: true,
        placeholder: "Enter your prompt...",
        helpTooltip: "The main instruction sent to the model.",
      },
      {
        key: "system_prompt",
        label: "System Prompt",
        handleId: "in:system_prompt",
        control: "textarea",
        group: "primary",
        dataType: "text",
        placeholder: "You are a helpful assistant...",
        helpTooltip: "Optional system message that sets model behavior.",
      },
      {
        key: "image_urls",
        label: "Image (Vision)",
        handleId: "in:image_urls",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "image_list",
        handleTop: 12,
        helpText: "Upload requirements",
        helpTooltip: "PNG, JPEG, or WebP up to 20MB. Max resolution 1536px.",
      },
      {
        key: "video_urls",
        label: "Video",
        handleId: "in:video_urls",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "video_list",
        handleTop: 12,
      },
      {
        key: "audio_urls",
        label: "Audio",
        handleId: "in:audio_urls",
        control: "image_upload",
        layout: "image_upload",
        group: "primary",
        dataType: "audio_list",
        handleTop: 12,
      },
      {
        key: "temperature",
        label: "Temperature",
        handleId: "in:temperature",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 2,
        numberStep: 0.1,
        resetValue: 0.7,
        helpTooltip: "Controls randomness. Lower is more focused, higher is more creative.",
      },
      {
        key: "max_tokens",
        label: "Max Tokens",
        handleId: "in:max_tokens",
        control: "number",
        layout: "inline",
        group: "advanced",
        dataType: "number",
        handleTop: 19,
        numberMin: 1,
        numberMax: 8192,
        numberStep: 1,
        helpTooltip: "Maximum number of tokens to generate in the response.",
      },
      {
        key: "reasoning",
        label: "Reasoning",
        handleId: "in:reasoning",
        control: "boolean",
        layout: "inline",
        group: "advanced",
        dataType: "boolean",
        handleTop: 14,
        handleVariant: "enum",
        helpTooltip: "Enable extended reasoning when supported by the model.",
      },
      {
        key: "top_p",
        label: "Top P",
        handleId: "in:top_p",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 1,
        numberStep: 0.05,
        resetValue: 1,
        helpTooltip: "Nucleus sampling threshold. Lower values restrict token choices.",
      },
      {
        key: "top_k",
        label: "Top K",
        handleId: "in:top_k",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 500,
        numberStep: 1,
        resetValue: 0,
        helpTooltip: "Limits sampling to the top K most likely tokens. 0 disables.",
      },
      {
        key: "frequency_penalty",
        label: "Frequency Penalty",
        handleId: "in:frequency_penalty",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: -2,
        numberMax: 2,
        numberStep: 0.1,
        resetValue: 0,
        helpTooltip: "Penalizes tokens based on how often they appear in the text.",
      },
      {
        key: "presence_penalty",
        label: "Presence Penalty",
        handleId: "in:presence_penalty",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: -2,
        numberMax: 2,
        numberStep: 0.1,
        resetValue: 0,
        helpTooltip: "Penalizes tokens that have already appeared at least once.",
      },
      {
        key: "repetition_penalty",
        label: "Repetition Penalty",
        handleId: "in:repetition_penalty",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 2,
        numberStep: 0.05,
        resetValue: 1,
        helpTooltip: "Reduces repetition in generated text.",
      },
      {
        key: "min_p",
        label: "Min P",
        handleId: "in:min_p",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 1,
        numberStep: 0.05,
        resetValue: 0,
        helpTooltip: "Minimum probability threshold for token sampling.",
      },
      {
        key: "top_a",
        label: "Top A",
        handleId: "in:top_a",
        control: "slider",
        layout: "slider",
        group: "advanced",
        dataType: "number",
        handleTop: 14,
        numberMin: 0,
        numberMax: 1,
        numberStep: 0.05,
        resetValue: 0,
        helpTooltip: "Alternative top-a sampling parameter.",
      },
      {
        key: "seed",
        label: "Seed",
        handleId: "in:seed",
        control: "number",
        layout: "inline",
        group: "advanced",
        dataType: "number",
        handleTop: 19,
        numberMin: 0,
        numberStep: 1,
        helpTooltip: "Optional seed for reproducible outputs. 0 uses random seed.",
      },
      {
        key: "stop",
        label: "Stop Sequences",
        handleId: "in:stop",
        control: "textarea",
        group: "advanced",
        dataType: "text",
        handleTop: 14,
        placeholder: "e.g. END, STOP, ###",
        textareaRows: 2,
        helpTooltip: "Comma or newline separated sequences that stop generation.",
      },
      {
        key: "response_format",
        label: "JSON Mode",
        handleId: "in:response_format",
        control: "boolean",
        layout: "inline",
        group: "advanced",
        dataType: "boolean",
        handleTop: 14,
        handleVariant: "enum",
        helpTooltip: "When enabled, the model returns valid JSON.",
      },
    ],
    defaults: {
      label: OPENROUTER_LLM_DISPLAY_NAME,
      config: {
        providers: ["openrouter-gemini-2.0-flash-exp-free"],
        model: OPENROUTER_LLM_MODEL,
        timeoutMs: 120_000,
        retryPerProvider: 2,
      },
      inputs: defaultInputs,
      settingsOpen: false,
    },
    pricing: {
      estimateCredits: estimateOpenRouterLlmCredits(defaultInputs),
    },
  };
