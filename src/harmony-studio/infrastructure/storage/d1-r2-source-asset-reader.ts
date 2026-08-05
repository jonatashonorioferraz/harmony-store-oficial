import type { SourceAssetReader } from "../../application/ports/source-asset-reader.ts";
import type { AssetStorage } from "../../application/ports/asset-storage.ts";
import type { D1DatabasePort } from "../persistence/d1-types.ts";
export class D1R2SourceAssetReader implements SourceAssetReader {
  private readonly db: D1DatabasePort; private readonly storage: AssetStorage;
  constructor(db: D1DatabasePort, storage: AssetStorage) { this.db = db; this.storage = storage; }
  async read(assetId: string) { const row = await this.db.prepare("SELECT storage_key, content_type, original_name FROM studio_source_assets WHERE id = ?").bind(assetId).first<{ storage_key: string; content_type: string; original_name: string | null }>(); if (!row) throw new Error("Source asset not found"); const stored = await this.storage.get(row.storage_key); if (!stored) throw new Error("Source asset bytes not found"); return { blob: new Blob([await new Response(stored.body).arrayBuffer()], { type: row.content_type }), name: row.original_name ?? `${assetId}.png`, contentType: row.content_type }; }
}
