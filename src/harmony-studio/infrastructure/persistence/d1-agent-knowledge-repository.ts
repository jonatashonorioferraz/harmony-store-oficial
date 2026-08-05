import type { AgentKnowledgeRepository } from "../../application/ports/agent-knowledge-repository.ts";
import type { AgentKnowledgeVersion, AgentRole } from "../../domain/intelligence/agent-knowledge.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; agent_role: AgentRole; version: number; status: AgentKnowledgeVersion["status"]; content_json: string; change_reason: string; created_by: string; created_at: string; published_at: string | null; archived_at: string | null };
const map = (row: Row): AgentKnowledgeVersion => ({ id: row.id, agentRole: row.agent_role, version: row.version, status: row.status, content: JSON.parse(row.content_json), changeReason: row.change_reason, createdBy: row.created_by, createdAt: row.created_at, publishedAt: row.published_at, archivedAt: row.archived_at });

export class D1AgentKnowledgeRepository implements AgentKnowledgeRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async nextVersion(role: AgentRole) { const row = await this.db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM studio_agent_knowledge_versions WHERE agent_role = ?").bind(role).first<{ next_version: number }>(); return Number(row?.next_version || 1); }
  async save(item: AgentKnowledgeVersion) { await this.db.prepare(`INSERT INTO studio_agent_knowledge_versions (id, agent_role, version, status, content_json, change_reason, created_by, created_at, published_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, content_json=excluded.content_json, published_at=excluded.published_at, archived_at=excluded.archived_at`).bind(item.id, item.agentRole, item.version, item.status, JSON.stringify(item.content), item.changeReason, item.createdBy, item.createdAt, item.publishedAt, item.archivedAt).run(); }
  async findById(id: string) { const row = await this.db.prepare("SELECT * FROM studio_agent_knowledge_versions WHERE id = ?").bind(id).first<Row>(); return row ? map(row) : null; }
  async findPublished(role: AgentRole) { const row = await this.db.prepare("SELECT * FROM studio_agent_knowledge_versions WHERE agent_role = ? AND status = 'published' ORDER BY version DESC LIMIT 1").bind(role).first<Row>(); return row ? map(row) : null; }
  async list(role?: AgentRole) { const result = role ? await this.db.prepare("SELECT * FROM studio_agent_knowledge_versions WHERE agent_role = ? ORDER BY version DESC").bind(role).all<Row>() : await this.db.prepare("SELECT * FROM studio_agent_knowledge_versions ORDER BY agent_role, version DESC").all<Row>(); return (result.results || []).map(map); }
}
