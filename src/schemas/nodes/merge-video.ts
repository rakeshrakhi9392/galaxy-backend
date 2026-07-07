import { z } from "zod";
import type { NodeUiConfig } from "../../nodes/types";

export const MERGE_VIDEO_DISPLAY_NAME = "Merge Videos";
export const MERGE_VIDEO_DESCRIPTION = "Concatenate multiple videos into one";

const urlArraySchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string" && item.length > 0);
    }
    if (typeof value === "string" && value.length > 0) return [value];
    return [];
  },
  z.array(z.string()).default([]),
);

export const MergeVideoTransitionSchema = z.enum(["none", "fade", "dissolve"]);

export type MergeVideoTransition = z.infer<typeof MergeVideoTransitionSchema>;

export const MergeVideoInputSchema = z.object({
  video_urls: urlArraySchema,
  transition: MergeVideoTransitionSchema.default("none"),
});

export type MergeVideoInput = z.infer<typeof MergeVideoInputSchema>;

export const MergeVideoOutputSchema = z.object({
  video_url: z.string().url(),
});

export type MergeVideoOutput = z.infer<typeof MergeVideoOutputSchema>;

export const MERGE_VIDEO_TRANSITION_OPTIONS: {
  value: MergeVideoTransition;
  label: string;
}[] = [
  { value: "none", label: "none" },
  { value: "fade", label: "fade" },
  { value: "dissolve", label: "dissolve" },
];

/** Mirrors Galaxy default estimate (~0.04M). */
export function estimateMergeVideoCredits(input: Partial<MergeVideoInput>): number {
  const parsed = MergeVideoInputSchema.partial().safeParse(input);
  const data = parsed.success ? parsed.data : {};
  const count = data.video_urls?.length ?? 0;
  const base = 40_000;
  const perClip = 5_000;
  const transitionMultiplier = data.transition && data.transition !== "none" ? 1.25 : 1;
  const clips = Math.max(count, 2);
  return Math.round((base + perClip * (clips - 2)) * transitionMultiplier);
}

export const mergeVideoNodeUi: NodeUiConfig = {
  title: MERGE_VIDEO_DISPLAY_NAME,
  description: MERGE_VIDEO_DESCRIPTION,
  category: "video",
  handles: [
    { id: "in:video_urls", label: "Videos", kind: "input", dataType: "video_list" },
    { id: "in:transition", label: "Transition", kind: "input", dataType: "enum" },
    { id: "out:video_url", label: "Merged Video", kind: "output", dataType: "video" },
  ],
  fields: [
    {
      key: "video_urls",
      label: "Videos",
      handleId: "in:video_urls",
      control: "image_upload",
      layout: "image_upload",
      group: "primary",
      dataType: "video_list",
      required: true,
      handleTop: 12,
    },
    {
      key: "transition",
      label: "Transition",
      handleId: "in:transition",
      control: "select",
      layout: "inline",
      group: "primary",
      dataType: "enum",
      optionsKey: "MERGE_VIDEO_TRANSITION_OPTIONS",
      handleTop: 20,
      handleVariant: "text",
      helpTooltip: "Allowed values: none, fade, dissolve.",
    },
  ],
  defaults: {
    label: MERGE_VIDEO_DISPLAY_NAME,
    config: {
      providers: ["merge-video-ffmpeg"],
      timeoutMs: 300_000,
      retryPerProvider: 2,
    },
    inputs: {
      video_urls: [],
      transition: "none",
    },
  },
  pricing: {
    estimateCredits: estimateMergeVideoCredits({
      video_urls: [],
      transition: "none",
    }),
  },
};
