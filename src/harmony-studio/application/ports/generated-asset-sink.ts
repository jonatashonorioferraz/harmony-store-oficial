export interface GeneratedAssetSink { store(input: { idempotencyKey: string; base64: string; contentType: string }): Promise<{ assetId: string }>; }
