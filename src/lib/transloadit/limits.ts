import type { UploadMediaKind } from "./upload";

const MB = 1024 * 1024;

/** Mirrors provider input caps in `providerInputLimits.ts`. */
export const MAX_AUDIO_UPLOAD_BYTES = 50 * MB;
export const MAX_VIDEO_UPLOAD_BYTES = 500 * MB;
export const MAX_IMAGE_UPLOAD_BYTES = 20 * MB;
export const MAX_PDF_UPLOAD_BYTES = 20 * MB;

/** Default when media kind cannot be determined. */
export const MAX_UNKNOWN_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;

export function maxBytesForUploadKind(kind: UploadMediaKind): number {
  switch (kind) {
    case "audio":
      return MAX_AUDIO_UPLOAD_BYTES;
    case "video":
      return MAX_VIDEO_UPLOAD_BYTES;
    case "image":
      return MAX_IMAGE_UPLOAD_BYTES;
    case "pdf":
      return MAX_PDF_UPLOAD_BYTES;
    default:
      return MAX_UNKNOWN_UPLOAD_BYTES;
  }
}
