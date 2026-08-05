export type StoredAsset = { key: string; contentType: string; sizeBytes: number; sha256: string };
export interface AssetStorage {
  put(key: string, body: ArrayBuffer | ReadableStream, contentType: string, metadata?: Record<string, string>): Promise<StoredAsset>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
