import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/uploads/config", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns enabled=false when Transloadit is not configured", async () => {
    delete process.env.TRANSLOADIT_AUTH_KEY;
    delete process.env.TRANSLOADIT_AUTH_SECRET;

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: false,
      maxAudioBytes: null,
      maxVideoBytes: null,
      maxImageBytes: null,
      maxPdfBytes: null,
      minAudioBytes: null,
      minVideoBytes: null,
    });
  });

  it("returns enabled=true and per-kind size limits when configured", async () => {
    process.env.TRANSLOADIT_AUTH_KEY = "key";
    process.env.TRANSLOADIT_AUTH_SECRET = "secret";

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: true,
      maxAudioBytes: 50 * 1024 * 1024,
      maxVideoBytes: 500 * 1024 * 1024,
      maxImageBytes: 20 * 1024 * 1024,
      maxPdfBytes: 20 * 1024 * 1024,
      minAudioBytes: 1024,
      minVideoBytes: 1024,
    });
  });
});
