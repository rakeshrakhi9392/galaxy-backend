import { Unkey } from "@unkey/api";
import { Ratelimit } from "@unkey/ratelimit";
import { ApiError } from "@/lib/api";

let unkeyClient: Unkey | null = null;
let apiRateLimiter: Ratelimit | null = null;

function getUnkeyRootKey(): string | null {
  return process.env.UNKEY_ROOT_KEY?.trim() || null;
}

export function getUnkeyApiId(): string | null {
  return process.env.UNKEY_API_ID?.trim() || null;
}

export function isUnkeyConfigured(): boolean {
  return Boolean(getUnkeyRootKey() && getUnkeyApiId());
}

export function getUnkeyClient(): Unkey {
  const rootKey = getUnkeyRootKey();
  if (!rootKey) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unkey is not configured", {
      cause: "missing_unkey_root_key",
    });
  }

  if (!unkeyClient) {
    unkeyClient = new Unkey({ rootKey });
  }

  return unkeyClient;
}

function getApiRateLimiter(): Ratelimit {
  const rootKey = getUnkeyRootKey();
  if (!rootKey) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unkey is not configured", {
      cause: "missing_unkey_root_key",
    });
  }

  if (!apiRateLimiter) {
    apiRateLimiter = new Ratelimit({
      rootKey,
      namespace: process.env.UNKEY_RATELIMIT_NAMESPACE?.trim() || "galaxy-api",
      limit: Number(process.env.UNKEY_RATELIMIT_LIMIT ?? 100),
      duration: Number(process.env.UNKEY_RATELIMIT_DURATION_MS ?? 60_000),
    });
  }

  return apiRateLimiter;
}

function getPrimaryRatelimit(data: {
  ratelimits?: Array<{ exceeded: boolean; remaining: number; reset: number }>;
}) {
  return data.ratelimits?.find((entry) => entry.exceeded) ?? data.ratelimits?.[0];
}

export type UnkeyVerifyResult = {
  valid: true;
  unkeyKeyId: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
};

export async function verifyUnkeyApiKey(token: string): Promise<UnkeyVerifyResult> {
  const unkey = getUnkeyClient();
  const ratelimitName = process.env.UNKEY_RATELIMIT_NAME?.trim();

  let response;
  try {
    response = await unkey.keys.verifyKey({
      key: token,
      ...(ratelimitName
        ? {
            ratelimits: [
              {
                name: ratelimitName,
                cost: 1,
              },
            ],
          }
        : {}),
    });
  } catch (err) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unable to verify API key", {
      cause: err instanceof Error ? err.message : "unkey_verify_failed",
    });
  }

  const data = response.data;
  const ratelimit = getPrimaryRatelimit(data);

  if (!data.valid) {
    if (data.code === "RATE_LIMITED") {
      throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded", {
        cause: "unkey_rate_limited",
        metadata: {
          remaining: ratelimit?.remaining ?? 0,
          reset: ratelimit ? Math.max(1, Math.ceil(ratelimit.reset / 1000)) : 60,
        },
      });
    }

    throw new ApiError(401, "UNAUTHORIZED", "Invalid or revoked API key", {
      cause: data.code ?? "invalid_api_key",
    });
  }

  if (!data.keyId) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or revoked API key", {
      cause: "missing_unkey_key_id",
    });
  }

  return {
    valid: true,
    unkeyKeyId: data.keyId,
    rateLimitRemaining: ratelimit?.remaining,
    rateLimitReset: ratelimit?.reset,
  };
}

export async function enforceStandaloneRateLimit(identifier: string) {
  if (!isUnkeyConfigured()) {
    enforceDevRateLimit(identifier);
    return;
  }

  const { success, remaining, reset } = await getApiRateLimiter().limit(identifier);
  if (!success) {
    throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded", {
      cause: "standalone_rate_limit",
      metadata: {
        remaining: remaining ?? 0,
        reset: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      },
    });
  }
}

type DevBucket = {
  count: number;
  resetAt: number;
};

const devBuckets = new Map<string, DevBucket>();

function enforceDevRateLimit(identifier: string) {
  const limit = Number(process.env.DEV_RATELIMIT_LIMIT ?? 100);
  const windowMs = Number(process.env.DEV_RATELIMIT_WINDOW_MS ?? 60_000);
  const now = Date.now();
  const bucket = devBuckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    devBuckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded", {
      cause: "dev_rate_limit",
      metadata: {
        remaining: 0,
        reset: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      },
    });
  }
}

export type UnkeyCreateKeyResult = {
  unkeyKeyId: string;
  secret: string;
  keyPrefix: string;
};

export async function createUnkeyApiKey(input: {
  name: string;
  userId: string;
  localApiKeyId: string;
}): Promise<UnkeyCreateKeyResult> {
  const apiId = getUnkeyApiId();
  if (!apiId) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unkey API ID is not configured", {
      cause: "missing_unkey_api_id",
    });
  }

  const unkey = getUnkeyClient();
  let response;
  try {
    response = await unkey.keys.createKey({
      apiId,
      prefix: "gal",
      name: input.name,
      externalId: input.localApiKeyId,
      meta: {
        userId: input.userId,
        localApiKeyId: input.localApiKeyId,
      },
      ratelimits: [
        {
          name: process.env.UNKEY_RATELIMIT_NAME?.trim() || "requests",
          limit: Number(process.env.UNKEY_RATELIMIT_LIMIT ?? 100),
          duration: Number(process.env.UNKEY_RATELIMIT_DURATION_MS ?? 60_000),
          autoApply: true,
        },
      ],
    });
  } catch (err) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unable to create API key", {
      cause: err instanceof Error ? err.message : "unkey_create_failed",
    });
  }

  const secret = response.data.key;
  if (!secret || !response.data.keyId) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unable to create API key", {
      cause: "missing_unkey_secret",
    });
  }

  return {
    unkeyKeyId: response.data.keyId,
    secret,
    keyPrefix: secret.slice(0, 12),
  };
}

export async function revokeUnkeyApiKey(unkeyKeyId: string) {
  const unkey = getUnkeyClient();
  try {
    await unkey.keys.deleteKey({ keyId: unkeyKeyId });
  } catch (err) {
    throw new ApiError(503, "INTERNAL_ERROR", "Unable to revoke API key", {
      cause: err instanceof Error ? err.message : "unkey_revoke_failed",
    });
  }
}
