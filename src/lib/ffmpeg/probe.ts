import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveFfprobeBinary } from "./binaries";

const execFileAsync = promisify(execFile);

export type MediaProbeResult = {
  durationSec: number;
  hasAudio: boolean;
  hasVideo: boolean;
};

export type FullMediaProbeResult = MediaProbeResult & {
  bytes: number | null;
  width: number | null;
  height: number | null;
};

type FfprobeJson = {
  format?: { duration?: string; size?: string };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
};

function parseProbeJson(parsed: FfprobeJson): FullMediaProbeResult {
  const durationSec = Number.parseFloat(parsed.format?.duration ?? "0");
  const sizeBytes = Number.parseInt(parsed.format?.size ?? "", 10);
  const streams = parsed.streams ?? [];

  let width: number | null = null;
  let height: number | null = null;
  for (const stream of streams) {
    if (stream.codec_type === "video" || stream.codec_type === "image") {
      if (typeof stream.width === "number" && stream.width > 0) width = stream.width;
      if (typeof stream.height === "number" && stream.height > 0) height = stream.height;
      if (width !== null && height !== null) break;
    }
  }

  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    hasVideo: streams.some((stream) => stream.codec_type === "video"),
    bytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : null,
    width,
    height,
  };
}

export async function probeMediaFull(source: string): Promise<FullMediaProbeResult> {
  const { stdout } = await execFileAsync(resolveFfprobeBinary(), [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=codec_type,width,height",
    "-of",
    "json",
    source,
  ]);

  return parseProbeJson(JSON.parse(stdout) as FfprobeJson);
}

export async function probeMedia(filePath: string): Promise<MediaProbeResult> {
  const full = await probeMediaFull(filePath);
  return {
    durationSec: full.durationSec,
    hasAudio: full.hasAudio,
    hasVideo: full.hasVideo,
  };
}
