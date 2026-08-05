import type { WorkflowRunRepository } from "../../application/ports/workflow-run-repository.ts";
import type { WorkflowRun, WorkflowRunStatus } from "../../domain/workflows/workflow-run.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; project_id: string; status: WorkflowRunStatus; configuration_json: string; started_at: string | null; completed_at: string | null; created_at: string; updated_at: string };
const map = (row: Row): WorkflowRun => ({ id: row.id, projectId: row.project_id, status: row.status, configuration: JSON.parse(row.configuration_json), startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at });

export class D1WorkflowRunRepository implements WorkflowRunRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async save(run: WorkflowRun) {
    await this.db.prepare(`INSERT INTO studio_workflow_runs (id, project_id, status, configuration_json, started_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, configuration_json=excluded.configuration_json, started_at=excluded.started_at, completed_at=excluded.completed_at, updated_at=excluded.updated_at`).bind(run.id, run.projectId, run.status, JSON.stringify(run.configuration), run.startedAt, run.completedAt, run.createdAt, run.updatedAt).run();
  }
  async findById(id: string) { const row = await this.db.prepare("SELECT * FROM studio_workflow_runs WHERE id = ?").bind(id).first<Row>(); return row ? map(row) : null; }
  async findLatestRecoverable(projectId: string) { const row = await this.db.prepare("SELECT * FROM studio_workflow_runs WHERE project_id = ? AND status IN ('pending', 'running', 'review_required', 'failed') ORDER BY updated_at DESC LIMIT 1").bind(projectId).first<Row>(); return row ? map(row) : null; }
}
