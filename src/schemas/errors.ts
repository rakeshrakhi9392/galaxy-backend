import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "METHOD_NOT_ALLOWED",
  "VERSION_CONFLICT",
  "INVALID_GRAPH",
  "INSUFFICIENT_CREDITS",
  "INTERNAL_ERROR",
]);

export const ApiRetryabilitySchema = z.enum(["none", "retry_after", "backoff"]);

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    cause: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    retryability: ApiRetryabilitySchema.optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiRetryability = z.infer<typeof ApiRetryabilitySchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
