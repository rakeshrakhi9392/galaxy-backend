import { createHmac, timingSafeEqual } from "crypto";
import { ApiError } from "@/lib/api";

const SSE_TOKEN_TTL_SEC = 300;

type SsePayload = {
  runId: string;
  ownerId: string;
  exp: number;
};

function getSigningSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new ApiError(503, "INTERNAL_ERROR", "Authentication is not configured");
  }
  return secret;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`sse:${body}`).digest("base64url");
}

/** Issue a short-lived, run-scoped token for SSE (avoids session JWT in URLs). */
export function createSseToken(runId: string, ownerId: string): string {
  const secret = getSigningSecret();
  const exp = Math.floor(Date.now() / 1000) + SSE_TOKEN_TTL_SEC;
  const body = Buffer.from(JSON.stringify({ runId, ownerId, exp } satisfies SsePayload)).toString(
    "base64url",
  );
  return `${body}.${sign(body, secret)}`;
}

/** Verify SSE token; returns ownerId or throws. */
export function verifySseToken(runId: string, token: string): string {
  const secret = getSigningSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid SSE token");
  }

  const expected = sign(body, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid SSE token");
  }

  let payload: SsePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SsePayload;
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid SSE token");
  }

  if (payload.runId !== runId) {
    throw new ApiError(401, "UNAUTHORIZED", "SSE token scope mismatch");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "UNAUTHORIZED", "SSE token expired");
  }

  return payload.ownerId;
}
