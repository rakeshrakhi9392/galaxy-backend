import { describe, expect, it } from "vitest";
import {
  createNodeRunLogBuffer,
  errorWithLogPreview,
  formatLogPreview,
  readLogPreviewFromError,
} from "./nodeRunLog";

describe("nodeRunLog", () => {
  it("formats log lines with timestamp and level", () => {
    const log = createNodeRunLogBuffer();
    log.info("hello");
    log.warn("careful");
    log.error("boom");

    const preview = log.toPreview();
    expect(preview).toMatch(/INFO hello/);
    expect(preview).toMatch(/WARN careful/);
    expect(preview).toMatch(/ERROR boom/);
  });

  it("truncates very long previews", () => {
    const lines = Array.from({ length: 5 }, (_, i) => ({
      ts: "2026-07-01T00:00:00.000Z",
      level: "info" as const,
      message: "x".repeat(5_000),
    }));
    const preview = formatLogPreview(lines);
    expect(preview.startsWith("…(truncated)")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(16_384 + 20);
  });

  it("attaches and reads logPreview from errors", () => {
    const err = errorWithLogPreview(new Error("failed"), "line one\nline two");
    expect(readLogPreviewFromError(err)).toBe("line one\nline two");
    expect(err.message).toBe("failed");
  });
});
