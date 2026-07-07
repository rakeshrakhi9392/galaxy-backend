import { z } from "zod";
import { isoDateString } from "@galaxy/schemas";

export const CreditTxnTypeSchema = z.enum(["GRANT", "RUN_CHARGE", "RUN_REFUND", "ADJUSTMENT"]);

export const CreditTransactionSchema = z.object({
  id: z.string().min(1),
  type: CreditTxnTypeSchema,
  amount: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: isoDateString,
});

export const CreditTransactionsListResponseSchema = z.object({
  transactions: z.array(CreditTransactionSchema),
  nextCursor: z.string().nullable(),
});

export type CreditTransactionApi = z.infer<typeof CreditTransactionSchema>;
