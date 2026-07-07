import type { RunInitiator } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { provisionUserWithCredits } from "@/lib/creditsLedger";
import { AUTH_CONTEXT_HEADER, decodeAuthContext } from "./context";
import { authenticateCredential, getBearerToken } from "./authenticate";
import type { AuthMethod, RequestAuth } from "./types";

function isAuthDisabled(): boolean {
  return (
    process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production"
  );
}

/** Create user row on first API call if webhook hasn't synced yet. */
async function ensureUserExists(userId: string) {
  await provisionUserWithCredits(userId);
}

/**
 * Read authenticated identity for a route handler.
 * Identity is resolved once in middleware; routes must not re-verify JWTs.
 */
export async function getAuth(req: Request): Promise<RequestAuth> {
  const header = req.headers.get(AUTH_CONTEXT_HEADER)?.trim();
  if (header) {
    const auth = await decodeAuthContext(header);
    await ensureUserExists(auth.userId);
    return auth;
  }

  if (isAuthDisabled()) {
    return { userId: MOCK_OWNER_USER_ID, method: "dev_bypass" };
  }

  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const auth = await authenticateCredential(token);
  await ensureUserExists(auth.userId);
  return auth;
}

/** Map auth method to run initiator for audit trail. */
export function authMethodToInitiator(method: AuthMethod): RunInitiator {
  switch (method) {
    case "api_key":
      return "API";
    case "clerk":
    case "dev_bypass":
    default:
      return "UI";
  }
}

/** Sync user from Clerk webhook (not on every API request). */
export async function syncClerkUser(userId: string, email?: string | null) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (existing) {
    if (email) {
      await prisma.user.update({
        where: { id: userId },
        data: { email },
      });
    }
    return;
  }

  await provisionUserWithCredits(userId, email ?? undefined);
}

/** Ensure a user row exists (seed/dev helper). */
export async function ensureUser(userId: string, email?: string | null) {
  await syncClerkUser(userId, email);
}
