import type { AgentKnowledgeRepository } from "../ports/agent-knowledge-repository.ts";
import type { AuditEventRepository } from "../ports/audit-event-repository.ts";
import type { ExcellenceLibraryRepository } from "../ports/excellence-library-repository.ts";
import type { OrchestrationRepository } from "../ports/orchestration-repository.ts";
import type { StageExecutor } from "../ports/stage-executor.ts";
import { buildContextBundle } from "../../domain/orchestration/context-bundle.ts";
import { createStageRun, STANDARD_WORKFLOW, type StageDefinition, type StageRun } from "../../domain/orchestration/workflow-plan.ts";
import { createWorkflowRun, type WorkflowRun } from "../../domain/workflows/workflow-run.ts";

const now = () => new Date().toISOString();
async function hash(value: unknown) { const bytes = new TextEncoder().encode(JSON.stringify(value)); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
const definition = (key: string) => { const item = STANDARD_WORKFLOW.find((stage) => stage.key === key); if (!item) throw new Error(`Unknown stage: ${key}`); return item; };

export class WorkflowOrchestrator {
  private readonly repository: OrchestrationRepository;
  private readonly knowledge: AgentKnowledgeRepository;
  private readonly excellence: ExcellenceLibraryRepository;
  private readonly executor: StageExecutor;
  private readonly audit: AuditEventRepository;
  constructor(input: { repository: OrchestrationRepository; knowledge: AgentKnowledgeRepository; excellence: ExcellenceLibraryRepository; executor: StageExecutor; audit: AuditEventRepository }) { this.repository = input.repository; this.knowledge = input.knowledge; this.excellence = input.excellence; this.executor = input.executor; this.audit = input.audit; }

  async start(input: { id: string; projectId: string; initialData: Record<string, unknown>; actorId: string; auditId: string; now?: string }) {
    const timestamp = input.now ?? now();
    const run = createWorkflowRun({ id: input.id, projectId: input.projectId, configuration: { initialData: structuredClone(input.initialData) }, now: timestamp });
    const stages = STANDARD_WORKFLOW.map((stage) => createStageRun(run.id, stage, 1, timestamp));
    await this.repository.saveWorkflow(run); await this.repository.saveStages(stages);
    await this.audit.append({ id: input.auditId, projectId: run.projectId, actorId: input.actorId, eventType: "workflow.started", entityType: "workflow_run", entityId: run.id, before: null, after: { status: run.status, stages: stages.map((stage) => stage.stageKey) }, metadata: null, createdAt: timestamp });
    return run;
  }

  async runNext(workflowRunId: string, actorId = "system") {
    const run = await this.requiredRun(workflowRunId); const stages = await this.repository.listStages(workflowRunId);
    const latest = this.latestAttempts(stages); const next = STANDARD_WORKFLOW.find((candidate) => latest.get(candidate.key)?.status === "pending" && candidate.dependencies.every((dependency) => latest.get(dependency)?.status === "succeeded"));
    if (!next) return this.finishIfComplete(run, latest);
    const stage = latest.get(next.key)!; const availableData = this.availableData(run, latest);
    const knowledge = await this.knowledge.findPublished(next.agentRole); if (!knowledge) return this.block(stage, run, "KNOWLEDGE_UNAVAILABLE", `No published knowledge for ${next.agentRole}`, actorId);
    const initial = run.configuration.initialData as Record<string, unknown> | undefined;
    const excellence = next.usesExcellence ? await this.excellence.searchActive({ agentRole: next.agentRole, marketplace: String(initial?.marketplace ?? ""), productCategory: String(initial?.productCategory ?? ""), limit: 3 }) : [];
    const context = buildContextBundle({ stageKey: next.key, agentRole: next.agentRole, allowedInputs: next.allowedInputs, availableData, knowledge, excellence });
    const startedAt = now(); const running: StageRun = { ...stage, status: "running", knowledgeVersionId: knowledge.id, inputHash: await hash(context), startedAt, updatedAt: startedAt };
    const activeRun: WorkflowRun = { ...run, status: "running", startedAt: run.startedAt ?? startedAt, updatedAt: startedAt };
    await this.repository.saveWorkflow(activeRun); await this.repository.saveStages([running]);
    try {
      const result = await this.executor.execute(context, running.idempotencyKey); const completedAt = now();
      const succeeded: StageRun = { ...running, status: "succeeded", output: structuredClone(result.output), usage: structuredClone(result.usage ?? null), completedAt, updatedAt: completedAt };
      await this.repository.saveStages([succeeded]);
      await this.audit.append({ id: crypto.randomUUID(), projectId: run.projectId, actorId, eventType: "stage.succeeded", entityType: "stage_run", entityId: succeeded.id, before: { status: "running" }, after: { status: "succeeded", outputHash: await hash(result.output) }, metadata: { stageKey: succeeded.stageKey, attempt: succeeded.attempt }, createdAt: completedAt });
      return succeeded;
    } catch (error) {
      const completedAt = now(); const message = error instanceof Error ? error.message : "Unknown stage failure";
      const failed: StageRun = { ...running, status: "failed", error: { code: "STAGE_EXECUTION_FAILED", message, retryable: true }, completedAt, updatedAt: completedAt };
      await this.repository.saveStages([failed]); await this.repository.saveWorkflow({ ...activeRun, status: "failed", updatedAt: completedAt });
      await this.audit.append({ id: crypto.randomUUID(), projectId: run.projectId, actorId, eventType: "stage.failed", entityType: "stage_run", entityId: failed.id, before: { status: "running" }, after: { status: "failed", code: failed.error?.code }, metadata: { stageKey: failed.stageKey, attempt: failed.attempt }, createdAt: completedAt });
      return failed;
    }
  }

  async retryFailed(workflowRunId: string, stageKey: string, actorId = "system") {
    const run = await this.requiredRun(workflowRunId); const stages = await this.repository.listStages(workflowRunId); const attempts = stages.filter((stage) => stage.stageKey === stageKey).sort((a, b) => b.attempt - a.attempt); const failed = attempts[0];
    if (!failed || failed.status !== "failed" || failed.error?.retryable !== true) throw new Error("Only the latest retryable failed stage can be retried");
    const retry = createStageRun(workflowRunId, definition(stageKey), failed.attempt + 1); await this.repository.saveStages([retry]); await this.repository.saveWorkflow({ ...run, status: "running", completedAt: null, updatedAt: retry.createdAt });
    await this.audit.append({ id: crypto.randomUUID(), projectId: run.projectId, actorId, eventType: "stage.retry_scheduled", entityType: "stage_run", entityId: retry.id, before: { failedStageRunId: failed.id }, after: { stageKey, attempt: retry.attempt, idempotencyKey: retry.idempotencyKey }, metadata: null, createdAt: retry.createdAt });
    return retry;
  }

  private latestAttempts(stages: StageRun[]) { const map = new Map<string, StageRun>(); for (const stage of stages) if (!map.has(stage.stageKey) || map.get(stage.stageKey)!.attempt < stage.attempt) map.set(stage.stageKey, stage); return map; }
  private availableData(run: WorkflowRun, stages: Map<string, StageRun>) { const data = structuredClone((run.configuration.initialData ?? {}) as Record<string, unknown>); for (const [key, stage] of stages) if (stage.status === "succeeded" && stage.output) data[key] = structuredClone(stage.output); return data; }
  private async requiredRun(id: string) { const run = await this.repository.findWorkflow(id); if (!run) throw new Error("Workflow not found"); return run; }
  private async finishIfComplete(run: WorkflowRun, latest: Map<string, StageRun>) { if (STANDARD_WORKFLOW.every((stage) => latest.get(stage.key)?.status === "succeeded")) { const completedAt = now(); const finished = { ...run, status: "succeeded" as const, completedAt, updatedAt: completedAt }; await this.repository.saveWorkflow(finished); return finished; } return null; }
  private async block(stage: StageRun, run: WorkflowRun, code: string, message: string, actorId: string) { const timestamp = now(); const blocked = { ...stage, status: "blocked" as const, error: { code, message, retryable: false }, completedAt: timestamp, updatedAt: timestamp }; await this.repository.saveStages([blocked]); await this.repository.saveWorkflow({ ...run, status: "review_required", updatedAt: timestamp }); await this.audit.append({ id: crypto.randomUUID(), projectId: run.projectId, actorId, eventType: "stage.blocked", entityType: "stage_run", entityId: stage.id, before: { status: stage.status }, after: { status: "blocked", code }, metadata: { stageKey: stage.stageKey }, createdAt: timestamp }); return blocked; }
}
