import type { StageRun } from "../../domain/orchestration/workflow-plan.ts";
import type { WorkflowRun } from "../../domain/workflows/workflow-run.ts";

export interface OrchestrationRepository {
  saveWorkflow(run: WorkflowRun): Promise<void>;
  findWorkflow(id: string): Promise<WorkflowRun | null>;
  saveStages(stages: StageRun[]): Promise<void>;
  listStages(workflowRunId: string): Promise<StageRun[]>;
}
