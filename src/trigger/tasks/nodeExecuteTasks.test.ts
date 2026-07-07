import { describe, expect, it } from "vitest";
import { catalogNodes } from "@/nodes/catalog";
import {
  allNodeExecuteTasks,
  getNodeExecuteTask,
  nodeExecuteTasksByType,
} from "./nodeExecuteTasks";

describe("nodeExecuteTasks", () => {
  it("registers one Trigger task per catalog node", () => {
    expect(allNodeExecuteTasks).toHaveLength(catalogNodes.length);
    for (const node of catalogNodes) {
      expect(nodeExecuteTasksByType[node.type]).toBeDefined();
      expect(getNodeExecuteTask(node.type).id).toBe(`execute-node-${node.type}`);
    }
  });

  it("throws for unknown node types", () => {
    expect(() => getNodeExecuteTask("not-a-real-node")).toThrow(/No Trigger task/);
  });
});
