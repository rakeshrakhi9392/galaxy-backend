import type { CreditTransaction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CREDIT_BALANCE } from "@/lib/constants";
import type { CreditTransactionApi } from "@/lib/creditLedgerSchemas";

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  readonly required: number;
  readonly balance: number;

  constructor(required: number, balance: number) {
    super(
      `Insufficient credits: need ${required.toLocaleString()}, balance ${balance.toLocaleString()}.`,
    );
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.balance = balance;
  }
}

export async function getCreditBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  return user?.creditBalance ?? 0;
}

export function toCreditTransactionApi(row: CreditTransaction): CreditTransactionApi {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    workflowRunId: row.workflowRunId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Create user row + initial GRANT ledger entry (idempotent). */
export async function provisionUserWithCredits(userId: string, email?: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email, creditBalance: DEFAULT_CREDIT_BALANCE },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: "GRANT",
        amount: DEFAULT_CREDIT_BALANCE,
        balanceAfter: DEFAULT_CREDIT_BALANCE,
        referenceType: "account",
        referenceId: userId,
        metadata: { reason: "initial_grant" } as Prisma.InputJsonValue,
      },
    });
  });
}

/** Backfill GRANT row for legacy users created before ledger wiring. */
export async function ensureInitialGrantLedgerRow(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  if (!user || user.creditBalance <= 0) return;

  const existingGrant = await prisma.creditTransaction.findFirst({
    where: { userId, type: "GRANT" },
    select: { id: true },
  });
  if (existingGrant) return;

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: "GRANT",
      amount: user.creditBalance,
      balanceAfter: user.creditBalance,
      referenceType: "account",
      referenceId: userId,
      metadata: { reason: "initial_grant_backfill" } as Prisma.InputJsonValue,
    },
  });
}

export async function listCreditTransactions(
  userId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ transactions: CreditTransactionApi[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const rows = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor
      ? {
          cursor: { id: options.cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    transactions: page.map(toCreditTransactionApi),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export type DeductRunChargeArgs = {
  userId: string;
  amount: number;
  workflowRunId: string;
  nodeRunId: string;
  nodeId: string;
  nodeType: string;
};

/**
 * Atomically deduct credits after a successful node execution and append a ledger row.
 * No-op when amount is zero (request/response plumbing nodes).
 */
export async function deductRunCharge(args: DeductRunChargeArgs): Promise<number> {
  if (args.amount <= 0) {
    return getCreditBalance(args.userId);
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: args.userId },
      select: { creditBalance: true },
    });
    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    if (user.creditBalance < args.amount) {
      throw new InsufficientCreditsError(args.amount, user.creditBalance);
    }

    const balanceAfter = user.creditBalance - args.amount;

    await tx.user.update({
      where: { id: args.userId },
      data: { creditBalance: balanceAfter },
    });

    await tx.creditTransaction.create({
      data: {
        userId: args.userId,
        type: "RUN_CHARGE",
        amount: args.amount,
        balanceAfter,
        workflowRunId: args.workflowRunId,
        referenceType: "node_run",
        referenceId: args.nodeRunId,
        metadata: {
          nodeId: args.nodeId,
          nodeType: args.nodeType,
        } as Prisma.InputJsonValue,
      },
    });

    return balanceAfter;
  });
}

export async function assertSufficientCredits(userId: string, required: number): Promise<void> {
  if (required <= 0) return;
  const balance = await getCreditBalance(userId);
  if (balance < required) {
    throw new InsufficientCreditsError(required, balance);
  }
}
