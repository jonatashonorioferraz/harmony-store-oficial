import type { AssetStorage, StoredAsset } from "../../application/ports/asset-storage.ts";

interface R2ObjectLike { body: ReadableStream; httpMetadata?: { contentType?: string }; }
interface R2BucketPort { put(key: string, body: ArrayBuffer | ReadableStream, options: { httpMetadata: { contentType: string }; customMetadata?: Record<string, string> }): Promise<{ size: number }>; get(key: string): Promise<R2ObjectLike | null>; delete(key: string): Promise<void>; }

export class R2AssetStorage implements AssetStorage {
  private readonly bucket: R2BucketPort;
  constructor(bucket: R2BucketPort) { this.bucket = bucket; }
  async put(key: string, body: ArrayBuffer | ReadableStream, contentType: string, metadata: Record<string, string> = {}): Promise<StoredAsset> {
    const buffer = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const object = await this.bucket.put(key, buffer, { httpMetadata: { contentType }, customMetadata: { ...metadata, sha256: hash } });
    return { key, contentType, sizeBytes: object.size, sha256: hash };
  }
  async get(key: string) { const object = await this.bucket.get(key); return object ? { body: object.body, contentType: object.httpMetadata?.contentType || "application/octet-stream" } : null; }
  async delete(key: string) { await this.bucket.delete(key); }
}
