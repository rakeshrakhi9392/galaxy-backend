import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkflowNode } from "@galaxy/schemas";
import type { ExecuteNodeInput, ExecuteNodeOutput } from "@/lib/executeNode";
import type { LayerExecutionItem, LayerExecutionResult, StartNodeBatchFn } from "./runOrchestration";

const executeNodeMock = vi.fn();

vi.mock("@/lib/executeNode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/executeNode")>();
  return {
    ...actual,
    executeNode: (input: ExecuteNodeInput) => executeNodeMock(input),
  };
});

const prismaMock = {
  workflowRun: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  nodeRun: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  providerAttempt: {
    create: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/creditsLedger", () => ({
  deductRunCharge: vi.fn().mockResolvedValue(999_999),
  getCreditBalance: vi.fn().mockResolvedValue(999_999_999),
  assertSufficientCredits: vi.fn().mockResolvedValue(undefined),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    readonly code = "INSUFFICIENT_CREDITS" as const;
    readonly required: number;
    readonly balance: number;
    constructor(required: number, balance: number) {
      super(`Insufficient credits: need ${required}, balance ${balance}.`);
      this.required = required;
      this.balance = balance;
    }
  },
}));

vi.mock("@/lib/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(),
}));

function node(id: string, type = "llm"): WorkflowNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function mockNodeBatch(
  handler?: (item: LayerExecutionItem) => LayerExecutionResult | undefined,
): StartNodeBatchFn {
  return async (items) =>
    items.map((item) => {
      const custom = handler?.(item);
      if (custom) return custom;
      return {
        nodeId: item.nodeId,
        ok: true as const,
        output: successOutput(item),
        durationMs: 1,
      };
    });
}

function defaultExecuteNodeOutput(input: ExecuteNodeInput): ExecuteNodeOutput {
  return {
    ok: true,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    sleptMs: 0,
    output:
      input.nodeType === "request"
        ? { prompt: "hello" }
        : input.nodeType === "response"
          ? { results: {} }
          : { value: input.nodeId },
    provider:
      input.nodeType === "request" || input.nodeType === "response"
        ? null
        : "openrouter-gemini-2.0-flash-exp-free",
  };
}

function successOutput(item: LayerExecutionItem): ExecuteNodeOutput {
  return {
    ok: true,
    nodeId: item.nodeId,
    nodeType: item.input.nodeType,
    sleptMs: 1,
    output: { value: item.nodeId },
    provider: item.input.nodeType === "request" || item.input.nodeType === "response" ? null : "openrouter-gemini-2.0-flash-exp-free",
  };
}

function runActive() {
  prismaMock.workflowRun.findFirst.mockImplementation(async (args: { where: { id?: string; workflowId?: string }; select?: { status: true } }) => {
    if (args.select?.status) {
      return { status: "RUNNING" };
    }
    return {
      id: "run-1",
      workflowId: "wf-1",
      ownerId: "user-1",
      scope: "FULL",
      targetNodeIds: [],
      graphSnapshot: currentGraph,
      startedAt: null,
    };
  });
}

let currentGraph: {
  nodes: WorkflowNode[];
  edges: Array<{ id: string; source: string; target: string }>;
};

let nodeRunStore: Array<{ id: string; nodeId: string; status: string }> = [];

describe("orchestrateWorkflowRunCore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getCreditBalance, deductRunCharge, assertSufficientCredits } = await import(
      "@/lib/creditsLedger"
    );
    vi.mocked(getCreditBalance).mockResolvedValue(999_999_999);
    vi.mocked(deductRunCharge).mockResolvedValue(999_999);
    vi.mocked(assertSufficientCredits).mockResolvedValue(undefined);

    nodeRunStore = [];
    prismaMock.providerAttempt.count.mockResolvedValue(0);
    executeNodeMock.mockImplementation(async (input: ExecuteNodeInput) =>
      defaultExecuteNodeOutput(input),
    );
    prismaMock.workflowRun.update.mockResolvedValue({});
    prismaMock.nodeRun.update.mockResolvedValue({});
    prismaMock.nodeRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.nodeRun.findMany.mockImplementation(async () =>
      nodeRunStore.filter((row) => row.status === "RUNNING"),
    );

    let nodeRunCounter = 0;
    prismaMock.nodeRun.create.mockImplementation(async ({ data }: { data: { nodeId: string; status?: string } }) => {
      nodeRunCounter += 1;
      const row = {
        id: `nr-${nodeRunCounter}`,
        nodeId: data.nodeId,
        status: data.status ?? "RUNNING",
      };
      nodeRunStore.push(row);
      return { id: row.id, nodeId: row.nodeId };
    });
    prismaMock.nodeRun.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: { status?: string } }) => {
        const row = nodeRunStore.find((item) => item.id === where.id);
        if (row && data.status) row.status = data.status;
        return row;
      },
    );
    prismaMock.nodeRun.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: { in: string[] } }; data: { status?: string } }) => {
        let count = 0;
        for (const row of nodeRunStore) {
          if (where.id.in.includes(row.id) && data.status) {
            row.status = data.status;
            count += 1;
          }
        }
        return { count };
      },
    );
  });

  it("executes independent branches and skips downstream failures", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c"), node("d")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
        { id: "b-d", source: "b", target: "d" },
      ],
    };
    runActive();

    const executed: string[] = [];

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) =>
        items.map((item) => {
          executed.push(item.nodeId);
          if (item.nodeId === "b") {
            return {
              nodeId: item.nodeId,
              ok: false as const,
              error: new Error("boom"),
              durationMs: 1,
            };
          }
          return {
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          };
        }),
    });

    expect(result.hadFailures).toBe(true);
    expect(executed).not.toContain("a");
    expect(executed).toContain("b");
    expect(executed).toContain("c");
    expect(executed).not.toContain("d");

    const requestUpdate = prismaMock.nodeRun.update.mock.calls.find(
      (call) => (call[0] as { where: { id: string } }).where.id === "nr-1",
    )?.[0] as { data: { provider?: string | null } } | undefined;
    expect(requestUpdate?.data.provider).toBeNull();

    const attemptProviders = prismaMock.providerAttempt.create.mock.calls.map(
      (call) => (call[0] as { data: { provider: string } }).data.provider,
    );
    expect(attemptProviders).not.toContain("stub");
    expect(attemptProviders.every((p) => p !== null)).toBe(true);
  });

  it("runs response when one upstream path fails and another succeeds", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c"), node("r", "response")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
        { id: "b-r", source: "b", target: "r" },
        { id: "c-r", source: "c", target: "r" },
      ],
    };
    runActive();

    const executed: string[] = [];
    const responseExecuteInputs: ExecuteNodeInput[] = [];

    executeNodeMock.mockImplementation(async (input: ExecuteNodeInput) => {
      if (input.nodeType === "response") {
        responseExecuteInputs.push(input);
      }
      return defaultExecuteNodeOutput(input);
    });

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) =>
        items.map((item) => {
          executed.push(item.nodeId);
          if (item.nodeId === "b") {
            return {
              nodeId: item.nodeId,
              ok: false as const,
              error: new Error("path b failed"),
              durationMs: 1,
            };
          }
          return {
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          };
        }),
    });

    expect(result.hadFailures).toBe(true);
    expect(executed).toContain("b");
    expect(executed).toContain("c");
    expect(executed).not.toContain("r");
    expect(executeNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "r", nodeType: "response" }),
    );
    expect(responseExecuteInputs[0]?.upstream).toEqual(
      expect.objectContaining({
        a: expect.anything(),
        c: expect.objectContaining({ value: "c" }),
      }),
    );
    expect(responseExecuteInputs[0]?.upstream).not.toHaveProperty("b");

    const responseUpdate = nodeRunStore.find((row) => row.nodeId === "r");
    expect(responseUpdate?.status).toBe("SUCCESS");
  });

  it("shows response in progress metadata while waiting on another upstream path", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c"), node("x"), node("r", "response")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
        { id: "b-r", source: "b", target: "r" },
        { id: "c-x", source: "c", target: "x" },
        { id: "x-r", source: "x", target: "r" },
      ],
    };
    runActive();

    const progressSnapshots: Array<Record<string, string>> = [];
    let releasePathX: (() => void) | undefined;
    const pathXStarted = new Promise<void>((resolve) => {
      releasePathX = resolve;
    });

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const resultPromise = orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      onProgress: async (progress) => {
        progressSnapshots.push({ ...progress.nodeStatuses });
      },
      startNodeBatch: async (items) => {
        const results = [];
        for (const item of items) {
          if (item.nodeId === "b") {
            results.push({
              nodeId: item.nodeId,
              ok: false as const,
              error: new Error("path b failed"),
              durationMs: 1,
            });
            continue;
          }
          if (item.nodeId === "x") {
            await pathXStarted;
            results.push({
              nodeId: item.nodeId,
              ok: true as const,
              output: successOutput(item),
              durationMs: 1,
            });
            continue;
          }
          results.push({
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          });
        }
        return results;
      },
    });

    await vi.waitFor(() => {
      expect(progressSnapshots.some((snapshot) => snapshot.r === "RUNNING")).toBe(true);
    });
    releasePathX?.();

    const result = await resultPromise;
    expect(result.hadFailures).toBe(true);
    expect(progressSnapshots.at(-1)?.r).toBe("SUCCESS");
  });

  it("marks node failed when all providers fail and preserves upstream outputs", async () => {
    const upstreamOutput = { prompt: "hello" };
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "b-c", source: "b", target: "c" },
      ],
    };
    runActive();

    const providerFailure = new Error(
      "openrouter-gemini attempt 1: Provider openrouter-gemini timed out after 120000ms; openrouter-fallback attempt 1: unavailable",
    );
    const batchInputs: LayerExecutionItem[] = [];
    const nodeRunUpdates: Array<{
      nodeId: string;
      status?: string;
      resolvedOutput?: unknown;
      error?: unknown;
    }> = [];

    prismaMock.nodeRun.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status?: string; resolvedOutput?: unknown; error?: unknown };
      }) => {
        const row = nodeRunStore.find((item) => item.id === where.id);
        if (row && data.status) row.status = data.status;
        if (row) {
          nodeRunUpdates.push({
            nodeId: row.nodeId,
            status: data.status,
            resolvedOutput: data.resolvedOutput,
            error: data.error,
          });
        }
        return row;
      },
    );

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) => {
        batchInputs.push(...items);
        return items.map((item) => {
          if (item.nodeId === "b") {
            return {
              nodeId: item.nodeId,
              ok: false as const,
              error: providerFailure,
              durationMs: 12,
            };
          }
          return {
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          };
        });
      },
    });

    expect(result.hadFailures).toBe(true);
    expect(result.errorSummary).toBe(`Failed at llm (b): ${providerFailure.message}`);

    const requestUpdate = nodeRunUpdates.find((row) => row.nodeId === "a");
    expect(requestUpdate?.status).toBe("SUCCESS");
    expect(requestUpdate?.resolvedOutput).toEqual(upstreamOutput);

    const failedUpdate = nodeRunUpdates.find((row) => row.nodeId === "b");
    expect(failedUpdate?.status).toBe("FAILED");
    expect(failedUpdate?.error).toMatchObject({ message: providerFailure.message });

    expect(nodeRunStore.find((row) => row.nodeId === "c")?.status).toBe("SKIPPED");
    const llmBatch = batchInputs.find((item) => item.nodeId === "b");
    expect(llmBatch?.input.upstream).toEqual({ a: upstreamOutput });
  });

  it("runs independent heavy nodes in one batch wave (Trigger-safe)", async () => {
    // A → B, A → C → D. B and C share a wave; D runs only after that wave completes.
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c"), node("d")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
        { id: "c-d", source: "c", target: "d" },
      ],
    };
    runActive();

    const waves: string[][] = [];

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) => {
        waves.push(items.map((item) => item.nodeId).sort());
        return items.map((item) => ({
          nodeId: item.nodeId,
          ok: true as const,
          output: successOutput(item),
          durationMs: 1,
        }));
      },
    });

    expect(waves).toEqual([["b", "c"], ["d"]]);
  });

  it("runs request and response inline without calling startNodeBatch", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b", "response")],
      edges: [{ id: "a-b", source: "a", target: "b" }],
    };
    runActive();

    const startNodeBatch = vi.fn(mockNodeBatch());

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch,
    });

    expect(startNodeBatch).not.toHaveBeenCalled();
    expect(executeNodeMock).toHaveBeenCalledTimes(2);
    expect(executeNodeMock.mock.calls[0]?.[0]?.nodeType).toBe("request");
    expect(executeNodeMock.mock.calls[1]?.[0]?.nodeType).toBe("response");
  });

  it("fails the run immediately when the execution subgraph has a cycle", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "b-c", source: "b", target: "c" },
        { id: "c-b", source: "c", target: "b" },
      ],
    };
    runActive();

    const startNodeBatch = vi.fn(mockNodeBatch());

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch,
    });

    expect(result.ok).toBe(false);
    expect(startNodeBatch).not.toHaveBeenCalled();
    expect(prismaMock.nodeRun.create).not.toHaveBeenCalled();

    const failUpdate = prismaMock.workflowRun.update.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === "FAILED",
    )?.[0] as { data: { errorSummary?: string } } | undefined;
    expect(failUpdate?.data.errorSummary).toMatch(/cycle/i);
  });

  it("stops scheduling when the run is no longer RUNNING", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "b-c", source: "b", target: "c" },
      ],
    };

    let statusChecks = 0;
    prismaMock.workflowRun.findFirst.mockImplementation(async (args: { select?: { status: true } }) => {
      if (args.select?.status) {
        statusChecks += 1;
        // Cancel before the second wave (after request completes).
        return { status: statusChecks <= 1 ? "RUNNING" : "CANCELLED" };
      }
      return {
        id: "run-1",
        workflowId: "wf-1",
        scope: "FULL",
        targetNodeIds: [],
        graphSnapshot: currentGraph,
        startedAt: null,
      };
    });

    const executed: string[] = [];
    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) =>
        items.map((item) => {
          executed.push(item.nodeId);
          return {
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          };
        }),
    });

    expect(result.ok).toBe(false);
    expect(executed).not.toContain("c");
    const cancelUpdate = prismaMock.workflowRun.update.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === "CANCELLED",
    );
    expect(cancelUpdate).toBeTruthy();
  });

  it("marks in-flight RUNNING nodes FAILED when orchestrator throws mid-wave", async () => {
    currentGraph = {
      nodes: [node("a", "request"), node("b"), node("c")],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
      ],
    };
    runActive();

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    let batchCalls = 0;
    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) => {
        batchCalls += 1;
        throw new Error("Trigger worker crashed");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toBe("Trigger worker crashed");

    const stuckNodes = nodeRunStore.filter((row) => row.nodeId === "b" || row.nodeId === "c");
    expect(stuckNodes.every((row) => row.status === "FAILED")).toBe(true);
    expect(nodeRunStore.every((row) => row.status !== "RUNNING")).toBe(true);

    const failUpdate = prismaMock.workflowRun.update.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === "FAILED",
    )?.[0] as { data: { errorSummary?: string } } | undefined;
    expect(failUpdate?.data.errorSummary).toBe("Trigger worker crashed");
  });

  it("records estimatedCredits on node runs skipped for insufficient credits", async () => {
    const { getCreditBalance } = await import("@/lib/creditsLedger");
    vi.mocked(getCreditBalance).mockResolvedValue(50);

    currentGraph = {
      nodes: [
        node("req", "request"),
        {
          id: "img",
          type: "gpt-image-2",
          position: { x: 0, y: 0 },
          data: { inputs: { prompt: "fox", quality: "high", n: 1 } },
        },
      ],
      edges: [{ id: "req-img", source: "req", target: "img" }],
    };
    runActive();

    const createdRows: Array<{ data: Record<string, unknown> }> = [];
    prismaMock.nodeRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      createdRows.push({ data });
      const row = {
        id: `nr-${createdRows.length}`,
        nodeId: data.nodeId as string,
        status: data.status as string,
      };
      nodeRunStore.push(row);
      return { id: row.id, nodeId: row.nodeId };
    });

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: mockNodeBatch(),
    });

    const skipped = createdRows.find(
      (row) => row.data.nodeId === "img" && row.data.status === "SKIPPED",
    );
    expect(skipped?.data.estimatedCredits).toBe(210_000);
    expect(result.hadFailures).toBe(true);
  });

  it("marks run FAILED when credits exhaust mid-workflow and preserves upstream outputs", async () => {
    const { getCreditBalance, deductRunCharge } = await import("@/lib/creditsLedger");
    let balance = 500_000;
    vi.mocked(getCreditBalance).mockImplementation(async () => balance);
    vi.mocked(deductRunCharge).mockImplementation(async (args: { amount: number }) => {
      // Drain extra so the next node cannot afford its estimate after the first charge.
      balance = Math.max(0, balance - args.amount - 200_000);
      return balance;
    });

    currentGraph = {
      nodes: [
        node("req", "request"),
        {
          id: "img1",
          type: "gpt-image-2",
          position: { x: 0, y: 0 },
          data: { inputs: { prompt: "fox", quality: "high", n: 1 } },
        },
        {
          id: "img2",
          type: "gpt-image-2",
          position: { x: 0, y: 0 },
          data: { inputs: { prompt: "wolf", quality: "high", n: 1 } },
        },
      ],
      edges: [
        { id: "req-img1", source: "req", target: "img1" },
        { id: "img1-img2", source: "img1", target: "img2" },
      ],
    };
    runActive();

    const nodeRunUpdates: Array<{
      nodeId: string;
      status?: string;
      resolvedOutput?: unknown;
    }> = [];

    prismaMock.nodeRun.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status?: string; resolvedOutput?: unknown };
      }) => {
        const row = nodeRunStore.find((item) => item.id === where.id);
        if (row && data.status) row.status = data.status;
        if (row) {
          nodeRunUpdates.push({
            nodeId: row.nodeId,
            status: data.status,
            resolvedOutput: data.resolvedOutput,
          });
        }
        return row;
      },
    );

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: mockNodeBatch(),
    });

    expect(result.cancelled).toBe(false);
    expect(result.hadFailures).toBe(true);
    expect(result.errorSummary).toMatch(/insufficient credits/i);

    const terminalUpdate = prismaMock.workflowRun.update.mock.calls.find(
      (call) => {
        const status = (call[0] as { data: { status?: string } }).data.status;
        return status === "FAILED" || status === "CANCELLED";
      },
    )?.[0] as { data: { status?: string; errorSummary?: string } } | undefined;
    expect(terminalUpdate?.data.status).toBe("FAILED");
    expect(terminalUpdate?.data.errorSummary).toMatch(/insufficient credits/i);

    expect(nodeRunUpdates.find((row) => row.nodeId === "img1")?.status).toBe("SUCCESS");
    expect(nodeRunStore.find((row) => row.nodeId === "img2")?.status).toBe("SKIPPED");
  });

  it("persists logPreview and prefixes failed-at in error summary when a node fails", async () => {
    currentGraph = {
      nodes: [node("req", "request"), node("img", "llm")],
      edges: [{ id: "req-img", source: "req", target: "img" }],
    };
    runActive();

    const logPreview =
      "Provider openai-gpt-image-2-stub TIMEOUT (PROVIDER_TIMEOUT): timed out\nProvider openai-gpt-image-2-fallback-stub SUCCESS in 1ms";
    const failError = new Error("All providers failed");
    (failError as Error & { logPreview: string }).logPreview = logPreview;

    const logPreviewUpdates: string[] = [];

    prismaMock.nodeRun.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status?: string; logPreview?: string };
      }) => {
        const row = nodeRunStore.find((item) => item.id === where.id);
        if (row && data.status) row.status = data.status;
        if (data.logPreview) logPreviewUpdates.push(data.logPreview);
        return row;
      },
    );

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: mockNodeBatch((item) => {
        if (item.nodeId === "img") {
          return {
            nodeId: item.nodeId,
            ok: false as const,
            error: failError,
            durationMs: 12,
          };
        }
        return undefined;
      }),
    });

    expect(result.hadFailures).toBe(true);
    expect(logPreviewUpdates).toContain(logPreview);

    const terminalUpdate = prismaMock.workflowRun.update.mock.calls.find(
      (call) => {
        const status = (call[0] as { data: { status?: string } }).data.status;
        return status === "FAILED";
      },
    )?.[0] as { data: { errorSummary?: string } } | undefined;

    expect(terminalUpdate?.data.errorSummary).toMatch(/Failed at llm \(img\)/);
    expect(terminalUpdate?.data.errorSummary).toMatch(/All providers failed/);
  });

  it("simulates webhook timeout fallback attempts visible through executeNode log preview", async () => {
    currentGraph = {
      nodes: [node("req", "request"), node("img", "llm")],
      edges: [{ id: "req-img", source: "req", target: "img" }],
    };
    runActive();

    const providerAttemptCreates: Array<Record<string, unknown>> = [];
    let providerAttemptCount = 0;
    prismaMock.providerAttempt.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        providerAttemptCreates.push(data);
        providerAttemptCount += 1;
        return { id: `pa-${providerAttemptCount}` };
      },
    );
    prismaMock.providerAttempt.count.mockImplementation(async () => providerAttemptCount);

    const logPreview =
      "Provider openai-gpt-image-2-stub TIMEOUT (PROVIDER_TIMEOUT): Waitpoint token timed out\nProvider openai-gpt-image-2-fallback-stub SUCCESS in 1ms";

    const { orchestrateWorkflowRunCore } = await import("./runOrchestration");

    const result = await orchestrateWorkflowRunCore({
      workflowId: "wf-1",
      runId: "run-1",
      startNodeBatch: async (items) => {
        const results = [];
        for (const item of items) {
          if (item.nodeId === "img") {
            await prismaMock.providerAttempt.create({
              data: {
                nodeRunId: item.nodeRunId,
                provider: "openai-gpt-image-2-stub",
                status: "TIMEOUT",
                durationMs: 120_000,
                error: "Waitpoint token timed out after 120s",
                errorCode: "PROVIDER_TIMEOUT",
              },
            });
            await prismaMock.providerAttempt.create({
              data: {
                nodeRunId: item.nodeRunId,
                provider: "openai-gpt-image-2-fallback-stub",
                status: "SUCCESS",
                durationMs: 1,
                error: null,
                errorCode: null,
              },
            });

            results.push({
              nodeId: item.nodeId,
              ok: true as const,
              output: {
                ok: true as const,
                nodeId: item.nodeId,
                nodeType: item.input.nodeType,
                sleptMs: 1,
                output: { result: [{ url: "https://example.com/fallback.png" }] },
                provider: "openai-gpt-image-2-fallback-stub",
                logPreview,
              },
              durationMs: 1,
            });
            continue;
          }

          results.push({
            nodeId: item.nodeId,
            ok: true as const,
            output: successOutput(item),
            durationMs: 1,
          });
        }
        return results;
      },
    });

    expect(result.ok).toBe(true);
    expect(providerAttemptCreates).toHaveLength(2);
    expect(providerAttemptCreates[0]).toMatchObject({
      status: "TIMEOUT",
      errorCode: "PROVIDER_TIMEOUT",
    });
    expect(providerAttemptCreates[1]).toMatchObject({
      status: "SUCCESS",
      provider: "openai-gpt-image-2-fallback-stub",
    });

    const successUpdate = prismaMock.nodeRun.update.mock.calls.find(
      (call) =>
        (call[0] as { data: { status?: string; logPreview?: string } }).data.status ===
          "SUCCESS" &&
        (call[0] as { data: { logPreview?: string } }).data.logPreview === logPreview,
    );
    expect(successUpdate).toBeDefined();
  });
});
