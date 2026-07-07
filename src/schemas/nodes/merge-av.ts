import { z } from "zod";
import type { NodeUiConfig } from "../../nodes/types";

export const MERGE_AV_DISPLAY_NAME = "Merge Audio & Video";
export const MERGE_AV_DESCRIPTION = "Combine audio track with video";

export const MergeAvInputSchema = z.object({
  video_url: z.string().url(),
  audio_url: z.string().url(),
  audio_volume: z.coerce.number().min(0).max(2).default(1),
});

export type MergeAvInput = z.infer<typeof MergeAvInputSchema>;

export const MergeAvOutputSchema = z.object({
  video_url: z.string().url(),
});

export type MergeAvOutput = z.infer<typeof MergeAvOutputSchema>;

/** Mirrors Galaxy default estimate (~0.03M). */
export function estimateMergeAvCredits(_input?: Partial<MergeAvInput>): number {
  return 30_000;
}

export const mergeAvNodeUi: NodeUiConfig = {
  title: MERGE_AV_DISPLAY_NAME,
  description: MERGE_AV_DESCRIPTION,
  category: "video",
  handles: [
    { id: "in:video_url", label: "Video", kind: "input", dataType: "video" },
    { id: "in:audio_url", label: "Audio", kind: "input", dataType: "audio" },
    { id: "in:audio_volume", label: "Audio Volume", kind: "input", dataType: "number" },
    { id: "out:video_url", label: "Merged Video", kind: "output", dataType: "video" },
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
      key: "audio_url",
      label: "Audio",
      handleId: "in:audio_url",
      control: "image_upload",
      layout: "image_upload",
      group: "primary",
      dataType: "audio",
      required: true,
      handleTop: 12,
    },
    {
      key: "audio_volume",
      label: "Audio Volume",
      handleId: "in:audio_volume",
      control: "slider",
      layout: "slider",
      group: "primary",
      dataType: "number",
      handleTop: 14,
      numberMin: 0,
      numberMax: 2,
      numberStep: 0.1,
      resetValue: 1,
    },
  ],
  defaults: {
    label: MERGE_AV_DISPLAY_NAME,
    config: {
      providers: ["merge-av-ffmpeg"],
      timeoutMs: 300_000,
      retryPerProvider: 2,
    },
    inputs: {
      video_url: "",
      audio_url: "",
      audio_volume: 1,
    },
  },
  pricing: {
    estimateCredits: estimateMergeAvCredits(),
  },
};
