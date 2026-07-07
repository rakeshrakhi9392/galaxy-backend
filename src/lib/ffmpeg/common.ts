import { writeFile } from "node:fs/promises";
import { hostLocalFile, isEphemeralMediaUrl, requiresDurableTransloaditUrls } from "@/lib/transloadit";

/** Input/media errors that will not succeed on retry. */
export class MediaInputError extends Error {
  readonly retryable = false as const;

  constructor(message: string) {
    super(message);
    this.name = "MediaInputError";
  }
}

export function assertDurableMediaUrl(url: string, fieldName: string): void {
  if (!isEphemeralMediaUrl(url)) return;

  throw new MediaInputError(
    `${fieldName} is an expired temporary Transloadit URL and cannot be downloaded. ` +
      `Re-upload that media (or re-run only the node that produces ${fieldName}) so it gets a durable public URL (for example *.r2.dev). ` +
      `Other inputs that already use durable URLs do not need to be re-run.`,
  );
}

export async function downloadToFile(
  url: string,
  dest: string,
  fieldName = "media_url",
): Promise<void> {
  if (url.startsWith("blob:")) {
    throw new MediaInputError(
      "Local uploads cannot be processed server-side. Upload media so it is hosted as a public URL.",
    );
  }

  if (requiresDurableTransloaditUrls()) {
    assertDurableMediaUrl(url, fieldName);
  }

  if (url.startsWith("data:")) {
    const commaIndex = url.indexOf(",");
    if (commaIndex < 0) {
      throw new MediaInputError("Invalid data URL media input.");
    }
    const meta = url.slice(5, commaIndex);
    const payload = url.slice(commaIndex + 1);
    const isBase64 = /;base64$/i.test(meta);
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    await writeFile(dest, buffer);
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404 && isEphemeralMediaUrl(url)) {
      throw new MediaInputError(
        `${fieldName} is an expired temporary Transloadit URL and cannot be downloaded. ` +
          `Re-upload that media (or re-run only the node that produces ${fieldName}) so it gets a durable public URL.`,
      );
    }
    throw new Error(`Failed to download media (${response.status}): ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
}

/** Host a generated media file on Transloadit (public URL). */
export async function hostGeneratedFile(input: {
  filePath: string;
  filename: string;
  mimeType?: string | null;
}): Promise<string> {
  return hostLocalFile(input);
}
