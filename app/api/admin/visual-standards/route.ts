import { requireStudioAdmin, adminDb, adminError, audit } from "../shared.ts";

const shots = ["catalog-cover", "product-detail", "variations", "purchase-contents", "use-occasion", "product-size"];
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export async function POST(request: Request) {
  try {
    const user = await requireStudioAdmin(); const db = adminDb(); const body = await request.json() as any; const category = String(body.category ?? "").trim(); const shotType = String(body.shotType ?? "");
    if (!category || !shots.includes(shotType)) throw new Error("Categoria ou função fotográfica inválida");
    if (body.action === "consolidate") {
      const rows = await db.prepare("SELECT id, guidance, never_do_json, analysis_json FROM studio_visual_references WHERE status = 'active' AND analysis_status = 'approved' AND category = ? AND shot_type = ? ORDER BY approved_at DESC").bind(category, shotType).all();
      const references = (rows.results ?? []) as any[]; if (references.length < 3) throw new Error("Aprove ao menos três referências desta função antes de consolidar o manual");
      const analyses = references.map((row) => JSON.parse(row.analysis_json || "{}")); const specification = { composition: unique(analyses.map((item) => item.composition)), lighting: unique(analyses.map((item) => item.lighting)), background: unique(analyses.map((item) => item.background)), palette: unique(analyses.map((item) => item.palette)), typography: unique(analyses.map((item) => item.typography)), requiredElements: unique(analyses.flatMap((item) => list(item.transferableTraits))), forbiddenElements: unique(references.flatMap((row) => list(JSON.parse(row.never_do_json || "[]"))).concat(analyses.flatMap((item) => list(item.risks)))), approvalChecklist: ["Produto idêntico às quatro fotos de entrada", "Função comercial desta imagem cumprida", "Nenhum item ou atributo inventado", "Acabamento compatível com o padrão Harmony"] };
      const latest = await db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM studio_visual_standard_versions WHERE category = ? AND shot_type = ?").bind(category, shotType).first<any>(); const version = Number(latest?.version ?? 0) + 1; const id = crypto.randomUUID(); const now = new Date().toISOString();
      await db.prepare("INSERT INTO studio_visual_standard_versions (id, category, shot_type, version, status, purpose, specification_json, source_reference_ids_json, change_reason, created_by, created_at, published_at, archived_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL)").bind(id, category, shotType, version, `Padrão Harmony para ${shotType}`, JSON.stringify(specification), JSON.stringify(references.map((row) => row.id)), String(body.reason ?? "Consolidação de referências aprovadas"), user.id, now).run();
      await audit({ actorId: user.id, eventType: "visual_standard.draft_created", entityType: "visual_standard", entityId: id, after: { category, shotType, version, sourceCount: references.length } }); return Response.json({ id, version, specification });
    }
    if (body.action === "publish" && body.id) {
      const now = new Date().toISOString(); await db.prepare("UPDATE studio_visual_standard_versions SET status = 'archived', archived_at = ? WHERE category = ? AND shot_type = ? AND status = 'published'").bind(now, category, shotType).run(); await db.prepare("UPDATE studio_visual_standard_versions SET status = 'published', published_at = ?, archived_at = NULL WHERE id = ? AND category = ? AND shot_type = ? AND status = 'draft'").bind(now, body.id, category, shotType).run(); await audit({ actorId: user.id, eventType: "visual_standard.published", entityType: "visual_standard", entityId: body.id, after: { category, shotType } }); return Response.json({ ok: true });
    }
    throw new Error("Ação inválida");
  } catch (error) { return adminError(error); }
}
