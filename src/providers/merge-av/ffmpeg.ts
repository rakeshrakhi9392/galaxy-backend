import {
  MergeAvInputSchema,
  MergeAvOutputSchema,
  type MergeAvInput,
  type MergeAvOutput,
} from "@galaxy/schemas";
import { mergeAudioVideoWithFfmpeg } from "@/lib/ffmpeg/mergeAudioVideo";
import type { NodeProvider, ProviderContext, ProviderResult } from "../types";

export async function executeMergeAvFfmpeg(
  input: MergeAvInput,
  _ctx: ProviderContext,
): Promise<ProviderResult<MergeAvOutput>> {
  const started = Date.now();
  const output = await mergeAudioVideoWithFfmpeg(input);

  return {
    provider: "merge-av-ffmpeg",
    sleptMs: Date.now() - started,
    output: MergeAvOutputSchema.parse(output),
  };
}

export const mergeAvFfmpegProvider: NodeProvider<MergeAvInput, MergeAvOutput> = {
  id: "merge-av-ffmpeg",
  input: MergeAvInputSchema,
  output: MergeAvOutputSchema,
  execute: executeMergeAvFfmpeg,
};
