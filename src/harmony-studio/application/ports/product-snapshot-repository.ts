export type ProductSnapshot = { id: string; projectId: string; version: number; facts: Record<string, unknown>; createdBy: string; createdAt: string };
export interface ProductSnapshotRepository { save(snapshot: ProductSnapshot): Promise<void>; }
