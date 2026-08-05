import type { GeneratedAssetSink } from "../../application/ports/generated-asset-sink.ts";
import type { AssetStorage } from "../../application/ports/asset-storage.ts";
import type { D1DatabasePort } from "../persistence/d1-types.ts";

function decode(base64: string) { const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes.buffer; }
export class D1R2GeneratedAssetSink implements GeneratedAssetSink {
  private readonly db: D1DatabasePort; private readonly storage: AssetStorage;
  constructor(db: D1DatabasePort, storage: AssetStorage) { this.db = db; this.storage = storage; }
  async store(input: { idempotencyKey: string; base64: string; contentType: string }) {
    const storageKey = `generated/${input.idempotencyKey.replace(/[^a-zA-Z0-9:._-]/g, "-")}.png`; const existing = await this.db.prepare("SELECT id FROM studio_source_assets WHERE storage_key = ?").bind(storageKey).first<{ id: string }>(); if (existing) return { assetId: existing.id };
    const workflowRunId = input.idempotencyKey.split(":")[0]; const workflow = await this.db.prepare("SELECT project_id FROM studio_workflow_runs WHERE id = ?").bind(workflowRunId).first<{ project_id: string }>(); if (!workflow) throw new Error("Workflow not found for generated asset");
    const stored = await this.storage.put(storageKey, decode(input.base64), input.contentType, { projectId: workflow.project_id, idempotencyKey: input.idempotencyKey }); const id = crypto.randomUUID();
    try { await this.db.prepare("INSERT INTO studio_source_assets (id, project_id, kind, storage_key, content_type, size_bytes, sha256, original_name, created_at) VALUES (?, ?, 'candidate', ?, ?, ?, ?, ?, ?)").bind(id, workflow.project_id, storageKey, stored.contentType, stored.sizeBytes, stored.sha256, "generated-candidate.png", new Date().toISOString()).run(); }
    catch (error) { await this.storage.delete(storageKey); throw error; }
    return { assetId: id };
  }
}
