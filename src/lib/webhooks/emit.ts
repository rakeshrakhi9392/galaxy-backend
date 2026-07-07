import { prisma } from "@/lib/prisma";
import type { WebhookPayload } from "@/schemas/webhooks";
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from "./sign";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 1_000, 3_000];

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhook(args: {
  url: string;
  secret: string;
  payload: WebhookPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = JSON.stringify(args.payload);
  const signature = signWebhookPayload(args.secret, body);

  try {
    const response = await fetch(args.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        "user-agent": "Galaxy-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      return { ok: true };
    }

    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function deliverToEndpoint(args: {
  endpointId: string;
  url: string;
  secret: string;
  payload: WebhookPayload;
  workflowRunId?: string;
}) {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: args.endpointId,
      workflowRunId: args.workflowRunId,
      eventId: args.payload.id,
      event: args.payload.type,
      payload: args.payload,
      status: "PENDING",
    },
  });

  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await sleep(RETRY_DELAYS_MS[attempt] ?? 0);

    const result = await postWebhook({
      url: args.url,
      secret: args.secret,
      payload: args.payload,
    });

    if (result.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SUCCESS",
          attempts: attempt + 1,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
      return;
    }

    lastError = result.error;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: attempt + 1,
        lastError,
      },
    });
  }

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "FAILED",
      lastError,
    },
  });
}

/** Fire-and-forget webhook emission for all matching user endpoints. */
export function emitWebhookEvent(args: {
  userId: string;
  payload: WebhookPayload;
  workflowRunId?: string;
}) {
  void (async () => {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
          userId: args.userId,
          enabled: true,
          events: { has: args.payload.type },
        },
      });

      await Promise.all(
        endpoints
          .filter((endpoint) => endpoint.events.includes(args.payload.type))
          .map((endpoint) =>
            deliverToEndpoint({
              endpointId: endpoint.id,
              url: endpoint.url,
              secret: endpoint.secret,
              payload: args.payload,
              workflowRunId: args.workflowRunId,
            }),
          ),
      );
    } catch (err) {
      console.error("[webhooks] emit failed", err);
    }
  })();
}
