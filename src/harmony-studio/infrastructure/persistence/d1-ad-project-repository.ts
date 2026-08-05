import type { AdProjectRepository } from "../../application/ports/ad-project-repository.ts";
import type { AdProject } from "../../domain/projects/ad-project.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; owner_id: string; name: string; marketplace: string; status: AdProject["status"]; active_workflow_run_id: string | null; created_at: string; updated_at: string };
const map = (row: Row): AdProject => ({ id: row.id, ownerId: row.owner_id, name: row.name, marketplace: row.marketplace, status: row.status, activeWorkflowRunId: row.active_workflow_run_id, createdAt: row.created_at, updatedAt: row.updated_at });
export class D1AdProjectRepository implements AdProjectRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async save(item: AdProject) { await this.db.prepare(`INSERT INTO studio_ad_projects (id, owner_id, name, marketplace, status, active_workflow_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, marketplace=excluded.marketplace, status=excluded.status, active_workflow_run_id=excluded.active_workflow_run_id, updated_at=excluded.updated_at`).bind(item.id, item.ownerId, item.name, item.marketplace, item.status, item.activeWorkflowRunId, item.createdAt, item.updatedAt).run(); }
  async findById(id: string) { const row = await this.db.prepare("SELECT * FROM studio_ad_projects WHERE id = ?").bind(id).first<Row>(); return row ? map(row) : null; }
  async listByOwner(ownerId: string) { const result = await this.db.prepare("SELECT * FROM studio_ad_projects WHERE owner_id = ? ORDER BY updated_at DESC").bind(ownerId).all<Row>(); return (result.results || []).map(map); }
}
