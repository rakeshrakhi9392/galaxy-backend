import { describe, expect, it } from "vitest";
import { ApiErrorBodySchema } from "./errors";
import { pageToSkip } from "./pagination";
import { ApiKeySchema } from "./apiKeys";

describe("errors", () => {
  it("parses api error body", () => {
    const parsed = ApiErrorBodySchema.parse({
      error: { code: "NOT_FOUND", message: "Missing" },
    });
    expect(parsed.error.code).toBe("NOT_FOUND");
  });
});

describe("pagination", () => {
  it("computes skip offset", () => {
    expect(pageToSkip(2, 20)).toBe(20);
  });
});

describe("apiKeys", () => {
  it("parses api key", () => {
    const parsed = ApiKeySchema.parse({
      id: "key_1",
      name: "Test",
      keyPrefix: "gk_",
      lastUsedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
    });
    expect(parsed.name).toBe("Test");
  });
});
