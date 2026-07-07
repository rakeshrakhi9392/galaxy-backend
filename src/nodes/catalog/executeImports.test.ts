import { describe, expect, it } from "vitest";

describe("catalog execute imports", () => {
  it("loads provider and limit modules via dynamic import", async () => {
    const limits = await import("@/schemas/providerInputLimitsServer");
    const providers = await import("@/providers/gpt-image-2");
    expect(typeof limits.validateGptImage2Limits).toBe("function");
    expect(typeof providers.executeGptImage2Providers).toBe("function");
  });
});
