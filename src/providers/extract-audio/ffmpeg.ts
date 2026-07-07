import {
  ExtractAudioInputSchema,
  ExtractAudioOutputSchema,
  type ExtractAudioInput,
  type ExtractAudioOutput,
} from "@galaxy/schemas";
import { extractAudioWithFfmpeg } from "@/lib/ffmpeg/extractAudio";
import type { NodeProvider, ProviderContext, ProviderResult } from "../types";

export async function executeExtractAudioFfmpeg(
  input: ExtractAudioInput,
  _ctx: ProviderContext,
): Promise<ProviderResult<ExtractAudioOutput>> {
  const started = Date.now();
  const output = await extractAudioWithFfmpeg(input);

  return {
    provider: "extract-audio-ffmpeg",
    sleptMs: Date.now() - started,
    output: ExtractAudioOutputSchema.parse(output),
  };
}

export const extractAudioFfmpegProvider: NodeProvider<ExtractAudioInput, ExtractAudioOutput> = {
  id: "extract-audio-ffmpeg",
  input: ExtractAudioInputSchema,
  output: ExtractAudioOutputSchema,
  execute: executeExtractAudioFfmpeg,
};
