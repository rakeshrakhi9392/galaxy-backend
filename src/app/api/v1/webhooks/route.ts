import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  jsonCreated,
  jsonOk,
  parseWithSchema,
  readJson,
} from "@/lib/api";
import {
  WebhookEndpointCreateRequestSchema,
  WebhookEndpointCreateResponseSchema,
  WebhookEndpointsListResponseSchema,
} from "@/lib/schemas";
import { toWebhookEndpointApi } from "@/lib/webhookMappers";
import { getAuth } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth(req);
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk(
      parseWithSchema(WebhookEndpointsListResponseSchema, {
        webhooks: webhooks.map(toWebhookEndpointApi),
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await getAuth(req);
    const body = await readJson(req);
    const input = parseWithSchema(WebhookEndpointCreateRequestSchema, body);
    const secret = randomBytes(32).toString("hex");

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url: input.url,
        secret,
        events: input.events,
        enabled: input.enabled,
      },
    });

    return jsonCreated(
      parseWithSchema(WebhookEndpointCreateResponseSchema, {
        webhook: toWebhookEndpointApi(webhook),
        secret,
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
