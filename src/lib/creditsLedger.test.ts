import { describe, expect, it, vi, beforeEach } from "vitest";

const txMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  creditTransaction: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  assertSufficientCredits,
  deductRunCharge,
  getCreditBalance,
  InsufficientCreditsError,
  provisionUserWithCredits,
  toCreditTransactionApi,
} from "@/lib/creditsLedger";

describe("creditsLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads user credit balance", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 50_000 });
    await expect(getCreditBalance("user-1")).resolves.toBe(50_000);
  });

  it("deducts credits and writes a ledger row", async () => {
    txMock.user.findUnique.mockResolvedValue({ creditBalance: 1_000_000 });
    txMock.user.update.mockResolvedValue({});
    txMock.creditTransaction.create.mockResolvedValue({});

    const balanceAfter = await deductRunCharge({
      userId: "user-1",
      amount: 210_000,
      workflowRunId: "run-1",
      nodeRunId: "nr-1",
      nodeId: "img",
      nodeType: "gpt-image-2",
    });

    expect(balanceAfter).toBe(790_000);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { creditBalance: 790_000 },
    });
    expect(txMock.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RUN_CHARGE",
          amount: 210_000,
          balanceAfter: 790_000,
          workflowRunId: "run-1",
          referenceId: "nr-1",
        }),
      }),
    );
  });

  it("skips deduction for zero-cost nodes", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 100 });
    await expect(
      deductRunCharge({
        userId: "user-1",
        amount: 0,
        workflowRunId: "run-1",
        nodeRunId: "nr-1",
        nodeId: "req",
        nodeType: "request",
      }),
    ).resolves.toBe(100);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("throws when balance is insufficient", async () => {
    txMock.user.findUnique.mockResolvedValue({ creditBalance: 100 });
    await expect(
      deductRunCharge({
        userId: "user-1",
        amount: 210_000,
        workflowRunId: "run-1",
        nodeRunId: "nr-1",
        nodeId: "img",
        nodeType: "gpt-image-2",
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("assertSufficientCredits blocks underfunded runs", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 1_000 });
    await expect(assertSufficientCredits("user-1", 210_000)).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
  });

  it("provisions a new user with an initial GRANT ledger row", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    txMock.user.create.mockResolvedValue({});
    txMock.creditTransaction.create.mockResolvedValue({});

    await provisionUserWithCredits("user-new", "new@example.com");

    expect(txMock.user.create).toHaveBeenCalled();
    expect(txMock.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "GRANT",
          userId: "user-new",
        }),
      }),
    );
  });

  it("maps credit transactions to API shape", () => {
    expect(
      toCreditTransactionApi({
        id: "txn-1",
        userId: "user-1",
        type: "RUN_CHARGE",
        amount: 100,
        balanceAfter: 900,
        referenceType: "node_run",
        referenceId: "nr-1",
        workflowRunId: "run-1",
        metadata: { nodeId: "a" },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      } as never),
    ).toEqual({
      id: "txn-1",
      type: "RUN_CHARGE",
      amount: 100,
      balanceAfter: 900,
      referenceType: "node_run",
      referenceId: "nr-1",
      workflowRunId: "run-1",
      metadata: { nodeId: "a" },
      createdAt: "2026-07-01T00:00:00.000Z",
    });
  });
});
