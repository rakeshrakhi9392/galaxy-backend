import { describe, expect, it } from "vitest";
import {
  estimateNodesMicrocredits,
  estimateWorkflowMicrocredits,
  formatMicrocreditBalance,
  resolveEstimateNodeInputs,
  resolveWorkflowEstimatePayload,
} from "@/lib/creditEstimateApi";

describe("creditEstimateApi", () => {
  describe("resolveEstimateNodeInputs", () => {
    it("uses flat Galaxy-style data keys", () => {
      expect(resolveEstimateNodeInputs({ prompt: "fox", quality: "high", n: 1 })).toEqual({
        prompt: "fox",
        quality: "high",
        n: 1,
      });
    });

    it("merges graph-style nested inputs and maps subModelId to mode", () => {
      expect(
        resolveEstimateNodeInputs(
          { inputs: { prompt: "dog" }, quality: "high" },
          "image_to_video",
        ),
      ).toEqual({
        prompt: "dog",
        quality: "high",
        mode: "image_to_video",
      });
    });
  });

  describe("estimateNodesMicrocredits", () => {
    it("returns per-node microcredits in input order", () => {
      const payload = estimateNodesMicrocredits([
        { type: "gpt-image-2", data: { quality: "high", n: 1 } },
        { type: "request", data: {} },
        { type: "llm", data: { prompt: "hello", model: "google/gemini-3.5-flash" } },
      ]);

      expect(payload.estimates).toHaveLength(3);
      expect(payload.estimates[0]?.microcredits).toBe(210_000);
      expect(payload.estimates[1]?.microcredits).toBe(0);
      expect(payload.estimates[2]?.microcredits).toBeGreaterThan(0);
    });
  });

  describe("estimateWorkflowMicrocredits", () => {
    it("guarantees totalMicrocredits equals the sum of node estimates", () => {
      const payload = estimateWorkflowMicrocredits([
        { type: "gpt-image-2", data: { quality: "high", n: 1 } },
        { type: "llm", data: { prompt: "hello", model: "google/gemini-3.5-flash" } },
      ]);

      const sum = payload.estimates.reduce((total, item) => total + item.microcredits, 0);
      expect(payload.totalMicrocredits).toBe(sum);
    });
  });

  describe("resolveWorkflowEstimatePayload", () => {
    it("uses subgraph pricing when graph is provided", () => {
      const payload = resolveWorkflowEstimatePayload({
        graph: {
          nodes: [
            {
              id: "req",
              type: "request",
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: "img",
              type: "gpt-image-2",
              position: { x: 0, y: 0 },
              data: { inputs: { quality: "high", n: 1 } },
            },
          ],
          edges: [{ id: "e1", source: "req", target: "img" }],
        },
        targetNodeIds: ["img"],
      });

      expect(payload.totalMicrocredits).toBe(210_000);
      expect(payload.estimates).toEqual([{ microcredits: 210_000 }]);
    });
  });

  describe("formatMicrocreditBalance", () => {
    it("formats millions like Galaxy", () => {
      expect(formatMicrocreditBalance(26_170_000)).toBe("26.17M");
    });
  });
});
