import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { Transloadit, type AssemblyStatus } from "@transloadit/node";
import { ApiError, handleApiError } from "@/lib/api";
import { getTransloaditConfig, requiresDurableTransloaditUrls, type TransloaditConfig } from "./config";
import { maxBytesForUploadKind } from "./limits";

export type HostedUpload = {
  url: string;
  name: string;
  size: number;
  mimeType: string | null;
};

export type UploadBytesInput = {
  bytes: Buffer;
  filename: string;
  mimeType?: string | null;
  /** When false, skip client MIME/size checks (server-generated media). Default true. */
  enforceClientLimits?: boolean;
};

export type UploadFilePathInput = {
  filePath: string;
  filename?: string;
  mimeType?: string | null;
  /** When false, skip client MIME/size checks (server-generated media). Default true. */
  enforceClientLimits?: boolean;
};

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"] as const;
const ALLOWED_MIME_TYPES = new Set(["application/pdf"]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".tif",
  ".tiff",
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".pdf",
]);

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".tif",
  ".tiff",
]);

/** Tiny stubs (e.g. 330-byte "recordings") are never valid audio/video. */
export const MIN_AUDIO_UPLOAD_BYTES = 1024; // 1 KiB
export const MIN_VIDEO_UPLOAD_BYTES = 1024; // 1 KiB
export const MIN_IMAGE_UPLOAD_BYTES = 32;
export const MIN_PDF_UPLOAD_BYTES = 100;

export type UploadMediaKind = "audio" | "video" | "image" | "pdf" | "unknown";

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function detectUploadMediaKind(
  mimeType: string | null | undefined,
  filename: string,
): UploadMediaKind {
  const normalized = mimeType?.toLowerCase().trim() ?? "";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("image/")) return "image";
  if (normalized === "application/pdf") return "pdf";

  const extension = extname(filename).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === ".pdf") return "pdf";
  return "unknown";
}

function minBytesForKind(kind: UploadMediaKind): number | null {
  switch (kind) {
    case "audio":
      return MIN_AUDIO_UPLOAD_BYTES;
    case "video":
      return MIN_VIDEO_UPLOAD_BYTES;
    case "image":
      return MIN_IMAGE_UPLOAD_BYTES;
    case "pdf":
      return MIN_PDF_UPLOAD_BYTES;
    default:
      return null;
  }
}

function isInvalidMediaProviderError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid_input_error") ||
    lower.includes("file format is not supported") ||
    lower.includes("failed to find two consecutive mpeg") ||
    lower.includes("invalid data found when processing input") ||
    lower.includes("ffmpegcommand failed")
  );
}

function toTransloaditUploadError(err: unknown): ApiError {
  const raw = err instanceof Error ? err.message : "unknown_error";
  if (isInvalidMediaProviderError(raw)) {
    return new ApiError(
      400,
      "BAD_REQUEST",
      "Upload rejected: the file is not valid media (it may be empty, corrupt, or not a real audio/video/image file). Please choose a valid file and try again.",
      {
        metadata: { providerError: raw },
        retryability: "none",
      },
    );
  }

  return new ApiError(502, "INTERNAL_ERROR", "Failed to upload file to storage. Please try again.", {
    metadata: { providerError: raw },
    retryability: "backoff",
  });
}

function createClient(config: TransloaditConfig): Transloadit {
  return new Transloadit({
    authKey: config.authKey,
    authSecret: config.authSecret,
  });
}

/**
 * Build assembly params for uploads and generated-media hosting.
 *
 * Priority:
 * 1. Inline `/upload/handle` + store export when `storeCredentials` is set.
 * 2. `template_id` when configured (Galaxy templates include durable export).
 * 3. Bare `/upload/handle` — valid for trial; returns scratch URLs unless template/store is set.
 */
export function buildAssemblyParams(config: TransloaditConfig): Record<string, unknown> {
  if (config.storeCredentials) {
    return {
      steps: {
        ":original": {
          robot: "/upload/handle",
        },
        exported: {
          use: ":original",
          robot: config.storeRobot,
          credentials: config.storeCredentials,
          path: "galaxy/${unique_prefix}/${file.url_name}",
          result: true,
        },
      },
    };
  }

  if (config.templateId) {
    return { template_id: config.templateId };
  }

  return {
    steps: {
      ":original": {
        robot: "/upload/handle",
      },
    },
  };
}

export function assertDurableStorageConfigured(config: TransloaditConfig): void {
  if (config.storeCredentials || config.templateId) return;

  throw new ApiError(
    503,
    "INTERNAL_ERROR",
    "Durable file storage is not configured. Set TRANSLOADIT_STORE_CREDENTIALS (R2/S3 credential name) or TRANSLOADIT_TEMPLATE_ID with an export step in Transloadit.",
    {
      cause: "transloadit_durable_storage_not_configured",
      retryability: "none",
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Community-plan processing steps often emit `tmp-*.transloadit.com/scratch/...`
 * URLs that expire within minutes. Downstream nodes (merge-av, etc.) then 404.
 * Prefer durable hosted URLs (e.g. R2 `ssl_url` on the upload entry).
 */
export function isEphemeralMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.startsWith("tmp-") && host.endsWith(".transloadit.com")) return true;
    if (parsed.pathname.includes("/scratch/")) return true;
    return false;
  } catch {
    return false;
  }
}

const ORIGINAL_RESULT_STEP_NAMES = [":original", "original", "upload_original", "upload"] as const;

function readSslUrl(entry: unknown): string | null {
  if (!isRecord(entry)) return null;
  const candidates = [entry.ssl_url, entry.signed_ssl_url, entry.url];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("https://")) {
      return candidate;
    }
  }
  return null;
}

/**
 * Extract URL from named Transloadit result steps (old-project parity).
 */
export function extractOriginalUrlFromResults(
  results: AssemblyStatus["results"],
): string | null {
  if (!isRecord(results)) return null;

  for (const stepName of ORIGINAL_RESULT_STEP_NAMES) {
    const stepResults = results[stepName];
    if (!Array.isArray(stepResults)) continue;
    for (const entry of stepResults) {
      const url = readSslUrl(entry);
      if (url) return url;
    }
  }

  return null;
}

function collectUrlsFromResultSteps(
  results: AssemblyStatus["results"],
  skipStepNames: ReadonlySet<string>,
): string[] {
  const urls: string[] = [];
  if (!isRecord(results)) return urls;

  for (const [stepName, stepResults] of Object.entries(results)) {
    if (skipStepNames.has(stepName) || !Array.isArray(stepResults)) continue;
    for (const entry of stepResults) {
      const url = readSslUrl(entry);
      if (url) urls.push(url);
    }
  }

  return urls;
}

function collectAssemblyUrls(status: AssemblyStatus): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  function pushUnique(url: string | null): void {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  }

  const uploads = status.uploads;
  if (Array.isArray(uploads) && uploads.length > 0) {
    pushUnique(readSslUrl(uploads[0]));
  }

  pushUnique(extractOriginalUrlFromResults(status.results));

  const skipSteps = new Set<string>(ORIGINAL_RESULT_STEP_NAMES);
  for (const url of collectUrlsFromResultSteps(status.results, skipSteps)) {
    pushUnique(url);
  }

  return urls;
}

function ephemeralUrlError(status: AssemblyStatus, urls: string[]): ApiError {
  return new ApiError(
    502,
    "INTERNAL_ERROR",
    "Transloadit only returned temporary media URLs that expire quickly. Cannot use them as workflow outputs. Configure TRANSLOADIT_STORE_CREDENTIALS or a Transloadit template with durable export (R2/S3).",
    {
      cause: "ephemeral_media_url",
      metadata: { assemblyId: status.assembly_id, urls },
      retryability: "backoff",
    },
  );
}

export function extractPublicUrl(status: AssemblyStatus): string {
  const urls = collectAssemblyUrls(status);
  const durable = urls.find((url) => !isEphemeralMediaUrl(url));
  if (durable) return durable;

  if (urls.length > 0) {
    if (requiresDurableTransloaditUrls()) {
      throw ephemeralUrlError(status, urls);
    }
    return urls[0]!;
  }

  throw new ApiError(502, "INTERNAL_ERROR", "Transloadit assembly completed without a public URL", {
    cause: "missing_ssl_url",
    metadata: { assemblyId: status.assembly_id },
    retryability: "backoff",
  });
}

export function isAllowedUploadMimeType(mimeType: string | null | undefined, filename: string): boolean {
  const normalized = mimeType?.toLowerCase().trim() ?? "";
  if (normalized) {
    if (ALLOWED_MIME_TYPES.has(normalized)) return true;
    if (ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return true;
    }
  }

  const extension = extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}

export function assertAllowedUpload(input: {
  filename: string;
  mimeType?: string | null;
  size: number;
}): void {
  if (input.size <= 0) {
    throw new ApiError(400, "BAD_REQUEST", "Empty files are not allowed. Please choose a real file.");
  }

  if (!isAllowedUploadMimeType(input.mimeType, input.filename)) {
    throw new ApiError(400, "BAD_REQUEST", "Unsupported file type. Allowed: images, video, audio, and PDF.", {
      metadata: { mimeType: input.mimeType ?? null, filename: input.filename },
    });
  }

  const kind = detectUploadMediaKind(input.mimeType, input.filename);
  const maxBytes = maxBytesForUploadKind(kind);
  if (input.size > maxBytes) {
    const kindLabel =
      kind === "audio"
        ? "audio"
        : kind === "video"
          ? "video"
          : kind === "image"
            ? "image"
            : kind === "pdf"
              ? "PDF"
              : "file";
    throw new ApiError(
      400,
      "BAD_REQUEST",
      `This ${kindLabel} file is too large (${formatByteSize(input.size)}). Maximum upload size is ${formatByteSize(maxBytes)}.`,
      {
        metadata: { size: input.size, maxBytes, kind, filename: input.filename },
      },
    );
  }

  const minBytes = minBytesForKind(kind);
  if (minBytes != null && input.size < minBytes) {
    const kindLabel =
      kind === "audio"
        ? "audio"
        : kind === "video"
          ? "video"
          : kind === "image"
            ? "image"
            : "PDF";
    throw new ApiError(
      400,
      "BAD_REQUEST",
      `This ${kindLabel} file is too small (${formatByteSize(input.size)}). Valid ${kindLabel} files must be at least ${formatByteSize(minBytes)}. The file may be empty, corrupt, or not a real ${kindLabel} file.`,
      {
        metadata: {
          size: input.size,
          minBytes,
          kind,
          filename: input.filename,
        },
      },
    );
  }
}

async function createAssemblyFromPath(
  config: TransloaditConfig,
  filePath: string,
  fieldName: string,
): Promise<AssemblyStatus> {
  if (requiresDurableTransloaditUrls()) {
    assertDurableStorageConfigured(config);
  }
  const client = createClient(config);
  return client.createAssembly({
    files: { [fieldName]: filePath },
    params: buildAssemblyParams(config) as never,
    waitForCompletion: true,
  });
}

/**
 * Upload bytes to Transloadit and return a public HTTPS URL.
 * Writes a temp file, creates an assembly, waits for completion, then cleans up.
 */
export async function uploadBytesToTransloadit(input: UploadBytesInput): Promise<HostedUpload> {
  const config = getTransloaditConfig();
  if (!config) {
    throw new ApiError(503, "INTERNAL_ERROR", "File uploads are not configured", {
      cause: "transloadit_not_configured",
      retryability: "none",
    });
  }

  const filename = basename(input.filename) || `upload-${randomUUID()}`;
  if (input.enforceClientLimits !== false) {
    assertAllowedUpload({
      filename,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
    });
  } else if (input.bytes.byteLength <= 0) {
    throw new ApiError(400, "BAD_REQUEST", "Empty files are not allowed");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "galaxy-upload-"));
  const tempPath = join(tempDir, filename);

  try {
    await writeFile(tempPath, input.bytes);
    const status = await createAssemblyFromPath(config, tempPath, "file");
    const url = extractPublicUrl(status);

    return {
      url,
      name: filename,
      size: input.bytes.byteLength,
      mimeType: input.mimeType ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toTransloaditUploadError(err);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Upload an existing local file path to Transloadit.
 */
export async function uploadFilePathToTransloadit(
  input: UploadFilePathInput,
): Promise<HostedUpload> {
  const config = getTransloaditConfig();
  if (!config) {
    throw new ApiError(503, "INTERNAL_ERROR", "File uploads are not configured", {
      cause: "transloadit_not_configured",
      retryability: "none",
    });
  }

  const filename = basename(input.filename ?? input.filePath) || `upload-${randomUUID()}`;
  const bytes = await readFile(input.filePath);

  if (input.enforceClientLimits !== false) {
    assertAllowedUpload({
      filename,
      mimeType: input.mimeType,
      size: bytes.byteLength,
    });
  } else if (bytes.byteLength <= 0) {
    throw new ApiError(400, "BAD_REQUEST", "Empty files are not allowed");
  }

  try {
    const status = await createAssemblyFromPath(config, input.filePath, "file");
    const url = extractPublicUrl(status);

    return {
      url,
      name: filename,
      size: bytes.byteLength,
      mimeType: input.mimeType ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toTransloaditUploadError(err);
  }
}

function mimeFromFilename(filename: string): string {
  const extension = extname(filename).toLowerCase();
  switch (extension) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/**
 * Host a generated workflow output on Transloadit and return its public URL.
 */
export async function hostLocalFile(input: {
  filePath: string;
  filename: string;
  mimeType?: string | null;
}): Promise<string> {
  if (!getTransloaditConfig()) {
    throw new ApiError(503, "INTERNAL_ERROR", "File storage is not configured", {
      cause: "transloadit_not_configured",
      retryability: "none",
    });
  }

  const hosted = await uploadFilePathToTransloadit({
    filePath: input.filePath,
    filename: input.filename,
    mimeType: input.mimeType ?? mimeFromFilename(input.filename),
    enforceClientLimits: false,
  });

  return hosted.url;
}
