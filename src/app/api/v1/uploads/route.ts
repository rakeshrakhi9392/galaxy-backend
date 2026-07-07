import { ApiError, handleApiError, jsonCreated, parseWithSchema } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { appendMediaUrlHints } from "@/lib/mediaUrlHints";
import { getTransloaditConfig, uploadBytesToTransloadit } from "@/lib/transloadit";
import { UploadResponseSchema } from "@galaxy/schemas";

/**
 * Authenticated multipart upload.
 * Browser sends the file to this backend route; secrets stay on the server.
 * Transloadit returns a public HTTPS URL stored on the workflow graph.
 */
export async function POST(req: Request) {
  try {
    await getAuth(req);

    const config = getTransloaditConfig();
    if (!config) {
      throw new ApiError(503, "INTERNAL_ERROR", "File uploads are not configured", {
        cause: "transloadit_not_configured",
        retryability: "none",
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "BAD_REQUEST", 'Expected multipart field "file"');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const hosted = await uploadBytesToTransloadit({
      bytes,
      filename: file.name || "upload",
      mimeType: file.type || null,
    });

    const payload = {
      ...hosted,
      url: appendMediaUrlHints(hosted.url, { bytes: hosted.size }),
    };

    return jsonCreated(parseWithSchema(UploadResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
