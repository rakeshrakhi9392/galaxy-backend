-- Restore truncated per-node execution log preview for history UI.
ALTER TABLE "NodeRun" ADD COLUMN "logPreview" TEXT;
