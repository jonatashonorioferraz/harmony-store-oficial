import { requireStudioAdmin, adminDb, adminError } from "../shared.ts";
import { ensureDefaultAgentKnowledge } from "../../../../src/harmony-studio/application/intelligence/bootstrap-agent-knowledge.ts";
import { D1AgentKnowledgeRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-agent-knowledge-repository.ts";

export async function GET() {
  try {
    const user = await requireStudioAdmin(); const db = adminDb(); await ensureDefaultAgentKnowledge(new D1AgentKnowledgeRepository(db), user.id);
    const [knowledge, excellence, settings, events, projects, palettes, visualReferences, visualStandards] = await Promise.all([
      db.prepare("SELECT id, agent_role, version, status, content_json, change_reason, created_by, created_at, published_at FROM studio_agent_knowledge_versions ORDER BY agent_role, version DESC").all(),
      db.prepare("SELECT id, artifact_type, marketplace, product_category, agent_role, approval_reason, tags_json, status, created_at FROM studio_excellence_items ORDER BY created_at DESC LIMIT 50").all(),
      db.prepare("SELECT id, key, version, value_json, status, change_reason, created_by, created_at FROM studio_configuration_versions ORDER BY key, version DESC").all(),
      db.prepare("SELECT id, actor_id, event_type, entity_type, entity_id, created_at FROM studio_audit_events ORDER BY created_at DESC LIMIT 80").all(),
      db.prepare("SELECT status, COUNT(*) AS total FROM studio_ad_projects GROUP BY status").all(),
      db.prepare("SELECT id, category, palette_name, version, options_json, status, change_reason, created_at FROM studio_category_palette_versions ORDER BY category, palette_name, version DESC").all(),
      db.prepare("SELECT id, title, scope, category, model_name, shot_type, transfer_mode, guidance, never_do_json, analysis_json, analysis_status, status, created_at FROM studio_visual_references ORDER BY created_at DESC LIMIT 100").all(),
      db.prepare("SELECT id, category, shot_type, version, status, purpose, specification_json, source_reference_ids_json, reason, created_at, published_at FROM studio_visual_standard_versions ORDER BY category, shot_type, version DESC").all(),
    ]);
    const parse = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
    return Response.json({ user, knowledge: (knowledge.results ?? []).map((row: any) => ({ ...row, content: parse(row.content_json), content_json: undefined })), excellence: (excellence.results ?? []).map((row: any) => ({ ...row, tags: parse(row.tags_json), tags_json: undefined })), settings: (settings.results ?? []).map((row: any) => ({ ...row, value: parse(row.value_json), value_json: undefined })), events: events.results ?? [], projects: projects.results ?? [], palettes: (palettes.results ?? []).map((row: any) => ({ ...row, name: row.palette_name, options: parse(row.options_json), palette_name: undefined, options_json: undefined })), visualReferences: (visualReferences.results ?? []).map((row: any) => ({ ...row, neverDo: parse(row.never_do_json), analysis: parse(row.analysis_json), never_do_json: undefined, analysis_json: undefined, imageUrl: `/api/admin/visual-references/asset?id=${encodeURIComponent(row.id)}` })), visualStandards: (visualStandards.results ?? []).map((row: any) => ({ ...row, specification: parse(row.specification_json), sourceReferenceIds: parse(row.source_reference_ids_json), specification_json: undefined, source_reference_ids_json: undefined })) });
  } catch (error) { return adminError(error); }
}
