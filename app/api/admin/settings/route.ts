import { requireStudioAdmin, adminDb, adminError, audit } from "../shared.ts";

const ALLOWED = new Set(["brandName", "marketplaceTitleLimit", "minimumQualityScore", "maxProjectBudgetUsd"]);
export async function POST(request: Request) {
  try {
    const user = await requireStudioAdmin(); const body = await request.json();
    if (!ALLOWED.has(body.key) || !String(body.changeReason ?? "").trim()) throw new Error("Parâmetro ou motivo inválido");
    const db = adminDb(); const previous = await db.prepare("SELECT * FROM studio_configuration_versions WHERE key = ? AND status = 'active' ORDER BY version DESC LIMIT 1").bind(body.key).first<any>();
    const version = Number(previous?.version ?? 0) + 1; const id = crypto.randomUUID(); const now = new Date().toISOString();
    const statements = []; if (previous) statements.push(db.prepare("UPDATE studio_configuration_versions SET status = 'superseded' WHERE id = ?").bind(previous.id));
    statements.push(db.prepare("INSERT INTO studio_configuration_versions (id, key, version, value_json, status, change_reason, created_by, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)").bind(id, body.key, version, JSON.stringify(body.value), String(body.changeReason).trim(), user.id, now)); await db.batch(statements);
    const saved = { id, key: body.key, version, value: body.value, status: "active", change_reason: String(body.changeReason).trim(), created_by: user.id, created_at: now };
    await audit({ actorId: user.id, eventType: "configuration.version_published", entityType: "configuration", entityId: id, before: previous ? { id: previous.id, version: previous.version } : null, after: saved }); return Response.json(saved, { status: 201 });
  } catch (error) { return adminError(error); }
}
