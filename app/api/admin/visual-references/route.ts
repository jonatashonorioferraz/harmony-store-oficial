import { requireStudioAdmin, adminDb, adminError, audit } from "../shared.ts";
import { getStudioBindings } from "../../../../src/harmony-studio/infrastructure/runtime/studio-bindings.ts";
import { R2AssetStorage, type R2BucketPort } from "../../../../src/harmony-studio/infrastructure/storage/r2-asset-storage.ts";

const scopes = ["global", "category", "model"];
const shots = ["catalog-cover", "product-detail", "variations", "use-occasion", "versatile-composition"];
const transfers = ["style", "style-composition", "scenario", "lighting"];
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const user = await requireStudioAdmin(); const db = adminDb(); const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) { const body = await request.json() as any; if (body.action !== "retire" || !body.id) throw new Error("Ação inválida"); const now = new Date().toISOString(); await db.prepare("UPDATE studio_visual_references SET status = 'retired', retired_at = ? WHERE id = ? AND status = 'active'").bind(now, body.id).run(); await audit({ actorId: user.id, eventType: "visual_reference.retired", entityType: "visual_reference", entityId: body.id }); return Response.json({ ok: true }); }
    const form = await request.formData(); const image = form.get("image"); const title = String(form.get("title") ?? "").trim(); const scope = String(form.get("scope") ?? ""); const category = String(form.get("category") ?? "").trim(); const modelName = String(form.get("modelName") ?? "").trim(); const shotType = String(form.get("shotType") ?? ""); const transferMode = String(form.get("transferMode") ?? ""); const guidance = String(form.get("guidance") ?? "").trim(); const neverDo = String(form.get("neverDo") ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 10_000_000) throw new Error("Envie uma imagem JPG, PNG ou WebP de até 10 MB");
    if (!title || !guidance || !scopes.includes(scope) || !shots.includes(shotType) || !transfers.includes(transferMode)) throw new Error("Preencha todos os campos obrigatórios");
    if (scope !== "global" && !category) throw new Error("Escolha a categoria desta referência"); if (scope === "model" && !modelName) throw new Error("Informe o modelo relacionado");
    const id = crypto.randomUUID(); const key = `visual-learning/${id}/${image.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`; const storage = new R2AssetStorage(getStudioBindings().STUDIO_ASSETS as R2BucketPort); const stored = await storage.put(key, await image.arrayBuffer(), image.type, { kind: "visual-reference", createdBy: user.id }); const now = new Date().toISOString();
    try { await db.prepare("INSERT INTO studio_visual_references (id, title, scope, category, model_name, shot_type, transfer_mode, guidance, never_do_json, storage_key, content_type, size_bytes, sha256, status, created_by, created_at, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)").bind(id, title, scope, scope === "global" ? null : category, scope === "model" ? modelName : null, shotType, transferMode, guidance, JSON.stringify(neverDo), stored.key, stored.contentType, stored.sizeBytes, stored.sha256, user.id, now).run(); } catch (error) { await storage.delete(key); throw error; }
    await audit({ actorId: user.id, eventType: "visual_reference.created", entityType: "visual_reference", entityId: id, after: { title, scope, category, modelName, shotType, transferMode } }); return Response.json({ id });
  } catch (error) { return adminError(error); }
}
