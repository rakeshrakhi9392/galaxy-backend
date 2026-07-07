import { NextResponse } from "next/server";
import { ZodError, flattenError, type ZodType } from "zod";
import type { ApiErrorCode, ApiErrorBody, ApiRetryability } from "@galaxy/schemas";

export type { ApiErrorCode, ApiErrorBody, ApiRetryability };

export type ApiErrorOptions = {
  cause?: string;
  metadata?: Record<string, unknown>;
  retryability?: ApiRetryability;
  details?: unknown;
};

const DEFAULT_RETRYABILITY: Partial<Record<ApiErrorCode, ApiRetryability>> = {
  BAD_REQUEST: "none",
  NOT_FOUND: "none",
  UNAUTHORIZED: "none",
  FORBIDDEN: "none",
  RATE_LIMITED: "retry_after",
  METHOD_NOT_ALLOWED: "none",
  VERSION_CONFLICT: "none",
  INVALID_GRAPH: "none",
  INSUFFICIENT_CREDITS: "none",
  INTERNAL_ERROR: "backoff",
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 201, ...init });
}

export function apiErrorToBody(
  code: ApiErrorCode,
  message: string,
  options?: ApiErrorOptions,
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      cause: options?.cause,
      metadata: options?.metadata,
      retryability: options?.retryability ?? DEFAULT_RETRYABILITY[code] ?? "none",
      ...(options?.details !== undefined ? { details: options.details } : {}),
    },
  };
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: ApiErrorOptions,
  init?: ResponseInit,
) {
  const body = apiErrorToBody(code, message, options);
  const headers = new Headers(init?.headers);

  if (code === "RATE_LIMITED" && options?.metadata?.reset != null) {
    headers.set("Retry-After", String(options.metadata.reset));
  }

  return NextResponse.json(body, { status, ...init, headers });
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Invalid JSON body");
  }
}

export function parseWithSchema<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(400, "BAD_REQUEST", "Validation failed", {
        details: flattenError(err),
      });
    }
    throw err;
  }
}

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  cause?: string;
  metadata?: Record<string, unknown>;
  retryability?: ApiRetryability;
  details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options?: ApiErrorOptions,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.cause = options?.cause;
    this.metadata = options?.metadata;
    this.retryability = options?.retryability ?? DEFAULT_RETRYABILITY[code] ?? "none";
    this.details = options?.details;
  }
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return jsonError(err.status, err.code, err.message, {
      cause: err.cause,
      metadata: err.metadata,
      retryability: err.retryability,
      details: err.details,
    });
  }
  return jsonError(500, "INTERNAL_ERROR", "Internal server error", {
    cause: err instanceof Error ? err.message : "Unknown error",
  });
}
