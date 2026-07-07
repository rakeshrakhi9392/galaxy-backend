export type MediaUrlMetadata = {
  bytes: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

export type MediaMetadataCache = (url: string) => Promise<MediaUrlMetadata>;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePositiveFloat(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDimensionsParam(value: string | null): { width: number; height: number } | null {
  if (!value) return null;
  const match = /^(\d+)[xX](\d+)$/.exec(value.trim());
  if (!match) return null;
  const width = Number.parseInt(match[1]!, 10);
  const height = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function dataUrlByteLength(url: string): number | null {
  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) return null;
  const meta = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  if (/;base64$/i.test(meta)) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.floor((payload.length * 3) / 4) - padding;
  }
  try {
    return Buffer.byteLength(decodeURIComponent(payload), "utf8");
  } catch {
    return null;
  }
}

/** Parse metadata embedded in URL query params (Galaxy-style hints). */
export function parseMediaUrlHints(url: string): MediaUrlMetadata {
  if (url.startsWith("data:")) {
    return {
      bytes: dataUrlByteLength(url),
      durationSec: null,
      width: null,
      height: null,
    };
  }

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    const bytes =
      parsePositiveInt(params.get("bytes")) ?? parsePositiveInt(params.get("size"));

    const durationSec =
      parsePositiveFloat(params.get("durationSec")) ??
      parsePositiveFloat(params.get("duration")) ??
      parsePositiveFloat(params.get("dur"));

    const width =
      parsePositiveInt(params.get("width")) ?? parsePositiveInt(params.get("w"));
    const height =
      parsePositiveInt(params.get("height")) ?? parsePositiveInt(params.get("h"));

    const dimensions =
      parseDimensionsParam(params.get("resolution")) ??
      parseDimensionsParam(params.get("dimensions"));

    return {
      bytes,
      durationSec,
      width: width ?? dimensions?.width ?? null,
      height: height ?? dimensions?.height ?? null,
    };
  } catch {
    return {
      bytes: null,
      durationSec: null,
      width: null,
      height: null,
    };
  }
}

export function maxDimension(width: number | null, height: number | null): number | null {
  if (width === null || height === null) return null;
  return Math.max(width, height);
}

export function parseSizeEnumDimensions(
  size: string,
): { width: number; height: number } | null {
  if (size === "auto" || size === "custom") return null;
  return parseDimensionsParam(size);
}

export function mergeMediaMetadata(
  hints: MediaUrlMetadata,
  probed: MediaUrlMetadata,
): MediaUrlMetadata {
  return {
    bytes: hints.bytes ?? probed.bytes,
    durationSec: hints.durationSec ?? probed.durationSec,
    width: hints.width ?? probed.width,
    height: hints.height ?? probed.height,
  };
}

/** Attach Galaxy-style metadata query params without overwriting existing hints. */
export function appendMediaUrlHints(
  url: string,
  hints: Partial<MediaUrlMetadata>,
): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  try {
    const parsed = new URL(url);

    if (
      hints.bytes != null &&
      hints.bytes > 0 &&
      !parsed.searchParams.has("bytes") &&
      !parsed.searchParams.has("size")
    ) {
      parsed.searchParams.set("bytes", String(Math.round(hints.bytes)));
    }

    if (
      hints.durationSec != null &&
      hints.durationSec > 0 &&
      !parsed.searchParams.has("durationSec") &&
      !parsed.searchParams.has("duration") &&
      !parsed.searchParams.has("dur")
    ) {
      parsed.searchParams.set("durationSec", String(hints.durationSec));
    }

    if (
      hints.width != null &&
      hints.width > 0 &&
      !parsed.searchParams.has("width") &&
      !parsed.searchParams.has("w")
    ) {
      parsed.searchParams.set("width", String(Math.round(hints.width)));
    }

    if (
      hints.height != null &&
      hints.height > 0 &&
      !parsed.searchParams.has("height") &&
      !parsed.searchParams.has("h")
    ) {
      parsed.searchParams.set("height", String(Math.round(hints.height)));
    }

    return parsed.toString();
  } catch {
    return url;
  }
}
