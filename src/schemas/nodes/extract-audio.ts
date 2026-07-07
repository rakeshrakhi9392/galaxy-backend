import { z } from "zod";
import type { NodeUiConfig } from "../../nodes/types";

export const EXTRACT_AUDIO_DISPLAY_NAME = "Extract Audio";
export const EXTRACT_AUDIO_DESCRIPTION = "Extract audio track from a video";

export const ExtractAudioFormatSchema = z.enum(["mp3", "wav", "aac"]);

export type ExtractAudioFormat = z.infer<typeof ExtractAudioFormatSchema>;

export const ExtractAudioInputSchema = z.object({
  video_url: z.string().url(),
  format: ExtractAudioFormatSchema.default("mp3"),
});

export type ExtractAudioInput = z.infer<typeof ExtractAudioInputSchema>;

export const ExtractAudioOutputSchema = z.object({
  audio_url: z.string().url(),
});

export type ExtractAudioOutput = z.infer<typeof ExtractAudioOutputSchema>;

export const EXTRACT_AUDIO_FORMAT_OPTIONS: {
  value: ExtractAudioFormat;
  label: string;
}[] = [
  { value: "mp3", label: "mp3" },
  { value: "wav", label: "wav" },
  { value: "aac", label: "aac" },
];

/** Mirrors Galaxy default estimate (~0.02M). */
export function estimateExtractAudioCredits(_input?: Partial<ExtractAudioInput>): number {
  return 20_000;
}

export const extractAudioNodeUi: NodeUiConfig = {
  title: EXTRACT_AUDIO_DISPLAY_NAME,
  description: EXTRACT_AUDIO_DESCRIPTION,
  category: "video",
  handles: [
    { id: "in:video_url", label: "Video", kind: "input", dataType: "video" },
    { id: "in:format", label: "Format", kind: "input", dataType: "enum" },
    { id: "out:audio_url", label: "Extracted Audio", kind: "output", dataType: "audio" },
  ],
  fields: [
    {
      key: "video_url",
      label: "Video",
      handleId: "in:video_url",
      control: "image_upload",
      layout: "image_upload",
      group: "primary",
      dataType: "video",
      required: true,
      handleTop: 12,
    },
    {
      key: "format",
      label: "Format",
      handleId: "in:format",
      control: "select",
      layout: "inline",
      group: "primary",
      dataType: "enum",
      optionsKey: "EXTRACT_AUDIO_FORMAT_OPTIONS",
      handleTop: 20,
      handleVariant: "text",
      helpTooltip: "Output audio format for the extracted track.",
    },
  ],
  defaults: {
    label: EXTRACT_AUDIO_DISPLAY_NAME,
    config: {
      providers: ["extract-audio-ffmpeg"],
      timeoutMs: 300_000,
      retryPerProvider: 2,
    },
    inputs: {
      video_url: "",
      format: "mp3",
    },
  },
  pricing: {
    estimateCredits: estimateExtractAudioCredits(),
  },
};
