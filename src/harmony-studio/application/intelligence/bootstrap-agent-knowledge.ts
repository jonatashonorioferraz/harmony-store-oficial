import { IntelligenceCenter } from "./intelligence-center.ts";
import type { AgentKnowledgeRepository } from "../ports/agent-knowledge-repository.ts";
import { AGENT_ROLES } from "../../domain/intelligence/agent-knowledge.ts";
import { DEFAULT_AGENT_KNOWLEDGE } from "../../intelligence/catalog/default-agents.ts";

export async function ensureDefaultAgentKnowledge(repository: AgentKnowledgeRepository, actorId: string) {
  const center = new IntelligenceCenter(repository);
  for (const role of AGENT_ROLES) {
    if (await repository.findPublished(role)) continue;
    const draft = await center.createDraft({ agentRole: role, content: DEFAULT_AGENT_KNOWLEDGE[role], changeReason: "Catálogo inicial aprovado nas Fases 2 a 6", createdBy: actorId });
    await center.publish(draft.id);
  }
}
