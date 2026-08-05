import { archiveVersion, createDraftVersion, publishVersion, type AgentKnowledgeVersion, type AgentRole, type CreateAgentDraftInput } from "../../domain/intelligence/agent-knowledge.ts";
import type { AgentKnowledgeRepository } from "../ports/agent-knowledge-repository.ts";

export class IntelligenceCenter {
  private readonly repository: AgentKnowledgeRepository;

  constructor(repository: AgentKnowledgeRepository) { this.repository = repository; }

  async createDraft(input: CreateAgentDraftInput) {
    const draft = createDraftVersion(input, await this.repository.nextVersion(input.agentRole));
    await this.repository.save(draft);
    return draft;
  }

  async publish(draftId: string) {
    const draft = await this.required(draftId);
    const current = await this.repository.findPublished(draft.agentRole);
    if (current) await this.repository.save(archiveVersion(current));
    const published = publishVersion(draft);
    await this.repository.save(published);
    return published;
  }

  async getPublished(role: AgentRole) {
    const version = await this.repository.findPublished(role);
    if (!version) throw new Error(`No published knowledge for ${role}`);
    return version;
  }

  async history(role?: AgentRole) { return this.repository.list(role); }

  private async required(id: string): Promise<AgentKnowledgeVersion> {
    const version = await this.repository.findById(id);
    if (!version) throw new Error(`Knowledge version not found: ${id}`);
    return version;
  }
}
