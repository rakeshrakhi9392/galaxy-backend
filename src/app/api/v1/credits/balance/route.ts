import { handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import {
  buildCreditBalanceResponse,
  CreditBalanceResponseSchema,
} from "@/lib/creditEstimateApi";
import { getAuth } from "@/lib/auth";
import { getCreditBalance } from "@/lib/creditsLedger";

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth(req);
    const availableBalance = await getCreditBalance(userId);
    const payload = buildCreditBalanceResponse(availableBalance);
    return jsonOk(parseWithSchema(CreditBalanceResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
