import { z } from "zod";

export const WorkflowsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type WorkflowsListQuery = z.infer<typeof WorkflowsListQuerySchema>;

export function pageToSkip(page: number, pageSize: number) {
  return (page - 1) * pageSize;
}
