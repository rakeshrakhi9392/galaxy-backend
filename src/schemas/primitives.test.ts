import { describe, expect, it } from "vitest";
import { cuid, isoDateString } from "./primitives";

describe("primitives", () => {
  it("validates cuid", () => {
    expect(cuid.parse("abc123")).toBe("abc123");
    expect(() => cuid.parse("")).toThrow();
  });

  it("validates iso date string", () => {
    expect(isoDateString.parse("2026-01-01T00:00:00.000Z")).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
