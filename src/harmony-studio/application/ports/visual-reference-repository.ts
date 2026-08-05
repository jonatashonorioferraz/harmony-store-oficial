export type VisualShotType = "catalog-cover" | "product-detail" | "variations" | "use-occasion" | "versatile-composition";
export type VisualReference = { id: string; title: string; shotType: VisualShotType; transferMode: "style" | "style-composition" | "scenario" | "lighting"; guidance: string; neverDo: string[] };
export interface VisualReferenceRepository { search(input: { category: string; modelName: string; shotType: VisualShotType; limit?: number }): Promise<VisualReference[]>; }
