import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { getCreditBalance } from "@/lib/creditsLedger";

export const AccountResponseSchema = z.object({
  creditBalance: z.number().int(),
});

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth(req);
    const creditBalance = await getCreditBalance(userId);
    return jsonOk(parseWithSchema(AccountResponseSchema, { creditBalance }));
  } catch (err) {
    return handleApiError(err);
  }
}
