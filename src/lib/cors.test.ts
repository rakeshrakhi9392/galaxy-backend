import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedCorsOrigin } from "@/lib/cors";

describe("cors", () => {
  it("allows Mintlify hosted docs", () => {
    expect(isAllowedCorsOrigin("https://abcd-311b96b4.mintlify.app")).toBe(true);
    expect(isAllowedCorsOrigin("https://other-project.mintlify.app")).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isAllowedCorsOrigin("https://evil.example")).toBe(false);
    expect(isAllowedCorsOrigin(null)).toBe(false);
  });

  it("returns access-control headers for allowed origins", () => {
    expect(corsHeaders("https://abcd-311b96b4.mintlify.app")).toMatchObject({
      "Access-Control-Allow-Origin": "https://abcd-311b96b4.mintlify.app",
      "Access-Control-Allow-Methods": expect.stringContaining("GET"),
    });
  });
});
