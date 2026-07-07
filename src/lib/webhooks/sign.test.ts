import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./sign";

describe("webhook signatures", () => {
  it("signs and verifies a payload", () => {
    const secret = "whsec_test_secret";
    const body = JSON.stringify({ id: "evt_1", type: "RUN_STARTED" });
    const header = signWebhookPayload(secret, body, 1_720_200_000);

    expect(verifyWebhookSignature({
      secret,
      body,
      signatureHeader: header,
      toleranceSeconds: 999_999_999,
    })).toBe(true);
  });

  it("rejects tampered bodies", () => {
    const secret = "whsec_test_secret";
    const body = JSON.stringify({ id: "evt_1" });
    const header = signWebhookPayload(secret, body, 1_720_200_000);

    expect(verifyWebhookSignature({
      secret,
      body: JSON.stringify({ id: "evt_2" }),
      signatureHeader: header,
      toleranceSeconds: 999_999_999,
    })).toBe(false);
  });

  it("rejects expired timestamps", () => {
    const secret = "whsec_test_secret";
    const body = "{}";
    const header = signWebhookPayload(secret, body, 1);

    expect(verifyWebhookSignature({
      secret,
      body,
      signatureHeader: header,
      toleranceSeconds: 60,
    })).toBe(false);
  });
});
