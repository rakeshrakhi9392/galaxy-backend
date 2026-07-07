import { z } from "zod";
import { handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import {
  CreditTransactionsListResponseSchema,
} from "@/lib/creditLedgerSchemas";
import { getAuth } from "@/lib/auth";
import { ensureInitialGrantLedgerRow, listCreditTransactions } from "@/lib/creditsLedger";

const CreditTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth(req);
    await ensureInitialGrantLedgerRow(userId);
    const url = new URL(req.url);
    const query = CreditTransactionsQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });

    const payload = await listCreditTransactions(userId, query);
    return jsonOk(parseWithSchema(CreditTransactionsListResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
