export type VisualShotType = "catalog-cover" | "product-detail" | "variations" | "purchase-contents" | "use-occasion" | "product-size";
export type VisualReference = { id: string; title: string; shotType: VisualShotType; transferMode: "style" | "style-composition" | "scenario" | "lighting"; guidance: string; neverDo: string[]; analysis?: Record<string,unknown> | null };
export interface VisualReferenceRepository { search(input: { category: string; modelName: string; shotType: VisualShotType; limit?: number; preferredId?: string }): Promise<VisualReference[]>; }
