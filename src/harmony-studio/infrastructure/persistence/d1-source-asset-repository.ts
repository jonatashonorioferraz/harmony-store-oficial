import type { SourceAsset, SourceAssetRepository } from "../../application/ports/source-asset-repository.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; project_id: string; kind: string; storage_key: string; content_type: string; size_bytes: number; sha256: string; original_name: string | null; created_at: string };
const map = (row: Row): SourceAsset => ({ id: row.id, projectId: row.project_id, kind: row.kind, storageKey: row.storage_key, contentType: row.content_type, sizeBytes: row.size_bytes, sha256: row.sha256, originalName: row.original_name, createdAt: row.created_at });

export class D1SourceAssetRepository implements SourceAssetRepository {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async save(asset: SourceAsset) { await this.db.prepare("INSERT INTO studio_source_assets (id, project_id, kind, storage_key, content_type, size_bytes, sha256, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(asset.id, asset.projectId, asset.kind, asset.storageKey, asset.contentType, asset.sizeBytes, asset.sha256, asset.originalName, asset.createdAt).run(); }
  async listByProject(projectId: string) { const result = await this.db.prepare("SELECT * FROM studio_source_assets WHERE project_id = ? ORDER BY created_at ASC").bind(projectId).all<Row>(); return (result.results || []).map(map); }
}
