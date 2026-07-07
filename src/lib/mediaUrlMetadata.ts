import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { probeMediaFull } from "./ffmpeg/probe";
import {
  mergeMediaMetadata,
  parseMediaUrlHints,
  type MediaUrlMetadata,
} from "./mediaUrlHints";

export type { MediaUrlMetadata } from "./mediaUrlHints";
export {
  dataUrlByteLength,
  maxDimension,
  parseMediaUrlHints,
  parseSizeEnumDimensions,
} from "./mediaUrlHints";

const EMPTY_METADATA: MediaUrlMetadata = {
  bytes: null,
  durationSec: null,
  width: null,
  height: null,
};

async function fetchContentLength(url: string): Promise<number | null> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return null;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const header = response.headers.get("content-length");
      if (header) {
        const n = Number.parseInt(header, 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  } catch {
    // fall through to ranged GET
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 206) return null;

    const contentRange = response.headers.get("content-range");
    const totalMatch = contentRange?.match(/\/(\d+)\s*$/);
    if (totalMatch?.[1]) {
      const n = Number.parseInt(totalMatch[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }

    const header = response.headers.get("content-length");
    if (header) {
      const n = Number.parseInt(header, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    return null;
  }

  return null;
}

function extensionFromContentType(contentType: string | null): string | null {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (normalized) {
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/aac":
      return ".aac";
    case "audio/flac":
      return ".flac";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return null;
  }
}

function extensionFromUrlPath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = /\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|mkv|avi|jpg|jpeg|png|webp|gif|pdf)$/i.exec(
      pathname,
    );
    return match ? match[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function writeDataUrlToTempFile(url: string): Promise<{ dir: string; path: string }> {
  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL.");
  }

  const meta = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const isBase64 = /;base64$/i.test(meta);
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  const dir = await mkdtemp(join(tmpdir(), "galaxy-media-probe-"));
  const path = join(dir, randomUUID());
  await writeFile(path, buffer);
  return { dir, path };
}

async function probeSource(source: string): Promise<MediaUrlMetadata> {
  try {
    const result = await probeMediaFull(source);
    return {
      bytes: result.bytes,
      durationSec: result.durationSec > 0 ? result.durationSec : null,
      width: result.width,
      height: result.height,
    };
  } catch {
    return { ...EMPTY_METADATA };
  }
}

function metadataIsEmpty(metadata: MediaUrlMetadata): boolean {
  return (
    metadata.bytes === null &&
    metadata.durationSec === null &&
    metadata.width === null &&
    metadata.height === null
  );
}

async function downloadToTempProbe(
  url: string,
): Promise<{ dir: string; path: string; bytes: number }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Failed to download media for probe (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), "galaxy-media-probe-"));
  const extension =
    extensionFromContentType(response.headers.get("content-type")) ??
    extensionFromUrlPath(url) ??
    ".bin";
  const path = join(dir, `${randomUUID()}${extension}`);
  await writeFile(path, buffer);
  return { dir, path, bytes: buffer.length };
}

/** Resolve file size, duration, and resolution from URL hints, HEAD, and ffprobe. */
export async function resolveMediaMetadata(url: string): Promise<MediaUrlMetadata> {
  const hints = parseMediaUrlHints(url);

  const needsBytes = hints.bytes === null;
  const needsDuration = hints.durationSec === null;
  const needsDimensions = hints.width === null || hints.height === null;
  const needsProbe = needsDuration || needsDimensions;

  if (!needsBytes && !needsProbe) {
    return hints;
  }

  let probed: MediaUrlMetadata = { ...EMPTY_METADATA };
  let tempDir: string | null = null;

  try {
    if (needsProbe) {
      if (url.startsWith("data:")) {
        const temp = await writeDataUrlToTempFile(url);
        tempDir = temp.dir;
        probed = await probeSource(temp.path);
      } else if (!url.startsWith("blob:")) {
        probed = await probeSource(url);
        if (metadataIsEmpty(probed) && url.startsWith("http")) {
          try {
            const temp = await downloadToTempProbe(url);
            tempDir = temp.dir;
            probed = await probeSource(temp.path);
            if (probed.bytes === null) {
              probed = { ...probed, bytes: temp.bytes };
            }
          } catch {
            // URL hints / HEAD may still be enough; ignore unreachable media in validation.
          }
        }
      }
    }

    if (needsBytes && hints.bytes === null && probed.bytes === null && !url.startsWith("blob:")) {
      const contentLength = await fetchContentLength(url);
      if (contentLength !== null) {
        probed = { ...probed, bytes: contentLength };
      }
    }
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return mergeMediaMetadata(hints, probed);
}

export type MediaMetadataCache = (url: string) => Promise<MediaUrlMetadata>;

export function createMediaMetadataCache(): MediaMetadataCache {
  const cache = new Map<string, Promise<MediaUrlMetadata>>();
  return (url: string) => {
    let pending = cache.get(url);
    if (!pending) {
      pending = resolveMediaMetadata(url);
      cache.set(url, pending);
    }
    return pending;
  };
}
