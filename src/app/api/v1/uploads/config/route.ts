import { handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import {
  getTransloaditConfig,
  MAX_AUDIO_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_PDF_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MIN_AUDIO_UPLOAD_BYTES,
  MIN_VIDEO_UPLOAD_BYTES,
} from "@/lib/transloadit";
import { UploadsConfigResponseSchema } from "@galaxy/schemas";

/**
 * Public config for the browser: whether uploads are enabled and size limits.
 * Never returns Transloadit secrets.
 */
export async function GET() {
  try {
    const config = getTransloaditConfig();
    const enabled = config != null;
    const payload = {
      enabled,
      maxAudioBytes: enabled ? MAX_AUDIO_UPLOAD_BYTES : null,
      maxVideoBytes: enabled ? MAX_VIDEO_UPLOAD_BYTES : null,
      maxImageBytes: enabled ? MAX_IMAGE_UPLOAD_BYTES : null,
      maxPdfBytes: enabled ? MAX_PDF_UPLOAD_BYTES : null,
      minAudioBytes: enabled ? MIN_AUDIO_UPLOAD_BYTES : null,
      minVideoBytes: enabled ? MIN_VIDEO_UPLOAD_BYTES : null,
    };

    return jsonOk(parseWithSchema(UploadsConfigResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
