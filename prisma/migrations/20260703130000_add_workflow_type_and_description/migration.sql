-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkflowType" AS ENUM ('USER', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "type" "WorkflowType" NOT NULL DEFAULT 'USER';

-- CreateIndex (may have failed in prior migration when type was missing)
CREATE INDEX IF NOT EXISTS "Workflow_type_updatedAt_idx" ON "Workflow"("type", "updatedAt" DESC);
