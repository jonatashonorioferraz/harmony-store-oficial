export type SourceAsset = {
  id: string;
  projectId: string;
  kind: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  originalName: string | null;
  createdAt: string;
};

export interface SourceAssetRepository {
  save(asset: SourceAsset): Promise<void>;
  listByProject(projectId: string): Promise<SourceAsset[]>;
}
