import type { WebhookEndpoint as WebhookEndpointRow } from "@prisma/client";
import type { WebhookEndpoint } from "@/schemas/webhooks";

export function toWebhookEndpointApi(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
