import { ApiError } from "@/lib/api";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { verifyClerkToken } from "./clerk-verify";
import { isApiKeyCredential } from "./credentials";
import type { RequestAuth } from "./types";

function isAuthDisabled(): boolean {
  return (
    process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production"
  );
}

/**
 * Edge-safe bearer resolution for middleware.
 * API keys (`gal_`) are deferred to route handlers (they need Prisma).
 */
export async function resolveMiddlewareBearerAuth(
  token: string,
): Promise<RequestAuth | "defer"> {
  if (isAuthDisabled()) {
    return { userId: MOCK_OWNER_USER_ID, method: "dev_bypass" };
  }

  if (isApiKeyCredential(token)) {
    return "defer";
  }

  return verifyClerkToken(token);
}
