import { verifyWebhook } from "@clerk/backend/webhooks";
import { handleApiError, jsonOk } from "@/lib/api";
import { syncClerkUser } from "@/lib/auth";

type ClerkUserPayload = {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
};

export async function POST(req: Request) {
  try {
    const evt = await verifyWebhook(req);

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const user = evt.data as ClerkUserPayload;
      const email = user.email_addresses?.[0]?.email_address ?? null;
      await syncClerkUser(user.id, email);
    }

    return jsonOk({ received: true });
  } catch (err) {
    return handleApiError(err);
  }
}
