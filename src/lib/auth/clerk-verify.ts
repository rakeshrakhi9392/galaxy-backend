import { verifyToken } from "@clerk/backend";
import { ApiError } from "@/lib/api";
import type { RequestAuth } from "./types";

function getClerkSecretKey(): string | null {
  return process.env.CLERK_SECRET_KEY?.trim() || null;
}

function getClerkFrontendOrigins(): string[] {
  const key =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    process.env.CLERK_PUBLISHABLE_KEY?.trim();
  if (!key) return [];

  try {
    const encoded = key.replace(/^pk_(test|live)_/, "");
    const host = atob(encoded).replace(/\$$/, "");
    if (!host) return [];
    return [`https://${host}`];
  } catch {
    return [];
  }
}

function getAuthorizedParties(): string[] {
  const parties = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...getClerkFrontendOrigins(),
  ].filter(Boolean) as string[];

  return [...new Set(parties)];
}

/** Verify a Clerk session JWT. Safe for Edge middleware (no Node-only deps). */
export async function verifyClerkToken(token: string): Promise<RequestAuth> {
  const secretKey = getClerkSecretKey();
  if (!secretKey) {
    throw new ApiError(503, "INTERNAL_ERROR", "Authentication is not configured", {
      cause: "missing_clerk_secret",
    });
  }

  const authorizedParties = getAuthorizedParties();
  const verifyOptions = {
    secretKey,
    clockSkewInMs: process.env.NODE_ENV === "production" ? 5000 : 60_000,
  };

  try {
    const payload = await verifyToken(token, {
      ...verifyOptions,
      authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
    });
    if (!payload.sub) {
      throw new Error("Missing subject");
    }
    return {
      userId: payload.sub,
      method: "clerk",
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch (firstErr) {
    if (firstErr instanceof ApiError) throw firstErr;

    if (process.env.NODE_ENV !== "production") {
      try {
        const payload = await verifyToken(token, verifyOptions);
        if (!payload.sub) {
          throw new Error("Missing subject");
        }
        return {
          userId: payload.sub,
          method: "clerk",
          sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
        };
      } catch (retryErr) {
        if (retryErr instanceof ApiError) throw retryErr;
      }
    }

    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token", {
      cause: "clerk_token_invalid",
    });
  }
}
