import { requireStudioAdmin, adminDb, adminError, audit } from "../shared.ts";
export async function POST(request: Request) {
  try {
    const user = await requireStudioAdmin(); const body = await request.json(); if (body.action !== "retire" || typeof body.id !== "string") throw new Error("Ação inválida");
    const db = adminDb(); const current = await db.prepare("SELECT id, status FROM studio_excellence_items WHERE id = ?").bind(body.id).first<any>(); if (!current) throw new Error("Referência não encontrada");
    const now = new Date().toISOString(); await db.prepare("UPDATE studio_excellence_items SET status = 'retired', retired_at = ? WHERE id = ?").bind(now, body.id).run();
    await audit({ actorId: user.id, eventType: "excellence.item_retired", entityType: "excellence_item", entityId: body.id, before: current, after: { ...current, status: "retired", retired_at: now } }); return Response.json({ ok: true });
  } catch (error) { return adminError(error); }
}
