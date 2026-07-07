import {
  MergeVideoInputSchema,
  MergeVideoOutputSchema,
  type MergeVideoInput,
  type MergeVideoOutput,
} from "@galaxy/schemas";
import { mergeVideosWithFfmpeg } from "@/lib/ffmpeg/mergeVideos";
import type { NodeProvider, ProviderContext, ProviderResult } from "../types";

export async function executeMergeVideoFfmpeg(
  input: MergeVideoInput,
  _ctx: ProviderContext,
): Promise<ProviderResult<MergeVideoOutput>> {
  const started = Date.now();
  const output = await mergeVideosWithFfmpeg(input);

  return {
    provider: "merge-video-ffmpeg",
    sleptMs: Date.now() - started,
    output: MergeVideoOutputSchema.parse(output),
  };
}

export const mergeVideoFfmpegProvider: NodeProvider<MergeVideoInput, MergeVideoOutput> = {
  id: "merge-video-ffmpeg",
  input: MergeVideoInputSchema,
  output: MergeVideoOutputSchema,
  execute: executeMergeVideoFfmpeg,
};
