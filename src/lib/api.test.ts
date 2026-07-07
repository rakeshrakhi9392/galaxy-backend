import { describe, expect, it } from "vitest";
import { ApiError, apiErrorToBody, handleApiError } from "@/lib/api";

describe("api error envelope", () => {
  it("includes cause, metadata, and retryability", () => {
    const body = apiErrorToBody("RATE_LIMITED", "Rate limit exceeded", {
      cause: "unkey_rate_limited",
      metadata: { reset: 30, remaining: 0 },
      retryability: "retry_after",
    });

    expect(body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded",
        cause: "unkey_rate_limited",
        metadata: { reset: 30, remaining: 0 },
        retryability: "retry_after",
      },
    });
  });

  it("applies default retryability by error code", () => {
    const body = apiErrorToBody("INTERNAL_ERROR", "Internal server error");
    expect(body.error.retryability).toBe("backoff");
  });

  it("serializes ApiError through handleApiError", async () => {
    const response = handleApiError(
      new ApiError(404, "NOT_FOUND", "Workflow not found", {
        cause: "workflow_missing",
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Workflow not found",
      cause: "workflow_missing",
      retryability: "none",
    });
  });
});
