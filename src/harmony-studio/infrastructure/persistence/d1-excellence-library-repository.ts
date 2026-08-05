import type { ExcellenceLibraryRepository, ExcellenceSearch } from "../../application/ports/excellence-library-repository.ts";
import type { ExcellenceArtifactType, ExcellenceItem, ExcellenceStatus } from "../../domain/excellence/excellence-item.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; project_id: string; candidate_id: string; review_decision_id: string; artifact_type: ExcellenceArtifactType; marketplace: string; product_category: string; agent_role: string; context_json: string; decisions_json: string; approval_reason: string; tags_json: string; status: ExcellenceStatus; created_by: string; created_at: string; retired_at: string | null };
const map = (row: Row): ExcellenceItem => ({ id: row.id, projectId: row.project_id, candidateId: row.candidate_id, reviewDecisionId: row.review_decision_id, artifactType: row.artifact_type, marketplace: row.marketplace, productCategory: row.product_category, agentRole: row.agent_role, context: JSON.parse(row.context_json), decisions: JSON.parse(row.decisions_json), approvalReason: row.approval_reason, tags: JSON.parse(row.tags_json), status: row.status, createdBy: row.created_by, createdAt: row.created_at, retiredAt: row.retired_at });

export class D1ExcellenceLibraryRepository implements ExcellenceLibraryRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async save(item: ExcellenceItem) { await this.db.prepare(`INSERT INTO studio_excellence_items (id, project_id, candidate_id, review_decision_id, artifact_type, marketplace, product_category, agent_role, context_json, decisions_json, approval_reason, tags_json, status, created_by, created_at, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET context_json=excluded.context_json, decisions_json=excluded.decisions_json, approval_reason=excluded.approval_reason, tags_json=excluded.tags_json, status=excluded.status, retired_at=excluded.retired_at`).bind(item.id, item.projectId, item.candidateId, item.reviewDecisionId, item.artifactType, item.marketplace, item.productCategory, item.agentRole, JSON.stringify(item.context), JSON.stringify(item.decisions), item.approvalReason, JSON.stringify(item.tags), item.status, item.createdBy, item.createdAt, item.retiredAt).run(); }
  async findById(id: string) { const row = await this.db.prepare("SELECT * FROM studio_excellence_items WHERE id = ?").bind(id).first<Row>(); return row ? map(row) : null; }
  async findByCandidateId(candidateId: string) { const row = await this.db.prepare("SELECT * FROM studio_excellence_items WHERE candidate_id = ?").bind(candidateId).first<Row>(); return row ? map(row) : null; }
  async searchActive(filters: ExcellenceSearch) {
    const clauses = ["status = 'active'"];
    const values: unknown[] = [];
    if (filters.artifactType) { clauses.push("artifact_type = ?"); values.push(filters.artifactType); }
    if (filters.marketplace) { clauses.push("marketplace = ?"); values.push(filters.marketplace); }
    if (filters.productCategory) { clauses.push("product_category = ?"); values.push(filters.productCategory); }
    if (filters.agentRole) { clauses.push("agent_role = ?"); values.push(filters.agentRole); }
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 50);
    values.push(limit);
    const result = await this.db.prepare(`SELECT * FROM studio_excellence_items WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`).bind(...values).all<Row>();
    return (result.results || []).map(map);
  }
}
