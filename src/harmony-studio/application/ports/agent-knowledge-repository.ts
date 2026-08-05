import type { AgentKnowledgeVersion, AgentRole } from "../../domain/intelligence/agent-knowledge.ts";

export interface AgentKnowledgeRepository {
  nextVersion(role: AgentRole): Promise<number>;
  save(version: AgentKnowledgeVersion): Promise<void>;
  findById(id: string): Promise<AgentKnowledgeVersion | null>;
  findPublished(role: AgentRole): Promise<AgentKnowledgeVersion | null>;
  list(role?: AgentRole): Promise<AgentKnowledgeVersion[]>;
}
