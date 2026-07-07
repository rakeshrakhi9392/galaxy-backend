import { NextResponse } from "next/server";
import { jsonOk } from "@/lib/api";

/** Strong ETag from stable identity parts (quoted per RFC 9110). */
export function buildEtag(parts: Array<string | number>): string {
  return `"${parts.join(":")}"`;
}

export function ifNoneMatchMatches(req: Request, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;

  const candidates = header.split(",").map((value) => value.trim());
  if (candidates.includes("*")) return true;

  return candidates.some(
    (value) => value === etag || value === `W/${etag}` || etag === `W/${value}`,
  );
}

const CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
} as const;

export function jsonOkWithEtag<T>(data: T, etag: string) {
  return jsonOk(data, {
    headers: {
      ...CACHE_HEADERS,
      ETag: etag,
    },
  });
}

export function notModified(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ...CACHE_HEADERS,
      ETag: etag,
    },
  });
}

/** Return 304 when the client already has this representation; otherwise 200 + body + ETag. */
export function respondWithEtag<T>(req: Request, etag: string, data: T): NextResponse | Response {
  if (ifNoneMatchMatches(req, etag)) {
    return notModified(etag);
  }
  return jsonOkWithEtag(data, etag);
}
