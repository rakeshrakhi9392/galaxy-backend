-- AlterTable

ALTER TABLE "Workflow" ADD COLUMN "slug" TEXT;

ALTER TABLE "Workflow" ADD COLUMN "nodeType" TEXT;



-- CreateIndex

CREATE UNIQUE INDEX "Workflow_slug_key" ON "Workflow"("slug");

