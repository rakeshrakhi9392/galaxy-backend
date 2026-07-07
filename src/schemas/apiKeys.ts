import { z } from "zod";
import { cuid, isoDateString } from "./primitives";

export const ApiKeySchema = z.object({
  id: cuid,
  name: z.string().min(1),
  keyPrefix: z.string().min(1),
  lastUsedAt: isoDateString.nullable(),
  createdAt: isoDateString,
  revokedAt: isoDateString.nullable(),
});

export const ApiKeysListResponseSchema = z.object({
  apiKeys: z.array(ApiKeySchema),
});

export const ApiKeyCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
});

export const ApiKeyCreateResponseSchema = z.object({
  apiKey: ApiKeySchema,
  /** Full secret — shown once at creation only. */
  secret: z.string().min(1),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
