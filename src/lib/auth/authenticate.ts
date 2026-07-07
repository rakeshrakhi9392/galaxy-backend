import { ApiError } from "@/lib/api";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { authenticateApiKey } from "./apiKey";
import { verifyClerkToken } from "./clerk-verify";
import { isApiKeyCredential } from "./credentials";
import type { RequestAuth } from "./types";

function isAuthDisabled(): boolean {
  return (
    process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production"
  );
}

export { isApiKeyCredential } from "./credentials";

/**
 * Resolve identity from a bearer credential.
 * Supports Clerk JWT and Unkey-backed API keys (`gal_` prefix).
 */
export async function authenticateCredential(token: string): Promise<RequestAuth> {
  if (isAuthDisabled()) {
    return { userId: MOCK_OWNER_USER_ID, method: "dev_bypass" };
  }

  if (isApiKeyCredential(token)) {
    return authenticateApiKey(token);
  }

  return verifyClerkToken(token);
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}
