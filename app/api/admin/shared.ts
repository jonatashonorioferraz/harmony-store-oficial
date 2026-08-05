import { getChatGPTUser } from "../../chatgpt-auth.ts";
import { getStudioBindings } from "../../../src/harmony-studio/infrastructure/runtime/studio-bindings.ts";
import { AGENT_ROLES, type AgentRole } from "../../../src/harmony-studio/domain/intelligence/agent-knowledge.ts";

export async function requireStudioAdmin() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  const allowed = (process.env.STUDIO_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(user.email.toLowerCase())) throw new Error("ADMIN_REQUIRED");
  return user;
}

export function adminDb() { return getStudioBindings().DB; }
export function isAgentRole(value: unknown): value is AgentRole { return typeof value === "string" && AGENT_ROLES.includes(value as AgentRole); }
export function adminError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha administrativa";
  const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 400;
  return Response.json({ error: status === 401 ? "Entre na sua conta para continuar" : status === 403 ? "Acesso restrito à administração" : message }, { status });
}

export async function audit(input: { actorId: string; eventType: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: unknown }) {
  const now = new Date().toISOString();
  await adminDb().prepare("INSERT INTO studio_audit_events (id, project_id, actor_id, event_type, entity_type, entity_id, before_json, after_json, metadata_json, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), input.actorId, input.eventType, input.entityType, input.entityId, input.before == null ? null : JSON.stringify(input.before), input.after == null ? null : JSON.stringify(input.after), input.metadata == null ? null : JSON.stringify(input.metadata), now).run();
}
