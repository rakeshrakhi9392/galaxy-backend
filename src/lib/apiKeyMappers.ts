import type { ApiKey as DbApiKey } from "@prisma/client";

export function toApiKeyApi(key: DbApiKey) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
  };
}
