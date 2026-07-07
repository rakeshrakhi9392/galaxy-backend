import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  jsonCreated,
  jsonOk,
  parseWithSchema,
  readJson,
  ApiError,
} from "@/lib/api";
import {
  ApiKeyCreateRequestSchema,
  ApiKeyCreateResponseSchema,
  ApiKeysListResponseSchema,
} from "@/lib/schemas";
import { toApiKeyApi } from "@/lib/apiKeyMappers";
import { getAuth } from "@/lib/auth";
import { createUnkeyApiKey, isUnkeyConfigured } from "@/lib/unkey";
import { randomUUID } from "node:crypto";

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth(req);
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk(
      parseWithSchema(ApiKeysListResponseSchema, {
        apiKeys: apiKeys.map(toApiKeyApi),
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
    const input = parseWithSchema(ApiKeyCreateRequestSchema, body);

    const localApiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: input.name,
        keyPrefix: "pending",
        unkeyKeyId: `pending_${randomUUID()}`,
      },
    });

    let secret: string;
    let keyPrefix: string;
    let unkeyKeyId: string;

    if (isUnkeyConfigured()) {
      const created = await createUnkeyApiKey({
        name: input.name,
        userId,
        localApiKeyId: localApiKey.id,
      });
      secret = created.secret;
      keyPrefix = created.keyPrefix;
      unkeyKeyId = created.unkeyKeyId;
    } else {
      await prisma.apiKey.delete({ where: { id: localApiKey.id } });

      throw new ApiError(503, "INTERNAL_ERROR", "API key creation requires Unkey configuration", {
        cause: "unkey_not_configured",
        metadata: {
          hint: "Set UNKEY_ROOT_KEY and UNKEY_API_ID, or use DEV_API_KEY for local testing",
        },
      });
    }

    const apiKey = await prisma.apiKey.update({
      where: { id: localApiKey.id },
      data: {
        keyPrefix,
        unkeyKeyId,
      },
    });

    return jsonCreated(
      parseWithSchema(ApiKeyCreateResponseSchema, {
        apiKey: toApiKeyApi(apiKey),
        secret,
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
