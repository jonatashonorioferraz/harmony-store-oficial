import { IntelligenceCenter } from "../../../../src/harmony-studio/application/intelligence/intelligence-center.ts";
import { D1AgentKnowledgeRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-agent-knowledge-repository.ts";
import { requireStudioAdmin, adminDb, adminError, isAgentRole, audit } from "../shared.ts";

export async function POST(request: Request) {
  try {
    const user = await requireStudioAdmin(); const body = await request.json(); const center = new IntelligenceCenter(new D1AgentKnowledgeRepository(adminDb()));
    if (body.action === "draft") {
      if (!isAgentRole(body.agentRole) || !body.content || typeof body.changeReason !== "string") throw new Error("Dados da nova versão são inválidos");
      const created = await center.createDraft({ agentRole: body.agentRole, content: body.content, changeReason: body.changeReason, createdBy: user.id });
      await audit({ actorId: user.id, eventType: "knowledge.draft_created", entityType: "agent_knowledge", entityId: created.id, after: { agentRole: created.agentRole, version: created.version, changeReason: created.changeReason } });
      return Response.json(created, { status: 201 });
    }
    if (body.action === "publish" && typeof body.id === "string") {
      const published = await center.publish(body.id); await audit({ actorId: user.id, eventType: "knowledge.version_published", entityType: "agent_knowledge", entityId: published.id, after: { agentRole: published.agentRole, version: published.version } }); return Response.json(published);
    }
    throw new Error("Ação administrativa inválida");
  } catch (error) { return adminError(error); }
}
