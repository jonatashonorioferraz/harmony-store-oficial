import type { WorkflowRun } from "../../domain/workflows/workflow-run.ts";

export interface WorkflowRunRepository {
  save(run: WorkflowRun): Promise<void>;
  findById(id: string): Promise<WorkflowRun | null>;
  findLatestRecoverable(projectId: string): Promise<WorkflowRun | null>;
}
