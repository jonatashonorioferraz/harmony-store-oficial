import type { AgentKnowledgeRepository } from "../../application/ports/agent-knowledge-repository.ts";
import type { AgentKnowledgeVersion, AgentRole } from "../../domain/intelligence/agent-knowledge.ts";

export class InMemoryAgentKnowledgeRepository implements AgentKnowledgeRepository {
  private readonly versions = new Map<string, AgentKnowledgeVersion>();

  async nextVersion(role: AgentRole) { const items = await this.list(role); return Math.max(0, ...items.map((item) => item.version)) + 1; }
  async save(version: AgentKnowledgeVersion) { this.versions.set(version.id, structuredClone(version)); }
  async findById(id: string) { const item = this.versions.get(id); return item ? structuredClone(item) : null; }
  async findPublished(role: AgentRole) { return (await this.list(role)).find((item) => item.status === "published") ?? null; }
  async list(role?: AgentRole) { return [...this.versions.values()].filter((item) => !role || item.agentRole === role).sort((a, b) => b.version - a.version).map((item) => structuredClone(item)); }
}
