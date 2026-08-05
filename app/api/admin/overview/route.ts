import { requireStudioAdmin, adminDb, adminError } from "../shared.ts";

export async function GET() {
  try {
    const user = await requireStudioAdmin(); const db = adminDb();
    const [knowledge, excellence, settings, events, projects] = await Promise.all([
      db.prepare("SELECT id, agent_role, version, status, content_json, change_reason, created_by, created_at, published_at FROM studio_agent_knowledge_versions ORDER BY agent_role, version DESC").all(),
      db.prepare("SELECT id, artifact_type, marketplace, product_category, agent_role, approval_reason, tags_json, status, created_at FROM studio_excellence_items ORDER BY created_at DESC LIMIT 50").all(),
      db.prepare("SELECT id, key, version, value_json, status, change_reason, created_by, created_at FROM studio_configuration_versions ORDER BY key, version DESC").all(),
      db.prepare("SELECT id, actor_id, event_type, entity_type, entity_id, created_at FROM studio_audit_events ORDER BY created_at DESC LIMIT 80").all(),
      db.prepare("SELECT status, COUNT(*) AS total FROM studio_ad_projects GROUP BY status").all(),
    ]);
    const parse = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
    return Response.json({ user, knowledge: (knowledge.results ?? []).map((row: any) => ({ ...row, content: parse(row.content_json), content_json: undefined })), excellence: (excellence.results ?? []).map((row: any) => ({ ...row, tags: parse(row.tags_json), tags_json: undefined })), settings: (settings.results ?? []).map((row: any) => ({ ...row, value: parse(row.value_json), value_json: undefined })), events: events.results ?? [], projects: projects.results ?? [] });
  } catch (error) { return adminError(error); }
}
