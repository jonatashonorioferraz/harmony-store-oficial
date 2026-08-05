import type { AuditEvent, AuditEventRepository } from "../../application/ports/audit-event-repository.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; project_id: string | null; actor_id: string; event_type: string; entity_type: string; entity_id: string; before_json: string | null; after_json: string | null; metadata_json: string | null; created_at: string };
const parse = (value: string | null) => value ? JSON.parse(value) : null;
export class D1AuditEventRepository implements AuditEventRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async append(item: AuditEvent) { await this.db.prepare("INSERT INTO studio_audit_events (id, project_id, actor_id, event_type, entity_type, entity_id, before_json, after_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, item.projectId, item.actorId, item.eventType, item.entityType, item.entityId, JSON.stringify(item.before), JSON.stringify(item.after), JSON.stringify(item.metadata), item.createdAt).run(); }
  async listByProject(projectId: string) { const result = await this.db.prepare("SELECT * FROM studio_audit_events WHERE project_id = ? ORDER BY created_at ASC").bind(projectId).all<Row>(); return (result.results || []).map((row) => ({ id: row.id, projectId: row.project_id, actorId: row.actor_id, eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id, before: parse(row.before_json), after: parse(row.after_json), metadata: parse(row.metadata_json), createdAt: row.created_at })); }
}
