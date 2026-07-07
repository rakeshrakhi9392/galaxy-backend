import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import {
  enforceStandaloneRateLimit,
  isUnkeyConfigured,
  verifyUnkeyApiKey,
} from "@/lib/unkey";
import type { RequestAuth } from "./types";

const DEV_UNKEY_KEY_ID = "dev_local_key";

export function getApiKeyPrefix(token: string): string {
  return token.slice(0, 12);
}

async function resolveLocalApiKeyRecord(unkeyKeyId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { unkeyKeyId, revokedAt: null },
  });

  if (!apiKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or revoked API key", {
      cause: "api_key_not_found",
    });
  }

  return apiKey;
}

async function touchApiKeyLastUsed(apiKeyId: string) {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date() },
  });
}

async function authenticateDevApiKey(token: string): Promise<RequestAuth> {
  const devKey = process.env.DEV_API_KEY?.trim();
  if (!devKey || token !== devKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or revoked API key", {
      cause: "invalid_dev_api_key",
    });
  }

  const apiKey = await resolveLocalApiKeyRecord(DEV_UNKEY_KEY_ID);
  await enforceStandaloneRateLimit(`api_key:${apiKey.id}`);
  await touchApiKeyLastUsed(apiKey.id);

  return {
    userId: apiKey.userId,
    method: "api_key",
    apiKeyId: apiKey.id,
  };
}

export async function authenticateApiKey(token: string): Promise<RequestAuth> {
  if (!isUnkeyConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "INTERNAL_ERROR", "API key authentication is not configured", {
        cause: "unkey_not_configured",
      });
    }
    return authenticateDevApiKey(token);
  }

  const verification = await verifyUnkeyApiKey(token);
  const apiKey = await resolveLocalApiKeyRecord(verification.unkeyKeyId);

  await enforceStandaloneRateLimit(`api_key:${apiKey.id}`);
  await touchApiKeyLastUsed(apiKey.id);

  return {
    userId: apiKey.userId,
    method: "api_key",
    apiKeyId: apiKey.id,
  };
}

export { DEV_UNKEY_KEY_ID };
