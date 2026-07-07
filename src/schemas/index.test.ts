import { describe, expect, it } from "vitest";
import {
  SYSTEM_WORKFLOW_TEMPLATES,
  validateWorkflowGraphNoCycles,
  emptyWorkflowGraph,
} from "./index";

describe("schemas index barrel", () => {
  it("exports system workflow templates", () => {
    expect(SYSTEM_WORKFLOW_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("exports graph validation helpers", () => {
    expect(validateWorkflowGraphNoCycles(emptyWorkflowGraph())).toEqual([]);
  });
});
