import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogNodeType } from "@galaxy/schemas";
import type { ExecuteNodeOutput } from "@/lib/executeNode";
import type { LayerExecutionItem } from "@/lib/runOrchestration";

const triggerByTaskAndWaitMock = vi.fn();

const taskMocks = new Map<string, { id: string; triggerAndWait: ReturnType<typeof vi.fn> }>();

vi.mock("@trigger.dev/sdk/v3", () => ({
  batch: {
    triggerByTaskAndWait: (...args: unknown[]) => triggerByTaskAndWaitMock(...args),
  },
}));

function mockTask(nodeType: string) {
  let task = taskMocks.get(nodeType);
  if (!task) {
    task = {
      id: `execute-node-${nodeType}`,
      triggerAndWait: vi.fn(),
    };
    taskMocks.set(nodeType, task);
  }
  return task;
}

vi.mock("./nodeExecuteTasks", () => ({
  getNodeExecuteTask: (nodeType: string) => mockTask(nodeType),
}));

function layerItem(nodeId: string, nodeType: CatalogNodeType): LayerExecutionItem {
  return {
    nodeRunId: `nr-${nodeId}`,
    nodeId,
    nodeCreditEstimate: 0,
    input: {
      workflowRunId: "run-1",
      nodeRunId: `nr-${nodeId}`,
      nodeId,
      nodeType,
      resolvedInputs: {},
    },
  };
}

function successOutput(item: LayerExecutionItem, sleptMs = 42): ExecuteNodeOutput {
  const outputByType: Record<CatalogNodeType, unknown> = {
    request: { field_default: "value" },
    response: { results: { result: "done" } },
    llm: { output: "hello" },
    "gpt-image-2": { result: [{ url: "https://example.com/a.png", width: 1024, height: 1024 }] },
    "kling-v3-pro": {
      video_url: "https://example.com/v.mp4",
      duration: 5,
      width: 1280,
      height: 720,
    },
    "merge-video": { video_url: "https://example.com/merged.mp4" },
    "merge-av": { video_url: "https://example.com/av.mp4" },
    "extract-audio": { audio_url: "https://example.com/a.mp3" },
  };

  return {
    ok: true,
    nodeId: item.nodeId,
    nodeType: item.input.nodeType,
    sleptMs,
    output: outputByType[item.input.nodeType],
    provider:
      item.input.nodeType === "request" || item.input.nodeType === "response"
        ? null
        : "test-provider",
  };
}

describe("startNodeBatchTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskMocks.clear();
  });

  it("returns an empty array when there are no items", async () => {
    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");

    await expect(startNodeBatchTrigger([])).resolves.toEqual([]);
    expect(triggerByTaskAndWaitMock).not.toHaveBeenCalled();
  });

  it("uses triggerAndWait for a single-item wave", async () => {
    const item = layerItem("a", "llm");
    const output = successOutput(item);
    mockTask("llm").triggerAndWait.mockResolvedValue({ ok: true, output });

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger([item]);

    expect(mockTask("llm").triggerAndWait).toHaveBeenCalledWith(item.input);
    expect(triggerByTaskAndWaitMock).not.toHaveBeenCalled();
    expect(results).toEqual([{ nodeId: "a", ok: true, output, durationMs: 42 }]);
  });

  it("uses batch.triggerByTaskAndWait once for multi-item waves", async () => {
    const items = [layerItem("b", "llm"), layerItem("c", "gpt-image-2")];
    const outputs = items.map((item) => successOutput(item, 10));

    triggerByTaskAndWaitMock.mockResolvedValue({
      runs: [
        { ok: true, output: outputs[0] },
        { ok: true, output: outputs[1] },
      ],
    });

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger(items);

    expect(triggerByTaskAndWaitMock).toHaveBeenCalledTimes(1);
    const batchArg = triggerByTaskAndWaitMock.mock.calls[0]![0] as Array<{
      task: { id: string };
      payload: { nodeId: string };
    }>;
    expect(batchArg).toHaveLength(2);
    expect(batchArg[0]!.task.id).toBe("execute-node-llm");
    expect(batchArg[0]!.payload.nodeId).toBe("b");
    expect(batchArg[1]!.task.id).toBe("execute-node-gpt-image-2");
    expect(batchArg[1]!.payload.nodeId).toBe("c");

    for (const task of taskMocks.values()) {
      expect(task.triggerAndWait).not.toHaveBeenCalled();
    }

    expect(results).toEqual([
      { nodeId: "b", ok: true, output: outputs[0], durationMs: 10 },
      { nodeId: "c", ok: true, output: outputs[1], durationMs: 10 },
    ]);
  });

  it("maps failed child runs to ok: false results", async () => {
    const items = [layerItem("a", "llm"), layerItem("b", "llm")];
    const failure = new Error("child task failed");

    triggerByTaskAndWaitMock.mockResolvedValue({
      runs: [
        { ok: true, output: successOutput(items[0]!) },
        { ok: false, error: failure },
      ],
    });

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger(items);

    expect(results[0]?.ok).toBe(true);
    expect(results[1]).toMatchObject({ nodeId: "b", ok: false, error: failure });
  });

  it("fails items with missing batch results", async () => {
    const items = [layerItem("a", "llm"), layerItem("b", "llm")];

    triggerByTaskAndWaitMock.mockResolvedValue({
      runs: [{ ok: true, output: successOutput(items[0]!) }],
    });

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger(items);

    expect(results[1]).toMatchObject({ nodeId: "b", ok: false });
    if (results[1]?.ok === false) {
      expect(results[1].error).toMatchObject({ message: "Missing batch result for node" });
    }
  });

  it("marks every item failed when batch.triggerByTaskAndWait throws", async () => {
    const items = [layerItem("a", "llm"), layerItem("b", "llm")];
    const batchError = new Error("Trigger batch rejected parallel waits");

    triggerByTaskAndWaitMock.mockRejectedValue(batchError);

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger(items);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.ok === false)).toBe(true);
    expect(results[0]?.ok === false && results[0].error).toBe(batchError);
    expect(results[1]?.ok === false && results[1].error).toBe(batchError);
  });

  it("marks a single-item wave failed when triggerAndWait throws", async () => {
    const item = layerItem("a", "llm");
    const taskError = new Error("triggerAndWait failed");
    mockTask("llm").triggerAndWait.mockRejectedValue(taskError);

    const { startNodeBatchTrigger } = await import("./startNodeBatchTrigger");
    const results = await startNodeBatchTrigger([item]);

    expect(results[0]).toMatchObject({ nodeId: "a", ok: false, error: taskError });
  });
});
