import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { DEV_UNKEY_KEY_ID } from "@/lib/auth/apiKey";
import { isUnkeyConfigured, revokeUnkeyApiKey } from "@/lib/unkey";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getAuth(req);
    const { id } = await params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId, revokedAt: null },
    });

    if (!apiKey) {
      throw new ApiError(404, "NOT_FOUND", "API key not found");
    }

    if (isUnkeyConfigured() && apiKey.unkeyKeyId !== DEV_UNKEY_KEY_ID) {
      await revokeUnkeyApiKey(apiKey.unkeyKeyId);
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
