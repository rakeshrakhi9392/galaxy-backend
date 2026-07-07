import { prisma } from "@/lib/prisma";
import {
  ApiError,
  handleApiError,
  jsonOk,
  parseWithSchema,
  readJson,
} from "@/lib/api";
import {
  WebhookEndpointUpdateRequestSchema,
  WebhookEndpointUpdateResponseSchema,
} from "@/lib/schemas";
import { toWebhookEndpointApi } from "@/lib/webhookMappers";
import { getAuth } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getAuth(req);
    const { id } = await params;
    const body = await readJson(req);
    const input = parseWithSchema(WebhookEndpointUpdateRequestSchema, body);

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Webhook endpoint not found");
    }

    const webhook = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.events !== undefined ? { events: input.events } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });

    return jsonOk(
      parseWithSchema(WebhookEndpointUpdateResponseSchema, {
        webhook: toWebhookEndpointApi(webhook),
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getAuth(req);
    const { id } = await params;

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Webhook endpoint not found");
    }

    await prisma.webhookEndpoint.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
