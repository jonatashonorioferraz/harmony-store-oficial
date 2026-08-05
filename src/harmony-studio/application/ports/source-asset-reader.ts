export interface SourceAssetReader { read(assetId: string): Promise<{ blob: Blob; name: string; contentType: string }>; }
