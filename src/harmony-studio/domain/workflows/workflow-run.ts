export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type WorkflowRun = {
  id: string;
  projectId: string;
  status: WorkflowRunStatus;
  configuration: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function createWorkflowRun(input: {
  id: string;
  projectId: string;
  configuration?: Record<string, unknown>;
  now?: string;
}): WorkflowRun {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    projectId: input.projectId,
    status: "queued",
    configuration: input.configuration ?? {},
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
