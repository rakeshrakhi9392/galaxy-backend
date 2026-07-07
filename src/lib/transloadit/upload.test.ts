import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { getTransloaditConfig, isTransloaditConfigured, requiresDurableTransloaditUrls } from "./config";
import {
  MAX_AUDIO_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
} from "./limits";
import {
  assertAllowedUpload,
  buildAssemblyParams,
  extractPublicUrl,
  formatByteSize,
  isAllowedUploadMimeType,
  isEphemeralMediaUrl,
  MIN_AUDIO_UPLOAD_BYTES,
} from "./upload";
import type { AssemblyStatus } from "@transloadit/node";

describe("transloadit config", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports not configured when credentials are missing", () => {
    delete process.env.TRANSLOADIT_AUTH_KEY;
    delete process.env.TRANSLOADIT_AUTH_SECRET;
    expect(isTransloaditConfigured()).toBe(false);
    expect(getTransloaditConfig()).toBeNull();
  });

  it("reads credentials, store settings, and template from env", () => {
    process.env.TRANSLOADIT_AUTH_KEY = "key";
    process.env.TRANSLOADIT_AUTH_SECRET = "secret";
    process.env.TRANSLOADIT_TEMPLATE_ID = "template-1";
    process.env.TRANSLOADIT_STORE_CREDENTIALS = "galaxy_r2";
    process.env.TRANSLOADIT_STORE_ROBOT = "/s3/store";

    expect(isTransloaditConfigured()).toBe(true);
    expect(getTransloaditConfig()).toEqual({
      authKey: "key",
      authSecret: "secret",
      templateId: "template-1",
      storeCredentials: "galaxy_r2",
      storeRobot: "/s3/store",
    });
  });

  it("requiresDurableTransloaditUrls is false by default", () => {
    delete process.env.TRANSLOADIT_REQUIRE_DURABLE_URLS;
    expect(requiresDurableTransloaditUrls()).toBe(false);
  });

  it("requiresDurableTransloaditUrls is true when env is set", () => {
    process.env.TRANSLOADIT_REQUIRE_DURABLE_URLS = "true";
    expect(requiresDurableTransloaditUrls()).toBe(true);
  });
});

describe("buildAssemblyParams", () => {
  it("adds durable export when store credentials are configured", () => {
    const params = buildAssemblyParams({
      authKey: "key",
      authSecret: "secret",
      templateId: null,
      storeCredentials: "galaxy_r2",
      storeRobot: "/cloudflare/store",
    });

    expect(params).toEqual({
      steps: {
        ":original": { robot: "/upload/handle" },
        exported: {
          use: ":original",
          robot: "/cloudflare/store",
          credentials: "galaxy_r2",
          path: "galaxy/${unique_prefix}/${file.url_name}",
          result: true,
        },
      },
    });
  });

  it("uses template_id when store credentials are missing but template is set", () => {
    const params = buildAssemblyParams({
      authKey: "key",
      authSecret: "secret",
      templateId: "galaxy-template",
      storeCredentials: null,
      storeRobot: "/cloudflare/store",
    });

    expect(params).toEqual({ template_id: "galaxy-template" });
  });

  it("prefers inline store export over template_id when both are set", () => {
    const params = buildAssemblyParams({
      authKey: "key",
      authSecret: "secret",
      templateId: "galaxy-template",
      storeCredentials: "galaxy_r2",
      storeRobot: "/cloudflare/store",
    });

    expect(params).toMatchObject({
      steps: {
        exported: expect.objectContaining({ credentials: "galaxy_r2" }),
      },
    });
    expect(params).not.toHaveProperty("template_id");
  });

  it("omits export when neither store credentials nor template are configured", () => {
    const params = buildAssemblyParams({
      authKey: "key",
      authSecret: "secret",
      templateId: null,
      storeCredentials: null,
      storeRobot: "/cloudflare/store",
    });

    expect(params).toEqual({
      steps: {
        ":original": { robot: "/upload/handle" },
      },
    });
  });
});

describe("upload validation", () => {
  it("allows common media mime types and extensions", () => {
    expect(isAllowedUploadMimeType("image/png", "x.png")).toBe(true);
    expect(isAllowedUploadMimeType("video/mp4", "x.mp4")).toBe(true);
    expect(isAllowedUploadMimeType("audio/mpeg", "x.mp3")).toBe(true);
    expect(isAllowedUploadMimeType("application/pdf", "x.pdf")).toBe(true);
    expect(isAllowedUploadMimeType(null, "photo.JPEG")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isAllowedUploadMimeType("application/zip", "archive.zip")).toBe(false);
    expect(isAllowedUploadMimeType(null, "notes.txt")).toBe(false);
  });

  it("rejects empty and oversized files with readable sizes", () => {
    expect(() =>
      assertAllowedUpload({
        filename: "a.png",
        mimeType: "image/png",
        size: 0,
      }),
    ).toThrow(/Empty files are not allowed/);

    try {
      assertAllowedUpload({
        filename: "a.png",
        mimeType: "image/png",
        size: MAX_IMAGE_UPLOAD_BYTES + 1,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain("too large");
      expect((err as ApiError).message).toContain(formatByteSize(MAX_IMAGE_UPLOAD_BYTES));
    }
  });

  it("enforces per-kind max sizes", () => {
    expect(() =>
      assertAllowedUpload({
        filename: "clip.mp3",
        mimeType: "audio/mpeg",
        size: MAX_AUDIO_UPLOAD_BYTES + 1,
      }),
    ).toThrow(/too large/);

    expect(() =>
      assertAllowedUpload({
        filename: "clip.mp4",
        mimeType: "video/mp4",
        size: MAX_VIDEO_UPLOAD_BYTES + 1,
      }),
    ).toThrow(/too large/);
  });

  it("rejects tiny audio files that cannot be valid media", () => {
    try {
      assertAllowedUpload({
        filename: "Recording.mp3",
        mimeType: "audio/mpeg",
        size: 330,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const error = err as ApiError;
      expect(error.status).toBe(400);
      expect(error.message).toContain("too small");
      expect(error.message).toContain("330 bytes");
      expect(error.message).toContain(formatByteSize(MIN_AUDIO_UPLOAD_BYTES));
    }
  });

  it("allows audio at or above the minimum size", () => {
    expect(() =>
      assertAllowedUpload({
        filename: "clip.mp3",
        mimeType: "audio/mpeg",
        size: MIN_AUDIO_UPLOAD_BYTES,
      }),
    ).not.toThrow();
  });
});

describe("extractPublicUrl", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("detects ephemeral Transloadit scratch URLs", () => {
    expect(
      isEphemeralMediaUrl("https://tmp-hd833ap.transloadit.com/scratch/abc123"),
    ).toBe(true);
    expect(
      isEphemeralMediaUrl(
        "https://pub-e8fef8c0e03b44acb340577811800829.r2.dev/account/assembly/file.mp4",
      ),
    ).toBe(false);
  });

  it("prefers durable upload URLs over community-plan scratch results", () => {
    const durable =
      "https://pub-e8fef8c0e03b44acb340577811800829.r2.dev/account/assembly/file.mp4";
    const scratch = "https://tmp-hd833ap.transloadit.com/scratch/abc123";

    const status = {
      assembly_id: "asm-1",
      uploads: [{ ssl_url: durable }],
      results: {
        community_plan_video_trim: [{ ssl_url: scratch }],
      },
    } as unknown as AssemblyStatus;

    expect(extractPublicUrl(status)).toBe(durable);
  });

  it("uses durable exported results when uploads are empty", () => {
    const durable =
      "https://pub-e8fef8c0e03b44acb340577811800829.r2.dev/galaxy/abc/clip.mp3";

    const status = {
      assembly_id: "asm-export",
      uploads: [],
      results: {
        exported: [{ ssl_url: durable }],
      },
    } as unknown as AssemblyStatus;

    expect(extractPublicUrl(status)).toBe(durable);
  });

  it("accepts scratch URLs by default when no durable URL exists", () => {
    const scratch = "https://tmp-hd833ap.transloadit.com/scratch/abc123";

    const status = {
      assembly_id: "asm-2",
      uploads: [],
      results: {
        community_plan_video_trim: [{ ssl_url: scratch }],
      },
    } as unknown as AssemblyStatus;

    delete process.env.TRANSLOADIT_REQUIRE_DURABLE_URLS;
    expect(extractPublicUrl(status)).toBe(scratch);
  });

  it("rejects scratch URLs when TRANSLOADIT_REQUIRE_DURABLE_URLS is true", () => {
    const status = {
      assembly_id: "asm-2",
      uploads: [],
      results: {
        community_plan_video_trim: [
          { ssl_url: "https://tmp-hd833ap.transloadit.com/scratch/abc123" },
        ],
      },
    } as unknown as AssemblyStatus;

    process.env.TRANSLOADIT_REQUIRE_DURABLE_URLS = "true";
    expect(() => extractPublicUrl(status)).toThrow(/temporary media URLs/);
  });

  it("falls back to :original result step when uploads are empty", () => {
    const originalUrl = "https://cdn.transloadit.com/account/assembly/photo.jpg";

    const status = {
      assembly_id: "asm-original",
      uploads: [],
      results: {
        ":original": [{ ssl_url: originalUrl }],
      },
    } as unknown as AssemblyStatus;

    expect(extractPublicUrl(status)).toBe(originalUrl);
  });

  it("uses uploads[0].url when ssl_url is missing", () => {
    const uploadUrl = "https://cdn.transloadit.com/account/assembly/clip.mp4";

    const status = {
      assembly_id: "asm-url-only",
      uploads: [{ url: uploadUrl }],
      results: {},
    } as unknown as AssemblyStatus;

    expect(extractPublicUrl(status)).toBe(uploadUrl);
  });
});
