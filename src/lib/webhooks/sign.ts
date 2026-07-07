import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "Galaxy-Signature";

/** Build `t=<unix>,v1=<hex>` signature header value for a webhook body. */
export function signWebhookPayload(secret: string, body: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
  return `t=${ts},v1=${signature}`;
}

/** Verify a webhook signature (for docs / receiver testing). */
export function verifyWebhookSignature(args: {
  secret: string;
  body: string;
  signatureHeader: string;
  toleranceSeconds?: number;
}): boolean {
  const tolerance = args.toleranceSeconds ?? 300;
  const parts = Object.fromEntries(
    args.signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim(), rest.join("=").trim()];
    }),
  );

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac("sha256", args.secret)
    .update(`${timestamp}.${args.body}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
