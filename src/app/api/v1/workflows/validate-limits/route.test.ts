import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/v1/workflows/validate-limits", () => {
  it("returns issues for known limit violations", async () => {
    const req = new Request("http://localhost/api/v1/workflows/validate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            nodeId: "extract-1",
            nodeType: "extract-audio",
            label: "Extract Audio",
            inputs: {
              video_url: "https://example.com/a.mp4?durationSec=700&bytes=1000&width=1280&height=720",
              format: "mp3",
            },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: { message: string }[] };
    expect(json.issues.length).toBeGreaterThan(0);
    expect(json.issues[0]?.message).toContain("duration");
  });

  it("returns empty issues for valid hint-backed inputs", async () => {
    const req = new Request("http://localhost/api/v1/workflows/validate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            nodeId: "merge-1",
            nodeType: "merge-video",
            label: "Merge Videos",
            inputs: {
              video_urls: [
                "https://example.com/a.mp4?durationSec=30&bytes=1000&width=1280&height=720",
                "https://example.com/b.mp4?durationSec=45&bytes=1000&width=1280&height=720",
              ],
              transition: "none",
            },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: unknown[] };
    expect(json.issues).toEqual([]);
  });

  it("allows merge-video with wired upstream videos before run", async () => {
    const req = new Request("http://localhost/api/v1/workflows/validate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            nodeId: "merge-1",
            nodeType: "merge-video",
            label: "Merge Videos",
            inputs: {
              video_urls: [],
              transition: "none",
            },
            wiredInputCounts: { video_urls: 2 },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: unknown[] };
    expect(json.issues).toEqual([]);
  });

  it("validates partial node inputs without crashing", async () => {
    const req = new Request("http://localhost/api/v1/workflows/validate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            nodeId: "kling-1",
            nodeType: "kling-v3-pro",
            label: "Kling",
            inputs: { prompt: "test", duration: 20 },
          },
          {
            nodeId: "llm-1",
            nodeType: "llm",
            label: "LLM",
            inputs: { prompt: "hello", model: "gpt-4.1-mini" },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: { nodeId: string; message: string }[] };
    expect(json.issues.some((issue) => issue.nodeId === "kling-1" && issue.message.includes("15"))).toBe(
      true,
    );
    expect(json.issues.some((issue) => issue.nodeId === "llm-1")).toBe(false);
  });

  it("returns only limit violations for mixed valid and invalid nodes", async () => {
    const req = new Request("http://localhost/api/v1/workflows/validate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            nodeId: "img-1",
            nodeType: "gpt-image-2",
            label: "GPT Image 2",
            inputs: {
              prompt: "A fox in the snow",
              quality: "high",
              n: 10,
            },
          },
          {
            nodeId: "merge-1",
            nodeType: "merge-video",
            label: "Merge Videos",
            inputs: {
              video_urls: [
                "https://example.com/a.mp4?durationSec=30&bytes=1000&width=1280&height=720",
                "https://example.com/b.mp4?durationSec=45&bytes=1000&width=1280&height=720",
              ],
              transition: "none",
            },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: { nodeId: string; message: string }[] };
    expect(json.issues).toEqual([
      {
        nodeId: "img-1",
        nodeType: "gpt-image-2",
        label: "GPT Image 2",
        message: "Number of images cannot exceed 4.",
      },
    ]);
  });
});
