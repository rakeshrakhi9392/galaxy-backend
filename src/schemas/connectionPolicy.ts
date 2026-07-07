import type { HandleDataType } from "./handleTypes";

/**
 * Handles that accept only one incoming edge.
 * All text inputs are single-wire. Crop-style main-image exclusivity is omitted
 * — this project has no crop nodes.
 */
export function isSingleIncomingHandle(
  targetHandle: string | null | undefined,
  dataType?: HandleDataType,
): boolean {
  if (dataType === "text") return true;
  if (!targetHandle) return false;
  const field = targetHandle.startsWith("in:") ? targetHandle.slice(3) : targetHandle;
  const leaf = field.includes(".") ? (field.split(".").pop() ?? field) : field;
  return leaf === "prompt" || leaf === "system_prompt" || leaf === "stop";
}

/** Response result accepts text or image outputs only. */
export function isResponseCompatibleSource(source: HandleDataType): boolean {
  return (
    source === "any" ||
    source === "text" ||
    source === "image" ||
    source === "image_list"
  );
}

export function inputFieldFromHandle(targetHandle: string | null | undefined): string | null {
  if (!targetHandle) return null;
  if (targetHandle === "result") return "result";
  if (targetHandle.startsWith("in:")) return targetHandle.slice(3);
  return targetHandle;
}

export function valueToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => valueToText(item))
      .filter((item) => item.length > 0)
      .join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") return record.url;
    if (typeof record.output === "string") return record.output;
    if (typeof record.text === "string") return record.text;
  }
  return "";
}

export function valueToUrlList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => valueToUrlList(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && record.url.trim()) return [record.url.trim()];
    if (Array.isArray(record.urls)) return valueToUrlList(record.urls);
    if (Array.isArray(record.result)) return valueToUrlList(record.result);
  }
  return [];
}

/** Join non-empty text contributions with newlines (edge order). */
export function mergeWiredText(values: unknown[]): string {
  return values
    .map((value) => valueToText(value).trim())
    .filter((text) => text.length > 0)
    .join("\n");
}

/** Merge media URLs, de-dupe, apply max count. */
export function mergeWiredUrls(values: unknown[], maxCount = 32): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    for (const url of valueToUrlList(value)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= maxCount) return urls;
    }
  }
  return urls;
}

/** First non-empty line, parsed as number; null if invalid. */
export function parseWiredNumber(value: unknown): number | null {
  const text = valueToText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** First non-empty line as boolean; null if not recognizable. */
export function parseWiredBoolean(value: unknown): boolean | null {
  const text = valueToText(value)
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .find((line) => line.length > 0);
  if (!text) return null;
  if (text === "true" || text === "1" || text === "yes" || text === "on") return true;
  if (text === "false" || text === "0" || text === "no" || text === "off") return false;
  return null;
}

export function isMediaFieldKey(field: string): boolean {
  const leaf = field.includes(".") ? (field.split(".").pop() ?? field) : field;
  return (
    leaf === "image" ||
    leaf === "image_url" ||
    leaf === "image_urls" ||
    leaf === "video_url" ||
    leaf === "video_urls" ||
    leaf === "audio_url" ||
    leaf === "audio_urls" ||
    leaf === "frontal_image_url" ||
    leaf === "reference_image_urls" ||
    leaf.endsWith("_urls") ||
    leaf.endsWith("_url")
  );
}

export function isListMediaField(field: string): boolean {
  const leaf = field.includes(".") ? (field.split(".").pop() ?? field) : field;
  return leaf.endsWith("_urls") || leaf === "image_urls" || leaf === "video_urls" || leaf === "audio_urls";
}
