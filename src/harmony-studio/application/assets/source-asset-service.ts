import type { AssetStorage } from "../ports/asset-storage.ts";
import type { SourceAssetRepository } from "../ports/source-asset-repository.ts";

export class SourceAssetService {
  private readonly storage: AssetStorage;
  private readonly assets: SourceAssetRepository;
  constructor(storage: AssetStorage, assets: SourceAssetRepository) { this.storage = storage; this.assets = assets; }
  async store(input: { id: string; projectId: string; kind: string; originalName: string; contentType: string; body: ArrayBuffer | ReadableStream; now?: string }) {
    const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
    const storageKey = `projects/${input.projectId}/source/${input.id}-${safeName}`;
    const stored = await this.storage.put(storageKey, input.body, input.contentType, { projectId: input.projectId, assetId: input.id, kind: input.kind });
    const asset = { id: input.id, projectId: input.projectId, kind: input.kind, storageKey, contentType: stored.contentType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, originalName: input.originalName, createdAt: input.now ?? new Date().toISOString() };
    try { await this.assets.save(asset); } catch (error) { await this.storage.delete(storageKey); throw error; }
    return asset;
  }
}
