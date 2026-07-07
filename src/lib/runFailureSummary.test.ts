import { describe, expect, it } from "vitest";
import { buildRunErrorSummary } from "./runFailureSummary";

describe("buildRunErrorSummary", () => {
  it("prefixes failed-at when node id is known", () => {
    expect(
      buildRunErrorSummary({
        message: "Provider timed out",
        nodeId: "node-abc",
        nodeType: "gpt-image-2",
      }),
    ).toBe("Failed at gpt-image-2 (node-abc): Provider timed out");
  });

  it("does not double-prefix", () => {
    const message = "Failed at gpt-image-2 (node-abc): Provider timed out";
    expect(
      buildRunErrorSummary({
        message,
        nodeId: "node-abc",
        nodeType: "gpt-image-2",
      }),
    ).toBe(message);
  });

  it("returns message unchanged when node id is missing", () => {
    expect(buildRunErrorSummary({ message: "Crash" })).toBe("Crash");
  });
});
