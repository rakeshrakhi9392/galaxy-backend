import { ApiError } from "@/lib/api";
import type { RequestAuth } from "./types";

export const AUTH_CONTEXT_HEADER = "x-galaxy-auth";

/** Legacy header — stripped on every request; never trusted. */
export const LEGACY_USER_ID_HEADER = "x-clerk-user-id";

const AUTH_CONTEXT_TTL_SEC = 60;

type SignedAuthPayload = RequestAuth & { exp: number };

function getSigningSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (secret) return secret;
  if (process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production") {
    return "galaxy-dev-auth-context";
  }
  throw new ApiError(503, "INTERNAL_ERROR", "Authentication is not configured");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string): Uint8Array {
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`auth:${body}`),
  );
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Encode a signed auth context for middleware → route handoff. */
export async function encodeAuthContext(auth: RequestAuth): Promise<string> {
  const secret = getSigningSecret();
  const exp = Math.floor(Date.now() / 1000) + AUTH_CONTEXT_TTL_SEC;
  const body = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ ...auth, exp } satisfies SignedAuthPayload),
    ),
  );
  return `${body}.${await sign(body, secret)}`;
}

/** Decode and verify a signed auth context. Rejects spoofed or expired payloads. */
export async function decodeAuthContext(header: string): Promise<RequestAuth> {
  const secret = getSigningSecret();
  const [body, sig] = header.split(".");
  if (!body || !sig) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid auth context");
  }

  const expected = await sign(body, secret);
  if (!timingSafeEqualString(sig, expected)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid auth context");
  }

  let payload: SignedAuthPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SignedAuthPayload;
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid auth context");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "UNAUTHORIZED", "Auth context expired");
  }

  return {
    userId: payload.userId,
    method: payload.method,
    sessionId: payload.sessionId,
    apiKeyId: payload.apiKeyId,
  };
}

/** Remove client-supplied identity headers before middleware sets trusted values. */
export function stripIdentityHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  next.delete(AUTH_CONTEXT_HEADER);
  next.delete(LEGACY_USER_ID_HEADER);
  return next;
}
